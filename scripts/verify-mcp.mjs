#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const distEntry = join(projectRoot, 'dist', 'index.js');

if (!existsSync(distEntry)) {
  console.error('✖ dist/index.js not found. Run "npm run build" before smoke testing.');
  process.exitCode = 1;
  process.exit();
}

const server = spawn('node', [distEntry], {
  stdio: ['pipe', 'pipe', 'pipe']
});

server.on('error', error => {
  console.error('✖ Failed to start MCP server:', error);
  process.exitCode = 1;
});

const stdoutRl = createInterface({ input: server.stdout });
const stderrLogs = [];
server.stderr.setEncoding('utf8');
server.stderr.on('data', chunk => {
  const text = chunk.toString();
  stderrLogs.push(text);
});

const pending = new Map();

stdoutRl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  try {
    const message = JSON.parse(trimmed);

    if (typeof message.id !== 'undefined') {
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
    }
  } catch (error) {
    console.error('✖ Failed to parse server output:', error);
    process.exitCode = 1;
  }
});

async function sendRequest(request, { timeout = 5000 } = {}) {
  const id = request.id;
  const payload = { ...request, jsonrpc: JSONRPC_VERSION };

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for response to request ${id}`));
    }, timeout);

    pending.set(id, { resolve, reject, timeoutId });

    server.stdin.write(JSON.stringify(payload) + '\n');
  });
}

async function sendNotification(notification) {
  const payload = { jsonrpc: JSONRPC_VERSION, ...notification };
  server.stdin.write(JSON.stringify(payload) + '\n');
}

async function main() {
  const exitPromise = once(server, 'exit');

  try {
    const initializeResult = await sendRequest({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'ai-playbook-mcp-smoke-test',
          version: '1.0.0'
        }
      }
    });

    if (!initializeResult?.capabilities?.tools) {
      throw new Error('Server did not advertise tool capability during initialize');
    }

    await sendNotification({
      method: 'notifications/initialized'
    });

    const listToolsResult = await sendRequest({
      id: 2,
      method: 'tools/list'
    });

    const toolNames = new Set((listToolsResult?.tools ?? []).map(tool => tool.name));
    const requiredTools = ['list_docs', 'read_doc', 'search_docs', 'get_doc_summary', 'write_doc'];
    const missing = requiredTools.filter(tool => !toolNames.has(tool));

    if (missing.length > 0) {
      throw new Error(`Missing expected tools: ${missing.join(', ')}`);
    }

    console.log('✓ MCP server responded to initialize and tools/list as expected.');

    server.stdin.end();
  } catch (error) {
    console.error('✖ Smoke test failed:', error.message);
    if (stderrLogs.length > 0) {
      console.error('--- server stderr ---');
      console.error(stderrLogs.join(''));
    }
    process.exitCode = 1;
    server.kill();
  }

  const [code, signal] = await exitPromise;
  if ((code ?? 0) !== 0) {
    console.error(`✖ Server exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
    if (process.exitCode === undefined) {
      process.exitCode = code ?? 1;
    }
    if (stderrLogs.length > 0) {
      console.error('--- server stderr ---');
      console.error(stderrLogs.join(''));
    }
  }
}

main().catch(error => {
  console.error('✖ Unexpected error during smoke test:', error);
  process.exitCode = 1;
  server.kill();
});