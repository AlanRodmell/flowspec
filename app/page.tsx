"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  ArrowRight,
  Boxes,
  Braces,
  Check,
  Cloud,
  Component,
  Copy,
  Database,
  Download,
  FileJson,
  FolderOpen,
  Globe2,
  LayoutGrid,
  Maximize2,
  Network,
  Plus,
  Route,
  Save,
  ServerCog,
  Sparkles,
  TestTube2,
  Trash2,
  Upload,
  Webhook,
  X,
  type LucideIcon,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { buildMermaidFlow, buildRepoAnalysisPrompt, parseRepoAnalysis, type RepoNodeKind } from "./flowspec-import";

type NodeKind = RepoNodeKind;
type PanelTab = "prompt" | "import" | "inspect" | "brief";
type OutputFormat = "markdown-mermaid" | "checklist" | "json" | "decision-record";
type TargetChat = "copilot" | "codex" | "generic";

interface PlannerNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  responsibility: string;
  fileHint: string;
  state: string[];
  inputs: string[];
  outputs: string[];
  notes: string;
}

interface PlannerEdgeData extends Record<string, unknown> {
  relationship: string;
  payload: string;
  notes: string;
}

type FlowNode = Node<PlannerNodeData, "planner">;
type FlowEdge = Edge<PlannerEdgeData, "smoothstep">;

interface ProjectBrief {
  title: string;
  objective: string;
  existingContext: string;
  constraints: string;
  stack: string;
}

interface SavedPlan {
  version: 1;
  project: ProjectBrief;
  nodes: FlowNode[];
  edges: FlowEdge[];
  targetChat: TargetChat;
  outputFormat: OutputFormat;
  focus: string[];
  customAnalysis: string;
  outputRequirements: string;
  repoScope?: string;
}

const STORAGE_KEY = "flowspec-plan-v1";
const NODE_W = 248;
const NODE_H = 166;

const KIND_META: Record<NodeKind, { label: string; color: string; icon: LucideIcon }> = {
  route: { label: "Route", color: "#ef6d48", icon: Route },
  component: { label: "Component", color: "#6178c7", icon: Component },
  hook: { label: "Hook", color: "#9b67c8", icon: Webhook },
  state: { label: "State / store", color: "#d69a3d", icon: Database },
  service: { label: "Service", color: "#35a27e", icon: ServerCog },
  api: { label: "API", color: "#2f98ba", icon: Cloud },
  external: { label: "External", color: "#7f8998", icon: Globe2 },
  test: { label: "Test", color: "#679e55", icon: TestTube2 },
};

const RELATIONSHIPS = [
  "renders",
  "passes props",
  "emits callback",
  "navigates",
  "reads state",
  "writes state",
  "calls",
  "returns data",
  "subscribes",
  "invalidates",
];

const FOCUS_OPTIONS = [
  ["evidence", "Existing flow and repository evidence"],
  ["boundaries", "Component boundaries and responsibilities"],
  ["contracts", "Props, callbacks and TypeScript contracts"],
  ["state", "State ownership and derived state"],
  ["data", "Async data, caching and API flow"],
  ["ux", "Loading, empty, error and retry behavior"],
  ["impact", "File-level change impact and sequence"],
  ["tests", "Tests and verification"],
  ["a11y", "Accessibility and keyboard behavior"],
  ["risks", "Risks, assumptions and unknowns"],
] as const;

const OUTPUT_LABELS: Record<OutputFormat, string> = {
  "markdown-mermaid": "Markdown + Mermaid",
  checklist: "Implementation checklist",
  json: "Structured JSON",
  "decision-record": "Decision record",
};

const INITIAL_PROJECT: ProjectBrief = {
  title: "Product filtering",
  objective: "Add URL-synchronised product filters without duplicating server state.",
  existingContext: "A product route renders the product page. Products are fetched through a query hook.",
  constraints: "Preserve deep links; avoid a second source of truth; support loading, empty and retry states.",
  stack: "React, TypeScript, React Router, TanStack Query",
};

const makeNodeData = (kind: NodeKind, label?: string): PlannerNodeData => ({
  label: label ?? KIND_META[kind].label,
  kind,
  responsibility: "Describe this part of the flow.",
  fileHint: "",
  state: [],
  inputs: [],
  outputs: [],
  notes: "",
});

