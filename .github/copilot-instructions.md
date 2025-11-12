# AIPlaybookMCP Copilot Instructions

## Project Snapshot
- TypeScript MCP server (`src/index.ts`) exposing AI Playbook docs via `@modelcontextprotocol/sdk`.
- Single entry class `AIPlaybookMCPServer` wires stdio transport to five tools: `list_docs`, `read_doc`, `search_docs`, `get_doc_summary`, `write_doc`.
- Documentation lives in `docs/*.md`; runtime loads metadata with `readdirSync` + `statSync` on startup.

## Development Workflow
- Install deps once with `npm install`; project is pure ESM (`type: "module"`).
- Build distributable with `npm run build` (runs `tsc`, outputs to `dist/`); run compiled server via `npm start` (node on `dist/index.js`).
- Use `npm run dev` for hot execution through `tsx src/index.ts`; ideal for tweaking tool behavior.
- Keep TypeScript strictness in mind (`strict: true`, `moduleResolution: "bundler"`); prefer ESM import paths ending in `.js` when targeting compiled output.
- Log any user-facing change in `CHANGELOG.md` under `## [Unreleased]`, grouping entries beneath an appropriate `### Added/Changed/Fixed/Removed` heading.

## Architectural Cues
- Server capabilities defined once in constructor; extend by appending new `Tool` objects inside the `ListToolsRequestSchema` handler and mirroring logic in the `CallToolRequestSchema` switch.
- `docFiles` is the in-memory index of available markdown; call `this.loadDocFiles()` after any mutation (e.g., when adding new write flows) to refresh cache.
- All file I/O is synchronous by design to simplify stdio request handling; maintain this pattern unless you refactor the entire flow to async.
- Document summaries are hard-coded in `getDocumentSummary()`; add or rename docs here to keep MCP responses aligned.

## Conventions & Gotchas
- `DOCS_DIR` resolves relative to the compiled file; when adding new directories ensure paths remain consistent under `dist/`.
- `write_doc` normalizes filenames to `.md` and blocks overwrites unless `overwrite: true`; reuse this guard when adding similar mutating tools.
- Error messaging is user-facing (returned as tool output); craft clear strings instead of throwing.
- Tests are not present; rely on manual invocation through an MCP client or `npm run dev` for validation.
- Keep line endings as LF (see repository `.gitattributes`); do not convert docs to CRLF when editing.

## Extending the Server
- To add search variants or analytics, reuse the line-oriented processing in `searchDocuments()`; it limits output to five matches per file plus a summary.
- When introducing new tools, remember to update both the schema list and the switch plus return shape (`{ content: [{ type: 'text', text: ... }] }`).
- For richer results (e.g., JSON payloads) adjust the returned `content` entries to match MCP expectations while keeping the stdio transport.

## Documentation Source
- The `docs/` folder is the canonical corpus surfaced by the MCP tools; it mirrors the UK Government AI Playbook and filenames double as tool identifiers (e.g., `using_ai_safely_responsibly.md`).
- Preserve the existing naming to keep summaries accurate and external clients predictable.
- Use the `documentation/` folder for repo-facing notes, ADRs, or implementation guides that should not be exposed through the MCP tooling.
