# Development Environment Requirements

This project targets a TypeScript MCP server that surfaces the UK Government AI Playbook content. Use the following environment when developing locally or inside a dev container:

- Node.js 20.x and npm (ships with the dev container image and matches the runtime used by `tsx` and TypeScript tooling).
- Global shell utilities: git, bash, and common build tools (provided by the base dev container image).
- Project dependencies installed with `npm install` (installs `@modelcontextprotocol/sdk`, `tsx`, and TypeScript).
- Recommended VS Code extensions (installed automatically by the dev container): official TypeScript/JavaScript tooling, ESLint, Prettier, Markdown All in One, and GitHub Copilot (including Copilot Chat).

After dependencies install, use the following scripts:

- `npm run dev` to run the MCP server via `tsx` for rapid iteration.
- `npm run build` followed by `npm start` to test the compiled output from the `dist/` folder.

Run these commands inside the dev container to ensure tooling versions stay consistent across contributors.
