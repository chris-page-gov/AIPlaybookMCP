# Repository Overview

This document captures the current structure, purpose, and usage patterns of the AI Playbook MCP Server repository.

## Top-Level Layout

- `docs/` – Canonical AI Playbook markdown corpus exposed through MCP tools.
- `documentation/` – Internal project notes (development environment, repository overview, MCP usage guides).
- `src/` – TypeScript source code for the MCP server (`index.ts`).
- `scripts/` – Utility executables (e.g., `verify-mcp.mjs` smoke test harness).
- `.github/` – Copilot configuration and related change log.
- `.devcontainer/` – Development container configuration (not yet documented).
- `dist/` – Generated output directory after running `npm run build` (not tracked in Git).
- Root files – Project metadata (`package.json`, `tsconfig.json`, `README.md`, `LICENSE.txt`, `CHANGELOG.md`, etc.).

## Core Functionality

The server is implemented in `src/index.ts` and:

1. Creates an MCP `Server` instance with stdio transport.
2. Indexes the markdown files under `docs/` on startup and after writes.
3. Exposes five tools to clients: `list_docs`, `read_doc`, `search_docs`, `get_doc_summary`, and `write_doc`.
4. Performs synchronous file I/O to simplify request handling and ensure deterministic responses.

## Usage Summary

- Build once with `npm run build` and execute the compiled server using `npm start` or run in watch mode via `npm run dev`.
- MCP clients (e.g., Claude Desktop) connect by launching the server binary and will receive tool definitions when invoking the MCP `list_tools` request.
- Documentation changes should be reflected in the `docs/` directory, while repository-facing guides belong in `documentation/`.
- Any user-facing behaviour change must be recorded under `## [Unreleased]` in `CHANGELOG.md`.
