export const REPO_NODE_KINDS = ["route", "component", "hook", "state", "service", "api", "external", "test"] as const;

export type RepoNodeKind = typeof REPO_NODE_KINDS[number];

export interface RepoProjectBrief {
  title: string;
  objective: string;
  existingContext: string;
  constraints: string;
  stack: string;
}

export interface ImportedRepoNode {
  id: string;
  label: string;
  kind: RepoNodeKind;
  responsibility: string;
  fileHint: string;
  state: string[];
  inputs: string[];
  outputs: string[];
  notes: string;
}

export interface ImportedRepoEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  payload: string;
  notes: string;
}

export interface ImportedRepoAnalysis {
  project: RepoProjectBrief;
  summary: string;
  nodes: ImportedRepoNode[];
  edges: ImportedRepoEdge[];
  unknowns: string[];
}

interface MermaidNode {
  id: string;
  label: string;
  kind: RepoNodeKind;
}

interface MermaidEdge {
  source: string;
  target: string;
  relationship: string;
  payload?: string;
}

const KIND_SET = new Set<string>(REPO_NODE_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function textList(value: unknown, path: string, problems: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    problems.push(`${path} must be an array of strings.`);
    return [];
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function safeId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function jsonCandidates(input: string): string[] {
  const candidates: string[] = [];
  const fenced = /```(?:flowspec|json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fenced.exec(input)) !== null) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }

  const trimmed = input.trim();
  if (trimmed) candidates.push(trimmed);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return [...new Set(candidates)];
}

function extractDocument(input: string): Record<string, unknown> {
  for (const candidate of jsonCandidates(input)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed) && Array.isArray(parsed.nodes)) return parsed;
    } catch {
      // Try the next fenced or raw JSON candidate.
    }
  }
  throw new Error("No valid FlowSpec JSON was found. Paste the complete Copilot response, including its fenced `flowspec` block.");
}

export function buildRepoAnalysisPrompt(targetName: string, scope: string): string {
  const requestedScope = scope.trim() || "Map the primary application structure and data flow. Focus on routes and entry points, feature-level components, hooks, state, services, APIs, and external systems.";

  return `Use ${targetName} to inspect the repository currently open in VS Code and map its existing application structure. Do not implement or modify code.

SCOPE
${requestedScope}

ANALYSE
- Identify framework and entry points from repository evidence.
- Trace routes or screens through feature-level components, hooks, state/stores, services, APIs, and external systems.
- Capture important props, callbacks, state reads/writes, requests, responses, and navigation.
- Include tests only when they explain an important boundary or flow.
- Omit low-level presentational leaf components unless they materially affect the architecture.
- Cite repository-relative file paths and 1-based line numbers in node or connection notes.
- Distinguish direct observation from inference. Put unresolved points in unknowns instead of inventing structure.
- Keep the map concise and useful; use no more than 40 nodes unless the requested scope genuinely requires it.

RESPONSE CONTRACT
Return exactly one fenced \`flowspec\` code block containing valid JSON with this shape:

\`\`\`flowspec
{
  "format": "flowspec-analysis",
  "version": 1,
  "project": {
    "title": "Repository or application name",
    "objective": "Document the current application structure and data flow",
    "existingContext": "Short evidence-backed summary of the current architecture",
    "constraints": "Important architectural constraints observed in the repository",
    "stack": "Observed framework, language, routing, state and data libraries"
  },
  "summary": "One concise summary of the traced flow",
  "nodes": [
    {
      "id": "unique-kebab-case-id",
      "kind": "route|component|hook|state|service|api|external|test",
      "label": "Human-readable name",
      "responsibility": "One-sentence responsibility",
      "fileHint": "repository/relative/path.tsx",
      "inputs": ["important input, prop or parameter"],
      "outputs": ["important render, callback or result"],
      "state": ["owned or consumed state"],
      "notes": "Observed: path/to/file.tsx:42. Any concise evidence or caveat."
    }
  ],
  "edges": [
    {
      "source": "source-node-id",
      "target": "target-node-id",
      "relationship": "renders|passes props|emits callback|navigates|reads state|writes state|calls|returns data|subscribes|invalidates|connects",
      "payload": "Data, event, route or contract crossing the boundary",
      "notes": "Observed: path/to/file.ts:18. Any concise evidence or caveat."
    }
  ],
  "unknowns": ["Anything the repository evidence could not establish"]
}
\`\`\`

FORMAT RULES
- Use only the node kinds and top-level fields shown above.
- Every node id must be unique. Every edge source and target must match a node id exactly.
- Use repository-relative paths, never absolute local paths.
- Output valid JSON without comments or trailing commas.
- Do not include prose outside the single fenced block.`;
}

function mermaidLabel(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "/")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export type FlowDirection = "LR" | "RL" | "TB";

export function buildMermaidFlow(nodes: MermaidNode[], edges: MermaidEdge[], direction: FlowDirection = "LR"): string {
  const aliases = new Map(nodes.map((node, index) => [node.id, `n${index + 1}`]));
  const nodeLines = nodes.map((node, index) => `  n${index + 1}["${mermaidLabel(node.label)}<br/>(${node.kind})"]`);
  const edgeLines = edges.flatMap((item) => {
    const source = aliases.get(item.source);
    const target = aliases.get(item.target);
    if (!source || !target) return [];
    const label = [item.relationship, item.payload].filter(Boolean).map((part) => mermaidLabel(part ?? "")).join(": ");
    return [`  ${source} -->${label ? `|${label}|` : ""} ${target}`];
  });
  const classLines = REPO_NODE_KINDS.map((kind) => {
    const members = nodes.map((node, index) => node.kind === kind ? `n${index + 1}` : "").filter(Boolean);
    return members.length ? `  class ${members.join(",")} ${kind}` : "";
  }).filter(Boolean);

  return [
    `flowchart ${direction}`,
    ...nodeLines,
    ...edgeLines,
    "  classDef route fill:#fff2ed,stroke:#ef6d48,color:#17202a",
    "  classDef component fill:#f0f3ff,stroke:#6178c7,color:#17202a",
    "  classDef hook fill:#f7f0fc,stroke:#9b67c8,color:#17202a",
    "  classDef state fill:#fff7e8,stroke:#d69a3d,color:#17202a",
    "  classDef service fill:#edf9f5,stroke:#35a27e,color:#17202a",
    "  classDef api fill:#edf8fb,stroke:#2f98ba,color:#17202a",
    "  classDef external fill:#f2f4f6,stroke:#7f8998,color:#17202a",
    "  classDef test fill:#f1f8ee,stroke:#679e55,color:#17202a",
    ...classLines,
  ].join("\n");
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim() || "—";
}

function markdownList(items: string[]): string {
  const values = items.map((item) => item.trim()).filter(Boolean);
  return values.length ? values.join(", ") : "—";
}

export function buildTechnicalDocument(project: RepoProjectBrief, nodes: ImportedRepoNode[], edges: ImportedRepoEdge[], direction: FlowDirection = "LR"): string {
  const names = new Map(nodes.map((node) => [node.id, node.label]));
  const inventory = nodes.map((node) => `| ${markdownCell(node.kind)} | ${markdownCell(node.label)} | ${markdownCell(node.responsibility)} | ${markdownCell(node.fileHint)} |`);
  const contracts = nodes.map((node) => `### ${node.label}\n\n- **Type:** ${node.kind}\n- **Inputs / props:** ${markdownList(node.inputs)}\n- **Outputs / callbacks:** ${markdownList(node.outputs)}\n- **State:** ${markdownList(node.state)}`);
  const flowRows = edges.map((item) => `| ${markdownCell(names.get(item.source) ?? item.source)} | ${markdownCell(item.relationship)} | ${markdownCell(names.get(item.target) ?? item.target)} | ${markdownCell(item.payload)} |`);
  const evidence = [
    ...nodes.filter((node) => node.notes.trim()).map((node) => `- **${node.label}:** ${node.notes.trim()}`),
    ...edges.filter((item) => item.notes.trim()).map((item) => `- **${names.get(item.source) ?? item.source} → ${names.get(item.target) ?? item.target}:** ${item.notes.trim()}`),
  ];

  return `# ${project.title || "FlowSpec technical overview"}

## Purpose

${project.objective || "No objective supplied."}

## Current context

${project.existingContext || "No current context supplied."}

- **Stack:** ${project.stack || "Not specified"}
- **Constraints:** ${project.constraints || "None supplied"}
- **Scope:** ${nodes.length} components and boundaries; ${edges.length} connections

## Architecture and data flow

\`\`\`mermaid
${buildMermaidFlow(nodes, edges, direction)}
\`\`\`

## Component inventory

| Type | Component or boundary | Responsibility | File or location |
| --- | --- | --- | --- |
${inventory.length ? inventory.join("\n") : "| — | No components mapped | — | — |"}

## Component contracts

${contracts.length ? contracts.join("\n\n") : "No component contracts mapped."}

## Connection inventory

| Source | Relationship | Target | Props, event or payload |
| --- | --- | --- | --- |
${flowRows.length ? flowRows.join("\n") : "| — | No connections mapped | — | — |"}

## Evidence and notes

${evidence.length ? evidence.join("\n") : "No additional evidence or notes supplied."}
`;
}

export function parseRepoAnalysis(input: string): ImportedRepoAnalysis {
  const document = extractDocument(input);
  const problems: string[] = [];

  if (document.format !== "flowspec-analysis") problems.push('format must be "flowspec-analysis".');
  if (document.version !== 1) problems.push("version must be 1.");

  const rawNodes = Array.isArray(document.nodes) ? document.nodes : [];
  const rawEdges = document.edges === undefined ? [] : Array.isArray(document.edges) ? document.edges : [];
  if (!rawNodes.length) problems.push("nodes must contain at least one node.");
  if (rawNodes.length > 120) problems.push("nodes exceeds the 120-node import limit; narrow the analysis scope.");
  if (document.edges !== undefined && !Array.isArray(document.edges)) problems.push("edges must be an array.");
  if (rawEdges.length > 250) problems.push("edges exceeds the 250-connection import limit; narrow the analysis scope.");

  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();
  const nodes: ImportedRepoNode[] = [];

  rawNodes.forEach((value, index) => {
    const path = `nodes[${index}]`;
    if (!isRecord(value)) {
      problems.push(`${path} must be an object.`);
      return;
    }

    const originalId = text(value.id);
    const id = safeId(originalId);
    const label = text(value.label);
    const kind = text(value.kind);

    if (!originalId) problems.push(`${path}.id is required.`);
    if (!id) problems.push(`${path}.id must contain letters or numbers.`);
    if (id && usedIds.has(id)) problems.push(`${path}.id duplicates another node after normalisation.`);
    if (!label) problems.push(`${path}.label is required.`);
    if (!KIND_SET.has(kind)) problems.push(`${path}.kind must be one of: ${REPO_NODE_KINDS.join(", ")}.`);

    if (!id || !label || !KIND_SET.has(kind) || usedIds.has(id)) return;
    usedIds.add(id);
    idMap.set(originalId, id);
    nodes.push({
      id,
      label,
      kind: kind as RepoNodeKind,
      responsibility: text(value.responsibility, "Responsibility not described by the analysis."),
      fileHint: text(value.fileHint),
      inputs: textList(value.inputs, `${path}.inputs`, problems),
      outputs: textList(value.outputs, `${path}.outputs`, problems),
      state: textList(value.state, `${path}.state`, problems),
      notes: text(value.notes),
    });
  });

  const edges: ImportedRepoEdge[] = [];
  rawEdges.forEach((value, index) => {
    const path = `edges[${index}]`;
    if (!isRecord(value)) {
      problems.push(`${path} must be an object.`);
      return;
    }
    const rawSource = text(value.source);
    const rawTarget = text(value.target);
    const source = idMap.get(rawSource);
    const target = idMap.get(rawTarget);
    if (!source) problems.push(`${path}.source does not match an imported node id.`);
    if (!target) problems.push(`${path}.target does not match an imported node id.`);
    if (source && target && source === target) problems.push(`${path} cannot connect a node to itself.`);
    if (!source || !target || source === target) return;

    edges.push({
      id: `analysis-edge-${index + 1}`,
      source,
      target,
      relationship: text(value.relationship, "connects"),
      payload: text(value.payload),
      notes: text(value.notes),
    });
  });

  const rawProject = isRecord(document.project) ? document.project : {};
  const summary = text(document.summary);
  const unknowns = textList(document.unknowns, "unknowns", problems);

  if (problems.length) {
    const visible = problems.slice(0, 5).join(" ");
    const remaining = problems.length - 5;
    throw new Error(`${visible}${remaining > 0 ? ` Plus ${remaining} more issue${remaining === 1 ? "" : "s"}.` : ""}`);
  }

  return {
    project: {
      title: text(rawProject.title, "Imported repository map"),
      objective: text(rawProject.objective, "Document the current application structure and data flow."),
      existingContext: text(rawProject.existingContext, summary || "Imported from repository analysis."),
      constraints: text(rawProject.constraints),
      stack: text(rawProject.stack, "Confirm from repository evidence."),
    },
    summary,
    nodes,
    edges,
    unknowns,
  };
}
