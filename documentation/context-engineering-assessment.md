# Context Engineering Assessment

This document evaluates how the AI Playbook MCP Server manages token usage and provides recommendations to improve the quality and efficiency of context supplied to downstream models.

## Current Behaviour

- **`list_docs`**: Returns a succinct, fixed-size list that rarely threatens token budgets.
- **`read_doc`**: Streams the entire markdown file as one response, easily surpassing several thousand tokens for larger documents.
- **`search_docs`**: Limits matches to five per file but still returns full matching lines; cumulative output can grow quickly when many files match the query.
- **`get_doc_summary`**: Emits short, curated summaries; low token impact.
- **`write_doc`**: Returns a short status message.

## Risks and Observations

- Large responses, especially from `read_doc`, can cause MCP clients to hit context limits or truncate important information.
- Lack of chunking makes it difficult for clients to request only the sections they need.
- Responses are plain text, so clients must re-parse headings or metadata, increasing processing costs and risking duplication.
- No caching or hashing strategy is exposed, so repeated requests always resend the full payload.

## Recommendations

1. **Introduce Section-Based Reads**
   - Accept optional parameters such as `heading`, `start_line`, or `max_chars` to scope the payload.
   - Offer a default page size (e.g., 1,000 characters) with pagination tokens for follow-up requests.
2. **Return Structured Metadata**
   - Provide JSON objects that include `content`, `tokens_estimate`, and `source_path` so clients can reason about context budgets programmatically.
3. **Pre-Chunk Documents**
   - During `loadDocFiles`, generate table-of-contents data (headings, offsets) and expose a lightweight tool (e.g., `list_doc_sections`) for targeted retrieval.
4. **Implement Server-Side Snippet Highlighting**
   - For `search_docs`, return surrounding context trimmed to a safe character window with highlight markers rather than full lines.
5. **Expose Token Estimates**
   - Integrate a simple tokenizer (or approximation) to report the approximate token count for each document and response, enabling smarter client decisions.

Applying these changes will make the server more context-aware and reduce wasted tokens, especially when users explore multiple documents in a single MCP session.