const INITIAL_NODES: FlowNode[] = [
  { id: "route", type: "planner", position: { x: 30, y: 175 }, data: { ...makeNodeData("route", "Product route"), responsibility: "Owns URL search parameters and the page entry.", outputs: ["filter params"] } },
  { id: "page", type: "planner", position: { x: 330, y: 70 }, data: { ...makeNodeData("component", "Product page"), responsibility: "Composes filters, results and page-level states.", inputs: ["filter params"], outputs: ["rendered products"] } },
  { id: "filters", type: "planner", position: { x: 330, y: 285 }, data: { ...makeNodeData("component", "Filter controls"), responsibility: "Edits filter values and emits user intent.", inputs: ["active filters"], outputs: ["onFilterChange"] } },
  { id: "query", type: "planner", position: { x: 650, y: 175 }, data: { ...makeNodeData("hook", "useProductsQuery"), responsibility: "Builds the query key and exposes server state.", inputs: ["filter params"], outputs: ["data", "status", "retry"], state: ["server cache"] } },
  { id: "api", type: "planner", position: { x: 950, y: 175 }, data: { ...makeNodeData("api", "Products API"), responsibility: "Returns filtered product results.", inputs: ["query parameters"], outputs: ["products", "metadata"] } },
];

const edge = (id: string, source: string, target: string, relationship: string, payload = ""): FlowEdge => ({
  id,
  source,
  target,
  type: "smoothstep",
  label: relationship,
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  data: { relationship, payload, notes: "" },
});

const INITIAL_EDGES: FlowEdge[] = [
  edge("route-page", "route", "page", "renders", "search params"),
  edge("route-filters", "route", "filters", "passes props", "active filters"),
  edge("filters-route", "filters", "route", "emits callback", "filter intent"),
  edge("page-query", "page", "query", "calls", "filter params"),
  edge("query-api", "query", "api", "calls", "GET /products?..."),
];

const DEFAULT_FOCUS = FOCUS_OPTIONS.map(([id]) => id).filter((id) => id !== "a11y");
const DEFAULT_REPO_SCOPE = "Map the primary application structure and data flow. Focus on routes and entry points, feature-level components, hooks, state, services, APIs, and external systems.";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function PlannerNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const meta = KIND_META[data.kind];
  const Icon = meta.icon;
  return (
    <div className={`planner-node-card${selected ? " selected" : ""}`} style={{ "--node-color": meta.color } as React.CSSProperties}>
      <Handle type="target" position={Position.Left} className="node-handle" />
      <div className="node-kind"><Icon size={12} /> {meta.label}</div>
      <strong>{data.label}</strong>
      <p>{data.responsibility || "No responsibility described."}</p>
      <div className="node-meta"><span>{data.inputs.length} in</span><span>{data.outputs.length} out</span><span>{data.state.length} state</span></div>
      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  );
}

const NODE_TYPES = { planner: PlannerNodeCard };

