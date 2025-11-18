# MCP Usage and Extension Guide

This guide summarises how the AI Playbook MCP Server integrates with the Model Context Protocol (MCP), evaluates current tool design against best practice, and outlines the steps for adding new tools or resources.

## Current MCP Features

- **Transport**: Uses `StdioServerTransport`, enabling easy integration with desktop clients such as Claude.
- **Tool Registration**: Declares five tools (`list_docs`, `read_doc`, `search_docs`, `get_doc_summary`, `write_doc`) in the `ListToolsRequestSchema` handler.
- **Invocation Handling**: Dispatches `CallToolRequestSchema` requests through a switch statement, returning responses in MCP-compatible `{ content: [{ type: 'text', text: ... }] }` format.
- **Synchronous I/O**: Keeps file reads and writes synchronous to avoid concurrency issues and keep handler logic straightforward.

## Best-Practice Assessment

| Practice | Status | Notes |
| --- | --- | --- |
| Provide concise tool descriptions and JSON schemas | ✅ | Each tool includes descriptive text and validated input schema definitions. |
| Limit tool output size to protect context budgets | ⚠️ | `read_doc` returns the entire markdown file, and `search_docs` can emit large sections when matches are dense. |
| Support incremental discovery (list → read → search) | ✅ | Sequence of tools covers basic doc workflows. |
| Offer structured output when possible | ⚠️ | All tools return plain text blocks; structured JSON could give clients more control. |
| Handle mutations safely | ⚠️ | `write_doc` blocks overwrites by default but lacks validation, sanitisation, or audit logging. |
| Error messaging clarity | ✅ | Human-readable error strings are returned in tool output. |

### Suggested Improvements

1. Introduce pagination or section-based reads to reduce token pressure when serving large documents.
2. Consider returning structured JSON payloads (e.g., headings, excerpts) to help clients render results efficiently.
3. Enforce filename validation and sandboxing in `write_doc` to prevent path traversal.
4. Surface tool versioning or metadata so clients can detect breaking changes.

## Adding New Tools or Resources

Follow this checklist to introduce another tool:

1. **Update `ListToolsRequestSchema` Handler**
   - Append a new `Tool` entry with a unique `name`, succinct `description`, and an `inputSchema` that follows JSON Schema draft-07 conventions.
2. **Extend `CallToolRequestSchema` Switch**
   - Add a new `case` matching the tool name.
   - Implement logic that validates inputs, performs synchronous work, and returns MCP-compliant content (text, markdown, or JSON).
3. **Refresh In-Memory State if Required**
   - If the tool mutates `docs/`, call `this.loadDocFiles()` to keep cached metadata accurate.
4. **Document Behaviour**
   - Update `documentation/` with usage notes and include user-facing changes in `CHANGELOG.md` under the appropriate subsection.
5. **Test with `npm run dev`**
   - Manually exercise the tool through an MCP client or mock request to ensure compatibility and messaging.

### Adding New Markdown Resources

1. Place the markdown file in `docs/` with an `.md` extension.
2. Refresh the server (restart or trigger `loadDocFiles`) so the new file is discoverable via `list_docs`.
3. Optionally extend `getDocumentSummary` to provide a curated description for the new asset.
4. Record the addition in `CHANGELOG.md` and update any user-facing documentation that enumerates available docs.

Keeping output concise and making schema updates explicit will ensure MCP clients can adapt to new capabilities without breaking user flows.

## Verification & Automation

- Run `npm run build` followed by `npm run smoke` to confirm the compiled server accepts `initialize` and responds to `tools/list`.
- The smoke script (`scripts/verify-mcp.mjs`) can be wired into CI to guarantee handshake regressions are caught automatically.
- Use `npm run interactive` for manual debugging; it spawns the server and provides a CLI for `list` and `call` requests with JSON arguments.
