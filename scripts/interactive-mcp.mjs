#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { createInterface as createLineInterface } from 'node:readline';
import { createInterface as createPromptInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const distEntry = join(projectRoot, 'dist', 'index.js');

if (!existsSync(distEntry)) {
  console.error('✖ dist/index.js not found. Run "npm run build" before starting the interactive client.');
  process.exit(1);
}

const server = spawn('node', [distEntry], {
  stdio: ['pipe', 'pipe', 'pipe']
});

const pending = new Map();
let nextRequestId = 1;
let serverExited = false;
let exitInfo = { code: null, signal: null };
const stderrLogs = [];

server.on('error', error => {
  console.error('✖ Failed to start MCP server:', error);
  process.exitCode = 1;
});

server.on('exit', (code, signal) => {
  serverExited = true;
  exitInfo = { code, signal };
  for (const pendingEntry of pending.values()) {
    pendingEntry.reject(new Error('Server exited before responding.'));
    clearTimeout(pendingEntry.timeoutId);
  }
  pending.clear();
});

server.stderr.setEncoding('utf8');
server.stderr.on('data', chunk => {
  const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    stderrLogs.push(line);
    console.error(`[server] ${line}`);
  }
});

const stdoutParser = createLineInterface({ input: server.stdout });
stdoutParser.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  try {
    const message = JSON.parse(trimmed);
    if (typeof message.id === 'undefined') {
      return;
    }

    const pendingEntry = pending.get(message.id);
    if (!pendingEntry) {
      return;
    }

    if (message.error) {
      pendingEntry.reject(new Error(message.error.message ?? 'Unknown JSON-RPC error'));
    } else {
      pendingEntry.resolve(message.result);
    }

    clearTimeout(pendingEntry.timeoutId);
    pending.delete(message.id);
  } catch (error) {
    console.error('✖ Failed to parse server output:', error);
    process.exitCode = 1;
  }
});

function sendPayload(payload) {
  server.stdin.write(JSON.stringify(payload) + '\n');
}

