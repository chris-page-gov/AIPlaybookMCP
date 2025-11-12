# Outstanding Checks

Use this checklist to track validation steps that should accompany future code changes.

- [ ] Add automated tests (unit or integration) covering each MCP tool handler.
- [ ] Verify `write_doc` enforces filename sanitisation and rejects unsafe paths.
- [ ] Benchmark token output for `read_doc` and `search_docs` after implementing scoped responses.
- [ ] Confirm `get_doc_summary` stays in sync when new documents are added.
- [ ] Exercise new tools through an MCP client to validate schema compatibility.
- [ ] Document any new environment variables or configuration toggles introduced.
