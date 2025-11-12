# Contributing

Thanks for taking the time to improve AI Playbook MCP Server! These guidelines help us ship changes smoothly and keep the documentation surfaced by the server dependable.

## Getting Started
- Install dependencies with `npm install` and use `npm run dev` for the fastest iteration loop.
- Keep changes compatible with the existing synchronous file I/O model in `src/index.ts` unless you plan a broader refactor.
- Follow the project TypeScript conventions (`strict: true`, ESM imports ending in `.js` when they land in `dist/`).

## Changelog Expectations
- Every user-visible change (new tool behaviour, documentation updates, config changes, etc.) must add an entry under the `## [Unreleased]` section of `CHANGELOG.md`.
- Group entries under a `###` heading (`Added`, `Changed`, `Fixed`, `Removed`) that matches the impact of the change.
- Keep entries short, action-oriented, and reference affected tools or docs when relevant.
- If a change spans multiple pull requests, update the changelog in the final PR that completes the work.

## Commits & Pull Requests
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages; this keeps the history scannable and supports automated release tooling later.
- Make sure CI scripts (`npm run build`) succeed before opening a pull request.
- Run `npm run smoke` after building to ensure the MCP handshake still succeeds.
- Include context in the PR description: what changed, why it was necessary, and how it was tested.

## Releasing
- When preparing a release, move the accumulated entries from `## [Unreleased]` into a new versioned section, add the release date, and reset the `Unreleased` section.
- Tag releases using semantic version numbers (`vMAJOR.MINOR.PATCH`).

## Need Help?
Open an issue or start a discussion if you are unsure how your change fits these guidelines. We are happy to collaborate.