function ListEditor({ title, items, placeholder, onChange }: { title: string; items: string[]; placeholder: string; onChange: (items: string[]) => void }) {
  return (
    <div className="list-editor">
      <label>{title}</label>
      {items.map((item, index) => (
        <div className="inline-field" key={`${title}-${index}`}>
          <input value={item} placeholder={placeholder} onChange={(event) => onChange(items.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} />
          <button aria-label={`Remove ${title} item`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button>
        </div>
      ))}
      <button className="text-button" onClick={() => onChange([...items, ""])}><Plus size={13} /> Add {title.toLowerCase()}</button>
    </div>
  );
}

function compactList(items: string[]): string {
  return items.map((item) => item.trim()).filter(Boolean).join(", ");
}

function outputContract(format: OutputFormat): string {
  if (format === "checklist") {
    return `Return concise Markdown using exactly these sections:\n1. Scope confirmation\n2. Repository evidence\n3. Component and data-flow decisions\n4. Dependency-ordered implementation checklist (each item names files and verification)\n5. Test checklist\n6. Risks and unanswered questions`;
  }
  if (format === "json") {
    return `Return JSON only, with this shape:\n{\n  "summary": "string",\n  "currentFlow": [{"step":"string","evidence":["path:line"]}],\n  "components": [{"name":"string","status":"observed|proposed","responsibility":"string","inputs":["string"],"outputs":["string"],"state":["string"],"files":["path"]}],\n  "dataFlows": [{"source":"string","target":"string","relationship":"string","payload":"string"}],\n  "implementationSteps": [{"title":"string","files":["path"],"changes":["string"],"verify":"string"}],\n  "tests": ["string"],\n  "risks": ["string"],\n  "unknowns": ["string"]\n}`;
  }
  if (format === "decision-record") {
    return `Return concise Markdown using exactly these sections:\n# Decision\n## Context and repository evidence\n## Current flow\n## Proposed component and data flow\n## Decision and rationale\n## Alternatives considered\n## Implementation sequence\n## Verification\n## Risks and open questions`;
  }
  return `Return concise Markdown using exactly these sections:\n1. Objective and assumptions\n2. Current flow with repository evidence\n3. Proposed component responsibilities and contracts\n4. State ownership and data/API flow\n5. Mermaid flowchart\n6. Dependency-ordered implementation steps with files and verification\n7. Loading, empty, error and retry behavior\n8. Test plan\n9. Risks and unknowns`;
}

function buildPrompt(args: {
  project: ProjectBrief;
  nodes: FlowNode[];
  edges: FlowEdge[];
  targetChat: TargetChat;
  outputFormat: OutputFormat;
  focus: string[];
  customAnalysis: string;
  outputRequirements: string;
}): string {
  const { project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements } = args;
  const targetName = targetChat === "copilot" ? "GitHub Copilot Chat" : targetChat === "codex" ? "Codex" : "the coding assistant";
  const nodeLines = nodes.map((node) => {
    const data = node.data;
    const details = [
      data.responsibility,
      compactList(data.inputs) ? `inputs: ${compactList(data.inputs)}` : "",
      compactList(data.outputs) ? `outputs: ${compactList(data.outputs)}` : "",
      compactList(data.state) ? `owns/uses state: ${compactList(data.state)}` : "",
      data.fileHint ? `likely area: ${data.fileHint}` : "",
      data.notes,
    ].filter(Boolean).join("; ");
    return `- [${KIND_META[data.kind].label}] ${data.label}: ${details}`;
  }).join("\n");
  const edgeLines = edges.map((item) => {
    const source = nodes.find((node) => node.id === item.source)?.data.label ?? item.source;
    const target = nodes.find((node) => node.id === item.target)?.data.label ?? item.target;
    const relationship = item.data?.relationship || String(item.label || "connects");
    return `- ${source} --${relationship}${item.data?.payload ? ` (${item.data.payload})` : ""}--> ${target}${item.data?.notes ? `; ${item.data.notes}` : ""}`;
  }).join("\n");
  const focusLines = FOCUS_OPTIONS.filter(([id]) => focus.includes(id)).map(([, label]) => `- ${label}`).join("\n");

  return `Use ${targetName} to inspect the React repository currently open in VS Code and produce an implementation-ready analysis.\n\nTASK\n${project.objective || "Analyse and plan the described React change."}\n\nPROJECT CONTEXT\n- Plan: ${project.title || "Untitled plan"}\n- Current understanding: ${project.existingContext || "Not supplied; establish this from repository evidence."}\n- Stack: ${project.stack || "Confirm from the repository."}\n- Constraints: ${project.constraints || "No additional constraints supplied."}\n\nINTENDED DESIGN (treat this as proposed context, not proof that code exists)\nComponents and boundaries:\n${nodeLines || "- No planned nodes supplied."}\n\nConnections and data flow:\n${edgeLines || "- No planned connections supplied."}\n\nANALYSE\n${focusLines || "- Reconcile the intended design with the current repository."}${customAnalysis.trim() ? `\n- ${customAnalysis.trim()}` : ""}\n\nRESPONSE CONTRACT\n${outputContract(outputFormat)}${outputRequirements.trim() ? `\nAdditional output requirements: ${outputRequirements.trim()}` : ""}\n\nRULES\n- Inspect the repository before recommending changes; do not rely only on this brief.\n- Cite repository-relative paths and 1-based line numbers for important current-flow claims.\n- Clearly distinguish observed code, reasonable inference, and proposed design.\n- Reconcile naming with existing conventions and identify anything in this plan that conflicts with the codebase.\n- Prefer the smallest coherent implementation and avoid duplicating state.\n- Be concise: include only information needed to make and verify the change.\n- Do not implement code unless explicitly asked after the plan is reviewed.`;
}

function layoutGraph(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", ranksep: 86, nodesep: 48, marginx: 34, marginy: 34 });
  nodes.forEach((node) => graph.setNode(node.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((item) => graph.setEdge(item.source, item.target));
  dagre.layout(graph);
  return nodes.map((node) => {
    const point = graph.node(node.id) as { x: number; y: number };
    return { ...node, position: { x: point.x - NODE_W / 2, y: point.y - NODE_H / 2 } };
  });
}

export default function Home() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(INITIAL_EDGES);
  const [project, setProject] = useState(INITIAL_PROJECT);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [tab, setTab] = useState<PanelTab>("prompt");
  const [targetChat, setTargetChat] = useState<TargetChat>("copilot");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown-mermaid");
  const [focus, setFocus] = useState<string[]>(DEFAULT_FOCUS);
  const [customAnalysis, setCustomAnalysis] = useState("");
  const [outputRequirements, setOutputRequirements] = useState("Keep the answer below roughly 1,200 words unless a critical risk needs explanation.");
  const [repoScope, setRepoScope] = useState(DEFAULT_REPO_SCOPE);
  const [analysisOutput, setAnalysisOutput] = useState("");
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [copied, setCopied] = useState<"build" | "analysis">();
  const [toast, setToast] = useState("");
  const [savedAt, setSavedAt] = useState<string>();
  const [hydrated, setHydrated] = useState(false);
  const flowRef = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const analysisFileRef = useRef<HTMLInputElement | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((item) => item.id === selectedEdgeId);
  const prompt = useMemo(() => buildPrompt({ project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements }), [customAnalysis, edges, focus, nodes, outputFormat, outputRequirements, project, targetChat]);
  const analysisPrompt = useMemo(() => buildRepoAnalysisPrompt(targetChat === "copilot" ? "GitHub Copilot Chat" : targetChat === "codex" ? "Codex" : "the coding assistant", repoScope), [repoScope, targetChat]);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as SavedPlan;
          if (saved.version === 1 && Array.isArray(saved.nodes) && Array.isArray(saved.edges)) {
            setProject(saved.project);
            setNodes(saved.nodes);
            setEdges(saved.edges);
            setTargetChat(saved.targetChat ?? "copilot");
            setOutputFormat(saved.outputFormat ?? "markdown-mermaid");
            setFocus(saved.focus ?? DEFAULT_FOCUS);
            setCustomAnalysis(saved.customAnalysis ?? "");
            setOutputRequirements(saved.outputRequirements ?? "");
            setRepoScope(saved.repoScope ?? DEFAULT_REPO_SCOPE);
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const saved: SavedPlan = { version: 1, project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements, repoScope };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [customAnalysis, edges, focus, hydrated, nodes, outputFormat, outputRequirements, project, repoScope, targetChat]);

  const addNode = (kind: NodeKind) => {
    const id = uid(kind);
    const index = nodes.length;
    setNodes((current) => [...current, { id, type: "planner", position: { x: 100 + (index % 3) * 48, y: 90 + (index % 4) * 52 }, data: makeNodeData(kind) }]);
    setSelectedNodeId(id);
    setSelectedEdgeId(undefined);
    setTab("inspect");
  };

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const id = uid("edge");
    setEdges((current) => [...current, edge(id, connection.source!, connection.target!, "connects")]);
    setSelectedEdgeId(id);
    setSelectedNodeId(undefined);
    setTab("inspect");
  }, [setEdges]);

  const updateNode = (patch: Partial<PlannerNodeData>) => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  };

  const updateEdge = (patch: Partial<PlannerEdgeData>) => {
    if (!selectedEdgeId) return;
    setEdges((current) => current.map((item) => {
      if (item.id !== selectedEdgeId) return item;
      const data = { relationship: item.data?.relationship ?? "connects", payload: item.data?.payload ?? "", notes: item.data?.notes ?? "", ...patch };
      return { ...item, label: data.relationship, data };
    }));
  };

  const deleteSelection = () => {
    if (selectedNodeId) {
      setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setEdges((current) => current.filter((item) => item.source !== selectedNodeId && item.target !== selectedNodeId));
      setSelectedNodeId(undefined);
    } else if (selectedEdgeId) {
      setEdges((current) => current.filter((item) => item.id !== selectedEdgeId));
      setSelectedEdgeId(undefined);
    }
  };

  const autoLayout = () => {
    setNodes((current) => layoutGraph(current, edges));
    window.setTimeout(() => void flowRef.current?.fitView({ padding: .18, duration: 400 }), 30);
  };

  const copyText = async (value: string, mode: "build" | "analysis", message: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(mode);
    flash(message);
    window.setTimeout(() => setCopied(undefined), 1600);
  };

  const copyPrompt = () => copyText(prompt, "build", "Build prompt copied — paste it into VS Code chat");
  const copyAnalysisPrompt = () => copyText(analysisPrompt, "analysis", "Analysis prompt copied — paste it into VS Code chat");

  const download = (contents: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPlan = () => {
    const saved: SavedPlan = { version: 1, project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements, repoScope };
    download(JSON.stringify(saved, null, 2), `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flowspec"}.json`, "application/json");
  };

  const exportMermaid = () => {
    const mermaid = buildMermaidFlow(
      nodes.map((node) => ({ id: node.id, label: node.data.label, kind: node.data.kind })),
      edges.map((item) => ({ source: item.source, target: item.target, relationship: item.data?.relationship ?? String(item.label ?? "connects"), payload: item.data?.payload })),
    );
    download(mermaid, `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flowspec"}.mmd`, "text/plain");
    flash("Mermaid map downloaded");
  };

  const importPlan = async (file?: File) => {
    if (!file) return;
    try {
      const saved = JSON.parse(await file.text()) as SavedPlan;
      if (saved.version !== 1 || !Array.isArray(saved.nodes) || !Array.isArray(saved.edges)) throw new Error("Invalid plan");
      setProject(saved.project);
      setNodes(saved.nodes);
      setEdges(saved.edges);
      setTargetChat(saved.targetChat ?? "copilot");
      setOutputFormat(saved.outputFormat ?? "markdown-mermaid");
      setFocus(saved.focus ?? DEFAULT_FOCUS);
      setCustomAnalysis(saved.customAnalysis ?? "");
      setOutputRequirements(saved.outputRequirements ?? "");
      setRepoScope(saved.repoScope ?? DEFAULT_REPO_SCOPE);
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
      flash("Plan loaded");
      window.setTimeout(() => void flowRef.current?.fitView({ padding: .18, duration: 400 }), 60);
    } catch {
      flash("That file is not a valid FlowSpec plan");
    }
  };

  const loadAnalysisResponse = async (file?: File) => {
    if (!file) return;
    try {
      setAnalysisOutput(await file.text());
      setImportError("");
      setImportSummary("");
      setTab("import");
      flash("Analysis response loaded — review and import it");
    } catch {
      setImportError("FlowSpec could not read that response file.");
    }
  };

  const importRepoMap = () => {
    setImportError("");
    setImportSummary("");
    try {
      const imported = parseRepoAnalysis(analysisOutput);
      const importedNodes: FlowNode[] = imported.nodes.map((item, index) => ({
        id: item.id,
        type: "planner",
        position: { x: (index % 4) * 30, y: Math.floor(index / 4) * 30 },
        data: {
          label: item.label,
          kind: item.kind,
          responsibility: item.responsibility,
          fileHint: item.fileHint,
          state: item.state,
          inputs: item.inputs,
          outputs: item.outputs,
          notes: item.notes,
        },
      }));
      const importedEdges: FlowEdge[] = imported.edges.map((item) => ({
        ...edge(item.id, item.source, item.target, item.relationship, item.payload),
        data: { relationship: item.relationship, payload: item.payload, notes: item.notes },
      }));
      const openQuestions = imported.unknowns.length ? `\n\nOpen questions from repository analysis:\n- ${imported.unknowns.join("\n- ")}` : "";
      setProject({ ...imported.project, existingContext: `${imported.project.existingContext}${openQuestions}`.trim() });
      setNodes(layoutGraph(importedNodes, importedEdges));
      setEdges(importedEdges);
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
      const summary = `Imported ${importedNodes.length} nodes and ${importedEdges.length} connections`;
      setImportSummary(summary);
      setTab("inspect");
      flash(summary);
      window.setTimeout(() => void flowRef.current?.fitView({ padding: .18, duration: 500 }), 80);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "FlowSpec could not import that analysis response.");
    }
  };

  const newPlan = () => {
    if (!window.confirm("Start a new plan? Export the current plan first if you want to keep a separate copy.")) return;
    setProject({ title: "Untitled React plan", objective: "", existingContext: "", constraints: "", stack: "React, TypeScript" });
    setNodes([{ id: "entry", type: "planner", position: { x: 100, y: 120 }, data: makeNodeData("route", "Route / entry") }]);
    setEdges([]);
    setSelectedNodeId("entry");
    setSelectedEdgeId(undefined);
    setImportError("");
    setImportSummary("");
    setAnalysisOutput("");
    setTab("brief");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Braces size={18} /></span><span>FlowSpec</span><span className="beta">React planner</span></div>
        <div className="top-actions">
          <button className="button ghost" onClick={newPlan}><FileJson size={14} /> New</button>
          <button className="button ghost" onClick={() => fileRef.current?.click()}><FolderOpen size={14} /> Open</button>
          <button className="button ghost" onClick={exportPlan}><Save size={14} /> Export</button>
          <button className="button ghost" onClick={() => setTab("import")}><Network size={15} /> Map repo</button>
          <button className="button primary" onClick={() => setTab("prompt")}><Sparkles size={15} /> Build prompt</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importPlan(event.target.files?.[0]); event.target.value = ""; }} />
          <input ref={analysisFileRef} type="file" accept="application/json,text/markdown,text/plain,.json,.md,.txt" hidden onChange={(event) => { void loadAnalysisResponse(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
      </header>

      <section className="brief-bar">
        <div className="brief-title"><span className="eyebrow">Plan</span><input value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} aria-label="Plan title" /></div>
        <div className="brief-objective"><span className="eyebrow">Objective</span><input value={project.objective} onChange={(event) => setProject({ ...project, objective: event.target.value })} placeholder="What are you planning to build?" aria-label="Project objective" /></div>
        <button className="brief-edit" onClick={() => setTab("brief")}>Edit brief <ArrowRight size={14} /></button>
      </section>

      <div className="planner-layout">
        <aside className="palette-panel">
          <div className="palette-heading"><Boxes size={15} /><span>Building blocks</span></div>
          <p>Click to add, then connect nodes on the canvas.</p>
          <div className="palette-list">
            {(Object.keys(KIND_META) as NodeKind[]).map((kind) => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              return <button key={kind} style={{ "--kind-color": meta.color } as React.CSSProperties} onClick={() => addNode(kind)}><span><Icon size={14} /></span><strong>{meta.label}</strong><Plus size={13} /></button>;
            })}
          </div>
          <div className="palette-tip"><strong>Round-trip with chat</strong><span>Plan a change for your coding assistant, or import its repository analysis as a map.</span></div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div><button onClick={() => addNode("component")}><Plus size={14} /> Node</button><button onClick={autoLayout}><LayoutGrid size={14} /> Arrange</button><button onClick={() => flowRef.current?.fitView({ padding: .18, duration: 350 })}><Maximize2 size={14} /> Fit</button><button onClick={exportMermaid} disabled={!nodes.length}><Download size={14} /> Mermaid</button></div>
            <span className="save-status"><i /> {savedAt ? `Saved ${savedAt}` : "Saved locally"}</span>
          </div>
          <div className="flow-wrap">
            <ReactFlow<FlowNode, FlowEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={(instance) => { flowRef.current = instance; }}
              onNodeClick={(_event, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(undefined); setTab("inspect"); }}
              onEdgeClick={(_event, item) => { setSelectedEdgeId(item.id); setSelectedNodeId(undefined); setTab("inspect"); }}
              onPaneClick={() => { setSelectedNodeId(undefined); setSelectedEdgeId(undefined); }}
              onNodesDelete={(deleted) => { const ids = new Set(deleted.map((node) => node.id)); setEdges((current) => current.filter((item) => !ids.has(item.source) && !ids.has(item.target))); }}
              fitView
              fitViewOptions={{ padding: .16 }}
              minZoom={.2}
              maxZoom={1.8}
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={24} size={1.15} color="rgba(92, 109, 129, .23)" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable maskColor="rgba(239,243,246,.72)" nodeColor={(node) => KIND_META[(node.data as PlannerNodeData).kind]?.color ?? "#8291a3"} />
            </ReactFlow>
            {!nodes.length ? <div className="empty-canvas"><Boxes size={28} /><strong>Start with a route or component</strong><span>Add building blocks from the left, then connect the flow.</span></div> : null}
          </div>
        </section>

        <aside className="details-panel">
          <div className="tabs">
            <button className={tab === "prompt" ? "active" : ""} onClick={() => setTab("prompt")}>Build</button>
            <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>Repo map</button>
            <button className={tab === "inspect" ? "active" : ""} onClick={() => setTab("inspect")}>Inspector</button>
            <button className={tab === "brief" ? "active" : ""} onClick={() => setTab("brief")}>Brief</button>
          </div>

          {tab === "prompt" ? (
            <div className="panel-scroll prompt-builder">
              <div className="section-title"><div><span className="eyebrow">VS Code handoff</span><h2>Build the implementation prompt</h2></div><span>{prompt.length.toLocaleString()} chars</span></div>
              <div className="form-grid two">
                <label>Target chat<select value={targetChat} onChange={(event) => setTargetChat(event.target.value as TargetChat)}><option value="copilot">GitHub Copilot</option><option value="codex">Codex</option><option value="generic">Generic assistant</option></select></label>
                <label>Output format<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>{(Object.keys(OUTPUT_LABELS) as OutputFormat[]).map((format) => <option value={format} key={format}>{OUTPUT_LABELS[format]}</option>)}</select></label>
              </div>
              <div className="focus-block"><label>What should it analyse?</label><div className="focus-options">{FOCUS_OPTIONS.map(([id, label]) => <button key={id} className={focus.includes(id) ? "selected" : ""} onClick={() => setFocus((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}>{focus.includes(id) ? <Check size={11} /> : <Plus size={11} />}{label}</button>)}</div></div>
              <label className="field-label">Additional analysis instruction<textarea rows={2} value={customAnalysis} onChange={(event) => setCustomAnalysis(event.target.value)} placeholder="e.g. Compare context state with the existing Zustand store." /></label>
              <label className="field-label">Output requirements<textarea rows={2} value={outputRequirements} onChange={(event) => setOutputRequirements(event.target.value)} placeholder="Add any required headings, length limits or schema rules." /></label>
              <div className="prompt-preview-heading"><label>Generated prompt</label><button onClick={() => download(prompt, `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flowspec"}-prompt.md`, "text/markdown")}><Download size={13} /> .md</button></div>
              <textarea className="prompt-preview" readOnly value={prompt} aria-label="Generated prompt" />
              <button className="copy-button" onClick={() => void copyPrompt()}>{copied === "build" ? <Check size={16} /> : <Copy size={16} />}{copied === "build" ? "Copied — paste into VS Code" : `Copy for ${targetChat === "copilot" ? "Copilot" : targetChat === "codex" ? "Codex" : "chat"}`}</button>
            </div>
          ) : null}

          {tab === "import" ? (
            <div className="panel-scroll repo-importer">
              <div className="section-title"><div><span className="eyebrow">Existing repository</span><h2>Turn repo analysis into a map</h2></div></div>
              <div className="roundtrip-steps" aria-label="Repository mapping workflow">
                <div><span>1</span><strong>Prompt chat</strong><small>Analyse the open repo</small></div>
                <ArrowRight size={15} />
                <div><span>2</span><strong>Import output</strong><small>Create an editable map</small></div>
              </div>
              <div className="form-grid repo-controls">
                <label>Target chat<select value={targetChat} onChange={(event) => setTargetChat(event.target.value as TargetChat)}><option value="copilot">GitHub Copilot</option><option value="codex">Codex</option><option value="generic">Generic assistant</option></select></label>
                <label>Analysis scope<textarea rows={3} value={repoScope} onChange={(event) => setRepoScope(event.target.value)} placeholder="Which application area or user flow should the chat trace?" /></label>
              </div>
              <div className="prompt-preview-heading"><label>Repository analysis prompt</label><button onClick={() => download(analysisPrompt, "flowspec-repo-analysis-prompt.md", "text/markdown")}><Download size={13} /> .md</button></div>
              <textarea className="prompt-preview repo-prompt" readOnly value={analysisPrompt} aria-label="Repository analysis prompt" />
              <button className="copy-button" onClick={() => void copyAnalysisPrompt()}>{copied === "analysis" ? <Check size={16} /> : <Copy size={16} />}{copied === "analysis" ? "Copied — run it in VS Code" : `Copy analysis prompt for ${targetChat === "copilot" ? "Copilot" : targetChat === "codex" ? "Codex" : "chat"}`}</button>

              <div className="import-divider"><span>Then bring the response back</span></div>
              <div className="response-heading"><div><strong>Copilot analysis output</strong><span>Paste the whole response or its fenced FlowSpec JSON block.</span></div><button className="text-button" onClick={() => analysisFileRef.current?.click()}><FolderOpen size={13} /> Load file</button></div>
              <textarea className={`analysis-output${importError ? " invalid" : ""}`} value={analysisOutput} onChange={(event) => { setAnalysisOutput(event.target.value); setImportError(""); setImportSummary(""); }} rows={10} spellCheck={false} aria-label="Copilot analysis output" aria-invalid={Boolean(importError)} placeholder={'Paste Copilot\'s complete response here. FlowSpec will find the ```flowspec JSON block automatically.'} />
              {importError ? <div className="import-message error" role="alert"><strong>Couldn’t import this response</strong><span>{importError}</span></div> : null}
              {importSummary ? <div className="import-message success" role="status"><Check size={15} /><span>{importSummary}</span></div> : null}
              <button className="import-button" disabled={!analysisOutput.trim()} onClick={importRepoMap}><Upload size={16} /> Import and replace canvas</button>
              <p className="import-note">Importing replaces the current canvas. Export the current plan first if you need a separate copy.</p>
            </div>
          ) : null}

          {tab === "inspect" ? (
            <div className="panel-scroll inspector">
              {!selectedNode && !selectedEdge ? <div className="empty-inspector"><Boxes size={24} /><strong>Select a node or connection</strong><span>Edit its responsibility, contracts, state or payload here.</span></div> : null}
              {selectedNode ? <><div className="section-title"><div><span className="eyebrow">Node contract</span><h2>{selectedNode.data.label}</h2></div><button className="danger-icon" onClick={deleteSelection}><Trash2 size={15} /></button></div><div className="form-grid"><label>Type<select value={selectedNode.data.kind} onChange={(event) => updateNode({ kind: event.target.value as NodeKind })}>{(Object.keys(KIND_META) as NodeKind[]).map((kind) => <option value={kind} key={kind}>{KIND_META[kind].label}</option>)}</select></label><label>Name<input value={selectedNode.data.label} onChange={(event) => updateNode({ label: event.target.value })} /></label><label>Responsibility<textarea rows={3} value={selectedNode.data.responsibility} onChange={(event) => updateNode({ responsibility: event.target.value })} /></label><label>Existing or likely file area<input value={selectedNode.data.fileHint} placeholder="src/features/products/…" onChange={(event) => updateNode({ fileHint: event.target.value })} /></label></div><ListEditor title="Inputs" items={selectedNode.data.inputs} placeholder="prop, parameter or event" onChange={(inputs) => updateNode({ inputs })} /><ListEditor title="Outputs" items={selectedNode.data.outputs} placeholder="render, callback or result" onChange={(outputs) => updateNode({ outputs })} /><ListEditor title="State" items={selectedNode.data.state} placeholder="owned or consumed state" onChange={(state) => updateNode({ state })} /><label className="field-label">Notes<textarea rows={3} value={selectedNode.data.notes} onChange={(event) => updateNode({ notes: event.target.value })} /></label></> : null}
              {selectedEdge ? <><div className="section-title"><div><span className="eyebrow">Connection</span><h2>{nodes.find((node) => node.id === selectedEdge.source)?.data.label} → {nodes.find((node) => node.id === selectedEdge.target)?.data.label}</h2></div><button className="danger-icon" onClick={deleteSelection}><Trash2 size={15} /></button></div><div className="form-grid"><label>Relationship<input list="relationship-options" value={selectedEdge.data?.relationship ?? "connects"} onChange={(event) => updateEdge({ relationship: event.target.value })} /><datalist id="relationship-options">{RELATIONSHIPS.map((relationship) => <option value={relationship} key={relationship} />)}</datalist></label><label>Data or contract<input value={selectedEdge.data?.payload ?? ""} placeholder="filters: ProductFilters" onChange={(event) => updateEdge({ payload: event.target.value })} /></label><label>Notes<textarea rows={4} value={selectedEdge.data?.notes ?? ""} onChange={(event) => updateEdge({ notes: event.target.value })} /></label></div></> : null}
            </div>
          ) : null}

          {tab === "brief" ? (
            <div className="panel-scroll brief-editor"><div className="section-title"><div><span className="eyebrow">Project context</span><h2>Give the prompt a clear brief</h2></div></div><div className="form-grid"><label>Plan title<input value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} /></label><label>Objective<textarea rows={3} value={project.objective} onChange={(event) => setProject({ ...project, objective: event.target.value })} placeholder="What should change and why?" /></label><label>Current understanding<textarea rows={4} value={project.existingContext} onChange={(event) => setProject({ ...project, existingContext: event.target.value })} placeholder="What do you already know about the existing flow?" /></label><label>Stack and conventions<input value={project.stack} onChange={(event) => setProject({ ...project, stack: event.target.value })} /></label><label>Constraints<textarea rows={4} value={project.constraints} onChange={(event) => setProject({ ...project, constraints: event.target.value })} placeholder="Compatibility, deadlines, architecture rules…" /></label></div></div>
          ) : null}
        </aside>
      </div>
      <footer className="statusbar"><span><i /> Local-first · repository analysis via VS Code chat</span><span>{nodes.length} nodes · {edges.length} connections · {OUTPUT_LABELS[outputFormat]}</span></footer>
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