function sendRequest(method, params, { timeout = 10000 } = {}) {
  const id = nextRequestId++;
  const payload = {
    jsonrpc: JSONRPC_VERSION,
    id,
    method,
    params
  };

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for response to ${method}`));
    }, timeout);

    pending.set(id, { resolve, reject, timeoutId });
    sendPayload(payload);
  });
}

function sendNotification(method, params) {
  sendPayload({ jsonrpc: JSONRPC_VERSION, method, params });
}

function stripWrappingQuotes(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function coerceValue(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true';
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) {
      return num;
    }
  }
  return trimmed;
}

function ensureMarkdownFilename(candidate) {
  if (typeof candidate !== 'string') {
    return candidate;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.toLowerCase().endsWith('.md')) {
    return trimmed;
  }
  return `${trimmed}.md`;
}

function normalizeArgsForTool(toolName, args) {
  const normalized = { ...(args ?? {}) };
  if (typeof normalized.filename === 'string') {
    normalized.filename = ensureMarkdownFilename(normalized.filename);
  }
  if (toolName === 'search_docs' && typeof normalized.query === 'string') {
    normalized.query = normalized.query.trim();
  }
  return normalized;
}

function parseKeyValueArgs(raw) {
  const tokens = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!tokens) {
    return null;
  }
  const result = {};
  for (const token of tokens) {
    const eqIdx = token.indexOf('=');
    if (eqIdx === -1) {
      return null;
    }
    const key = token.slice(0, eqIdx).trim();
    if (!key) {
      return null;
    }
    let value = token.slice(eqIdx + 1);
    value = stripWrappingQuotes(value);
    result[key] = coerceValue(value);
  }
  return Object.keys(result).length > 0 ? result : null;
}

function getExampleArgs(toolName) {
  switch (toolName) {
    case 'read_doc':
      return '{"filename":"buying_ai.md"}';
    case 'search_docs':
      return '{"query":"risk assessment"}';
    case 'write_doc':
      return '{"filename":"notes.md","content":"...","overwrite":false}';
    default:
      return '{"key":"value"}';
  }
}

function buildArgsFromInline(raw, toolMeta) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const toolName = toolMeta?.name ?? '';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const normalized = normalizeArgsForTool(toolName, parsed);
      return { args: normalized, raw: JSON.stringify(normalized) };
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
  }

  const kvArgs = parseKeyValueArgs(trimmed);
  if (kvArgs) {
    const normalized = normalizeArgsForTool(toolName, kvArgs);
    return { args: normalized, raw: JSON.stringify(normalized) };
  }

  const schema = toolMeta?.inputSchema;
  if (schema && schema.type === 'object') {
    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties = schema.properties ?? {};
    let targetKey = required.length === 1 ? required[0] : undefined;
    if (!targetKey) {
      if (properties?.filename) {
        targetKey = 'filename';
      } else if (properties?.query) {
        targetKey = 'query';
      }
    }
    if (targetKey) {
      const value = coerceValue(stripWrappingQuotes(trimmed));
      const normalized = normalizeArgsForTool(toolName, { [targetKey]: value });
      return { args: normalized, raw: JSON.stringify(normalized) };
    }
  }

  throw new Error('Could not infer arguments from inline input.');
}

function formatContent(result) {
  if (!result) {
    return 'No result received.';
  }

  const sections = [];

  if (Array.isArray(result.content) && result.content.length > 0) {
    const textBlocks = result.content
      .map(block => {
        if (block.type === 'text') {
          return block.text;
        }
        return `${block.type}: ${JSON.stringify(block)}`;
      })
      .join('\n');
    sections.push(textBlocks);
  }

  if (result.structuredContent) {
    sections.push('Structured content:\n' + JSON.stringify(result.structuredContent, null, 2));
  }

  if (result.isError) {
    sections.push('The tool reported an error flag.');
  }

  if (sections.length === 0) {
    return 'No content returned by tool.';
  }

  return sections.join('\n\n');
}

async function initialize() {
  const result = await sendRequest('initialize', {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'ai-playbook-mcp-interactive-client',
      version: '1.0.0'
    }
  });

  if (!result?.capabilities?.tools) {
    throw new Error('Server did not advertise tool capability during initialize.');
  }

  sendNotification('notifications/initialized', undefined);
  return result;
}

async function interactiveLoop(initialTools = []) {
  const rl = createPromptInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY
  });

  rl.on('SIGINT', () => {
    if (!process.stdin.isTTY) {
      return;
    }
    process.stdout.write('\nUse "quit" to exit.\n');
  });

  let cachedTools = initialTools;
  const lastArgsRaw = new Map();

  const fetchTools = async () => {
    const listResult = await sendRequest('tools/list');
    cachedTools = listResult?.tools ?? [];
    return cachedTools;
  };

  const ensureToolMetadata = async (toolName) => {
    if (!cachedTools.some(tool => tool.name === toolName)) {
      try {
        await fetchTools();
      } catch (error) {
        console.error('Failed to refresh tool list:', error.message);
        return undefined;
      }
    }
    return cachedTools.find(tool => tool.name === toolName);
  };

  const executeTool = async (toolName, args, rawRepresentation) => {
    try {
      const callResult = await sendRequest('tools/call', {
        name: toolName,
        arguments: args
      }, { timeout: 30000 });
      const storedRaw = rawRepresentation ?? JSON.stringify(args ?? {});
      if (storedRaw) {
        lastArgsRaw.set(toolName, storedRaw);
      }
      console.log(formatContent(callResult));
    } catch (error) {
      console.error('Tool invocation failed:', error.message);
    }
  };

  const printHelp = () => {
    console.log('Commands:');
    console.log('  help                Show this help');
    console.log('  list                Fetch and display available tools');
    console.log('  read <doc>          Read a document (".md" inferred if omitted)');
    console.log('  search <query>      Search documents for a phrase');
    console.log('  call <tool> [args]  Execute a tool; args may be JSON, key=value pairs, or a plain value');
    console.log('  quit                Exit the interactive client');
  };

  printHelp();

  while (!serverExited) {
    let line;
    try {
      line = await rl.question(process.stdin.isTTY ? 'mcp> ' : '');
    } catch (error) {
      break;
    }

    if (!line) {
      continue;
    }

    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const commandMatch = /^\S+/.exec(trimmedLine);
    if (!commandMatch) {
      continue;
    }

    const command = commandMatch[0];
    const remainder = trimmedLine.slice(command.length).trimStart();

    if (command === 'help' || command === '?') {
      printHelp();
      continue;
    }

    if (command === 'quit' || command === 'exit') {
      break;
    }

    if (command === 'list') {
      try {
        const tools = await fetchTools();
        if (tools.length === 0) {
          console.log('No tools reported by server.');
          continue;
        }
        for (const tool of tools) {
          console.log(`• ${tool.name} — ${tool.description ?? 'No description provided.'}`);
        }
      } catch (error) {
        console.error('Failed to list tools:', error.message);
      }
      continue;
    }

    if (command === 'read') {
      if (!remainder) {
        console.error('Usage: read <document-name>');
        continue;
      }
      const filenameInput = stripWrappingQuotes(remainder);
      if (!filenameInput) {
        console.error('Please provide a document name, e.g., read buying_ai');
        continue;
      }
      const args = normalizeArgsForTool('read_doc', { filename: filenameInput });
      await executeTool('read_doc', args, JSON.stringify(args));
      continue;
    }

    if (command === 'search') {
      if (!remainder) {
        console.error('Usage: search <query-text>');
        continue;
      }
      const queryInput = stripWrappingQuotes(remainder);
      if (!queryInput) {
        console.error('Please provide a query, e.g., search "risk management"');
        continue;
      }
      const args = normalizeArgsForTool('search_docs', { query: queryInput });
      await executeTool('search_docs', args, JSON.stringify(args));
      continue;
    }

    if (command === 'call') {
      if (!remainder) {
        console.error('Usage: call <tool> [arguments]');
        continue;
      }

      const toolMatch = /^\S+/.exec(remainder);
      if (!toolMatch) {
        console.error('Usage: call <tool> [arguments]');
        continue;
      }

      const toolName = toolMatch[0];
      const inlineArgsRaw = remainder.slice(toolName.length).trimStart();

      const toolMeta = await ensureToolMetadata(toolName);
      if (!toolMeta) {
        console.error(`Tool "${toolName}" not found. Run "list" to see available tools.`);
        continue;
      }

      if (inlineArgsRaw) {
        try {
          const parsed = buildArgsFromInline(inlineArgsRaw, toolMeta);
          await executeTool(toolName, parsed.args, parsed.raw);
          continue;
        } catch (error) {
          console.error('Could not parse inline arguments:', error.message);
          console.info(`Hint: try ${getExampleArgs(toolName)}`);
          if (/Invalid JSON/.test(error.message)) {
            console.info('Wrap plain text in quotes or supply key=value pairs.');
          }
          continue;
        }
      }

      const defaultRaw = lastArgsRaw.get(toolName) ?? '{}';
      let rawInput;
      try {
        rawInput = await rl.question(`arguments (JSON, default ${defaultRaw}): `);
      } catch (error) {
        console.error('Prompt cancelled.');
        continue;
      }

      const effectiveRaw = rawInput.trim() ? rawInput.trim() : defaultRaw;
      let parsedArgs;
      try {
        parsedArgs = JSON.parse(effectiveRaw);
      } catch (error) {
        console.error('Invalid JSON input. Wrap plain strings in quotes. Example:', getExampleArgs(toolName));
        continue;
      }

      const normalized = normalizeArgsForTool(toolName, parsedArgs);
      await executeTool(toolName, normalized, JSON.stringify(normalized));
      continue;
    }

    console.log(`Unknown command: ${command}`);
    printHelp();
  }

  rl.close();
}

async function main() {
  const exitPromise = once(server, 'exit');

  try {
    const initializeResult = await initialize();
    console.log(`Connected to ${initializeResult?.serverInfo?.name ?? 'MCP server'} v${initializeResult?.serverInfo?.version ?? 'unknown'}`);
    if (initializeResult.instructions) {
      console.log('Instructions provided by server:\n' + initializeResult.instructions);
    }

    await interactiveLoop();
    server.stdin.end();
  } catch (error) {
    console.error('✖ Interactive client failed:', error.message);
    if (stderrLogs.length > 0) {
      console.error('--- server stderr ---');
      console.error(stderrLogs.join('\n'));
    }
    process.exitCode = 1;
    server.kill();
  }

  const [code, signal] = await exitPromise;
  if ((code ?? 0) !== 0 && process.exitCode === undefined) {
    process.exitCode = code ?? 1;
  }

  if (stderrLogs.length > 0 && process.exitCode) {
    console.error('--- server stderr ---');
    console.error(stderrLogs.join('\n'));
  }

  if (exitInfo.code !== 0 && exitInfo.code !== null) {
    console.error(`Server exited with code ${exitInfo.code}${exitInfo.signal ? ` (signal ${exitInfo.signal})` : ''}`);
  }
}

main().catch(error => {
  console.error('✖ Unexpected error in interactive client:', error);
  process.exitCode = 1;
  server.kill();
});
