# FlowSpec

FlowSpec is a local-first React architecture planner. Build a component and data-flow diagram, describe the contracts between nodes, then generate a concise prompt for GitHub Copilot Chat, Codex, or another coding assistant in VS Code.

It also works in reverse: generate a repository-analysis prompt, run it in VS Code chat with a repository open, then import the returned FlowSpec JSON to create an editable map of the current application.

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

## Repository mapping workflow

1. Select **Map repo** or open the **Repo map** tab.
2. Choose Copilot, Codex, or a generic coding assistant and describe the analysis scope.
3. Copy the generated repository-analysis prompt into VS Code chat while the target repository is open.
4. Paste the complete chat response back into FlowSpec, or load a `.json`, `.md`, or `.txt` response file.
5. Select **Import and replace canvas** to validate the response and create an editable map.

The prompt asks the assistant for one fenced `flowspec` JSON block. FlowSpec can extract that block from the whole chat response, validates node kinds, IDs, connections, and field types before changing the canvas, and reports actionable errors when the response is incomplete. Use the canvas **Mermaid** button to download the current visual flow as `.mmd`; FlowSpec JSON preserves the richer editable details needed for round-tripping.

## Data and exports

- Plans automatically persist in browser local storage.
- **Export** downloads the complete editable plan as JSON.
- **Open** restores a previously exported FlowSpec JSON file.
- The generated prompt can be copied or downloaded as Markdown.
- Repository-analysis responses can be pasted directly or loaded from JSON, Markdown, or text files.
- The current canvas can be exported as a Mermaid `.mmd` flowchart.
- The app never reads the repository and does not require an AI API key.

## Validate

```bash
npm run lint
npm run build
npm run build:pages
```
