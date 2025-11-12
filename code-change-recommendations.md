# Code Change Recommendations

This list captures potential enhancements identified during review. Line numbers are approximate.

1. **Add filename sanitisation for writes** (`src/index.ts`, `writeDocument` ~215)
   - Guard against path traversal by rejecting `../` segments and normalising to the `docs/` root before writing.
   - Consider whitelisting allowed characters to prevent accidental creation of hidden or unwanted files.

2. **Introduce scoped reads** (`src/index.ts`, `readDocument` ~140)
   - Accept optional parameters such as `start_line`, `end_line`, or `heading` to reduce response size and align with context-budget best practices.
   - Update tool schema accordingly and ensure defaults preserve current behaviour.

3. **Return structured payloads** (`CallToolRequestSchema` handlers ~100-190)
   - Replace free-form text with JSON content blocks (e.g., `{ type: 'json', json: {...} }`) so clients can render doc lists, search results, and summaries reliably.

4. **Improve search result trimming** (`src/index.ts`, `searchDocuments` ~160)
   - Highlight matched terms and include limited surrounding context rather than full lines to control token growth.

5. **Cache document contents** (`loadDocFiles` and read helpers)
   - Store a checksum or cached content to avoid repeated disk reads during high-frequency access, especially in long-running sessions.

6. **Emit tool metadata** (tool registrations ~70)
   - Add optional `version` or `tags` fields if/when supported to help clients detect capability changes.

7. **Extend summaries for new docs** (`getDocumentSummary` ~195)
   - Load summaries dynamically from metadata rather than hard coding in a map, ensuring new files added via `write_doc` are described automatically.
