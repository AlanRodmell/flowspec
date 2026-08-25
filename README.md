# FlowSpec

FlowSpec is a local-first React architecture planner. Build a component and data-flow diagram, describe the contracts between nodes, then generate a concise prompt for GitHub Copilot Chat, Codex, or another coding assistant in VS Code.

Live app: https://alanrodmell.github.io/flowspec/

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed in the terminal, normally `http://localhost:3000`.

## Planning workflow

1. Edit the project title, objective, current understanding, stack and constraints.
2. Add routes, components, hooks, stores, services, APIs, external boundaries or tests.
3. Connect nodes and describe relationships such as props, callbacks, state reads or API calls.
4. Select what the coding assistant should analyse.
5. Choose the required response format:
   - Markdown with Mermaid
   - Implementation checklist
   - Structured JSON
   - Decision record
6. Copy the generated prompt and paste it into Copilot Chat or Codex in VS Code.

The prompt tells the assistant to inspect the open repository, reconcile current code with the proposed design, cite file and line evidence, distinguish observed and proposed behavior, and return the selected output contract.

## Data and exports

- Plans automatically persist in browser local storage.
- **Export** downloads the complete editable plan as JSON.
- **Open** restores a previously exported FlowSpec JSON file.
- The generated prompt can be copied or downloaded as Markdown.
- The app never reads the repository and does not require an AI API key.

## Validate

```bash
npm run lint
npm run build
npm run build:pages
```
