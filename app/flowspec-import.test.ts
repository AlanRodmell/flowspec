import assert from "node:assert/strict";
import test from "node:test";
import { buildMermaidFlow, buildRepoAnalysisPrompt, parseRepoAnalysis } from "./flowspec-import.ts";

const validResponse = `Here is the requested map.

\`\`\`flowspec
{
  "format": "flowspec-analysis",
  "version": 1,
  "project": {
    "title": "Shop",
    "objective": "Map the current flow",
    "existingContext": "The route renders the page.",
    "constraints": "URL state is canonical.",
    "stack": "React, TypeScript"
  },
  "summary": "A route renders a feature page.",
  "nodes": [
    {
      "id": "Product Route",
      "kind": "route",
      "label": "Product route",
      "responsibility": "Own the route entry.",
      "fileHint": "src/routes/products.tsx",
      "inputs": [],
      "outputs": ["page"],
      "state": [],
      "notes": "Observed: src/routes/products.tsx:12"
    },
    {
      "id": "product-page",
      "kind": "component",
      "label": "Product page",
      "responsibility": "Compose the feature.",
      "fileHint": "src/features/products/ProductPage.tsx",
      "inputs": ["route params"],
      "outputs": ["rendered products"],
      "state": ["selection"],
      "notes": "Observed: src/features/products/ProductPage.tsx:20"
    }
  ],
  "edges": [
    {
      "source": "Product Route",
      "target": "product-page",
      "relationship": "renders",
      "payload": "route params",
      "notes": "Observed: src/routes/products.tsx:16"
    }
  ],
  "unknowns": ["Server ownership is not visible in this package."]
}
\`\`\`

No code was changed.`;

test("extracts and validates a fenced FlowSpec response", () => {
  const result = parseRepoAnalysis(validResponse);
  assert.equal(result.project.title, "Shop");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0].id, "product-route");
  assert.deepEqual(result.edges[0], {
    id: "analysis-edge-1",
    source: "product-route",
    target: "product-page",
    relationship: "renders",
    payload: "route params",
    notes: "Observed: src/routes/products.tsx:16",
  });
  assert.equal(result.unknowns.length, 1);
});

test("rejects connections that reference missing nodes", () => {
  const invalid = validResponse.replace('"target": "product-page"', '"target": "missing-page"');
  assert.throws(() => parseRepoAnalysis(invalid), /target does not match an imported node id/);
});

test("rejects prose without a FlowSpec document", () => {
  assert.throws(() => parseRepoAnalysis("I could not inspect the repository."), /No valid FlowSpec JSON/);
});

test("builds a strict repository-analysis prompt", () => {
  const prompt = buildRepoAnalysisPrompt("GitHub Copilot Chat", "Trace checkout only.");
  assert.match(prompt, /Trace checkout only\./);
  assert.match(prompt, /"format": "flowspec-analysis"/);
  assert.match(prompt, /Every edge source and target must match a node id exactly/);
  assert.match(prompt, /Do not implement or modify code/);
});

test("exports the editable map as Mermaid", () => {
  const result = parseRepoAnalysis(validResponse);
  const mermaid = buildMermaidFlow(result.nodes, result.edges);
  assert.match(mermaid, /^flowchart LR/);
  assert.match(mermaid, /n1 -->\|renders: route params\| n2/);
  assert.match(mermaid, /class n1 route/);
  assert.match(mermaid, /class n2 component/);
});
