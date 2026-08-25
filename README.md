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

## Choose a workflow

FlowSpec opens with two clear paths:

- **Guided build** asks about one route, component, hook, store, service, API or test at a time. Each answer is added to the shared plan; the optional final step previews the connection before it is committed.
- **Build it yourself** opens the freeform canvas for manual editing or importing a repository-analysis response.

Both paths use the same editable diagram and feed the same Technical Review and exports.

## Planning workflow

1. Edit the project title, objective, current understanding, stack and constraints.
2. Add routes, components, hooks, stores, services, APIs, external boundaries or tests.
3. Connect nodes and describe relationships such as props, callbacks, state reads or API calls.
4. Open **Technical review** to inspect the hierarchical architecture, contracts, connections, evidence and automatically detected planning gaps.
5. Open **VS Code chat**, expand **Plan → Build**, and select what the coding assistant should analyse.
6. Choose the required response format:
   - Markdown with Mermaid
   - Implementation checklist
   - Structured JSON
   - Decision record
7. Copy the generated prompt and paste it into Copilot Chat or Codex in VS Code.

The prompt tells the assistant to inspect the open repository, reconcile current code with the proposed design, cite file and line evidence, distinguish observed and proposed behavior, and return the selected output contract.

## Repository mapping workflow

1. Select **Map repo**, or open **VS Code chat** and expand **Repo → Map**.
2. Choose Copilot, Codex, or a generic coding assistant and describe the analysis scope.
3. Copy the generated repository-analysis prompt into VS Code chat while the target repository is open.
4. Paste the complete chat response back into FlowSpec, or load a `.json`, `.md`, or `.txt` response file.
5. Select **Import and replace canvas** to validate the response and create an editable map.

The prompt asks the assistant for one fenced `flowspec` JSON block. FlowSpec can extract that block from the whole chat response, validates node kinds, IDs, connections, and field types before changing the canvas, and reports actionable errors when the response is incomplete. Use the canvas **Mermaid** button to download the current visual flow as `.mmd`; FlowSpec JSON preserves the richer editable details needed for round-tripping.

## Data and exports

- Plans automatically persist in browser local storage.
- **Export → Editable plan** downloads the complete FlowSpec plan as JSON.
- **Export → Technical document** downloads concise Markdown containing the project brief, Mermaid architecture diagram, component inventory, contracts, connections, evidence and live review findings.
- **Export → Mermaid diagram** downloads the canvas as a standalone `.mmd` flowchart.
- **Open** restores a previously exported FlowSpec JSON file.
- **Share** creates a URL containing an editable copy of the plan. Share links contain the plan data and should not include secrets; oversized plans should be shared through JSON export instead.
- The generated prompt can be copied or downloaded as Markdown.
- Repository-analysis responses can be pasted directly or loaded from JSON, Markdown, or text files.
- Canvas **View** controls can arrange the flow right-to-left or top-to-bottom, hide node types or connection labels, and spotlight a selected node and its direct flow without deleting plan data.
- The app never reads the repository and does not require an AI API key.

## Validate

```bash
npm run lint
npm run build
npm run build:pages
```
