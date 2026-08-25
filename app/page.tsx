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
  ArrowDown,
  ArrowLeft,
  Boxes,
  Braces,
  Check,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  Component,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  FolderOpen,
  Globe2,
  LayoutGrid,
  Maximize2,
  Network,
  Plus,
  Route,
  Save,
  ServerCog,
  Share2,
  SlidersHorizontal,
  Sparkles,
  TestTube2,
  Trash2,
  Upload,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { getNewNodePosition, sortByHierarchy } from "./flowspec-canvas";
import { GuidedPlanner, type GuidedNodeInput } from "./guided-planner";
import { buildMermaidFlow, buildRepoAnalysisPrompt, buildTechnicalDocument, parseRepoAnalysis, type FlowDirection, type RepoNodeKind } from "./flowspec-import";
import { buildTechnicalReview, type ReviewEdge, type ReviewNode } from "./flowspec-review";
import { decodeSharePayload, encodeSharePayload } from "./flowspec-share";
import { TechnicalReview } from "./technical-review";

type NodeKind = RepoNodeKind;
type PanelTab = "assistant" | "inspect" | "brief";
type HandoffSection = "build" | "map";
type OutputFormat = "markdown-mermaid" | "checklist" | "json" | "decision-record";
type TargetChat = "copilot" | "codex" | "generic";
type LayoutDirection = Extract<FlowDirection, "RL" | "TB">;
type WorkspaceMode = "start" | "planner" | "guided" | "review";

interface PlannerNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  responsibility: string;
  fileHint: string;
  state: string[];
  inputs: string[];
  outputs: string[];
  notes: string;
  flowDirection?: LayoutDirection;
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
  showEdgeLabels?: boolean;
  hiddenKinds?: NodeKind[];
  spotlightSelection?: boolean;
  layoutDirection?: LayoutDirection;
}

const STORAGE_KEY = "flowspec-plan-v1";
const SHARE_BASE_URL = "https://alanrodmell.github.io/flowspec/";
const MAX_SHARE_URL_LENGTH = 100_000;
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
  { id: "route", type: "planner", position: { x: 950, y: 175 }, data: { ...makeNodeData("route", "Product route"), responsibility: "Owns URL search parameters and the page entry.", outputs: ["filter params"] } },
  { id: "page", type: "planner", position: { x: 650, y: 70 }, data: { ...makeNodeData("component", "Product page"), responsibility: "Composes filters, results and page-level states.", inputs: ["filter params"], outputs: ["rendered products"] } },
  { id: "filters", type: "planner", position: { x: 650, y: 285 }, data: { ...makeNodeData("component", "Filter controls"), responsibility: "Edits filter values and emits user intent.", inputs: ["active filters"], outputs: ["onFilterChange"] } },
  { id: "query", type: "planner", position: { x: 330, y: 175 }, data: { ...makeNodeData("hook", "useProductsQuery"), responsibility: "Builds the query key and exposes server state.", inputs: ["filter params"], outputs: ["data", "status", "retry"], state: ["server cache"] } },
  { id: "api", type: "planner", position: { x: 30, y: 175 }, data: { ...makeNodeData("api", "Products API"), responsibility: "Returns filtered product results.", inputs: ["query parameters"], outputs: ["products", "metadata"] } },
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

async function writeClipboard(value: string): Promise<void> {
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
}

function PlannerNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const meta = KIND_META[data.kind];
  const Icon = meta.icon;
  const vertical = data.flowDirection === "TB";
  const targetPosition = vertical ? Position.Top : Position.Right;
  const sourcePosition = vertical ? Position.Bottom : Position.Left;
  return (
    <div className={`planner-node-card${selected ? " selected" : ""}`} style={{ "--node-color": meta.color } as React.CSSProperties}>
      <Handle type="target" position={targetPosition} className="node-handle" />
      <div className="node-kind"><Icon size={12} /> {meta.label}</div>
      <strong>{data.label}</strong>
      <p>{data.responsibility || "No responsibility described."}</p>
      <div className="node-meta"><span>{data.inputs.filter((item) => item.trim()).length} in</span><span>{data.outputs.filter((item) => item.trim()).length} out</span><span>{data.state.filter((item) => item.trim()).length} state</span></div>
      <Handle type="source" position={sourcePosition} className="node-handle" />
    </div>
  );
}

const NODE_TYPES = { planner: PlannerNodeCard };

function InspectorSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="inspector-section">
      <div className="inspector-section-heading"><h3>{title}</h3><p>{description}</p></div>
      {children}
    </section>
  );
}

function ContractEditor({ title, hint, items, placeholder, onChange }: { title: string; hint: string; items: string[]; placeholder: string; onChange: (items: string[]) => void }) {
  return (
    <label className="contract-field">
      <span><strong>{title}</strong><small>{hint}</small></span>
      <textarea rows={2} value={items.join("\n")} placeholder={`${placeholder}\nOne item per line`} onChange={(event) => onChange(event.target.value.split("\n"))} />
    </label>
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

function layoutGraph(nodes: FlowNode[], edges: FlowEdge[], direction: LayoutDirection): FlowNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, ranksep: 86, nodesep: 48, marginx: 34, marginy: 34 });
  sortByHierarchy(nodes).forEach((node) => graph.setNode(node.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((item) => {
    const relationship = (item.data?.relationship ?? String(item.label ?? "")).toLowerCase();
    const feedback = relationship.includes("callback") || relationship.startsWith("returns") || relationship.startsWith("emits");
    graph.setEdge(item.source, item.target, { weight: feedback ? .25 : 2, minlen: 1 });
  });
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
  const [inspectorReturnNodeId, setInspectorReturnNodeId] = useState<string>();
  const [tab, setTab] = useState<PanelTab>("assistant");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("start");
  const [handoffSection, setHandoffSection] = useState<HandoffSection>("build");
  const [targetChat, setTargetChat] = useState<TargetChat>("copilot");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown-mermaid");
  const [focus, setFocus] = useState<string[]>(DEFAULT_FOCUS);
  const [customAnalysis, setCustomAnalysis] = useState("");
  const [outputRequirements, setOutputRequirements] = useState("Keep the answer below roughly 1,200 words unless a critical risk needs explanation.");
  const [repoScope, setRepoScope] = useState(DEFAULT_REPO_SCOPE);
  const [analysisOutput, setAnalysisOutput] = useState("");
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [hiddenKinds, setHiddenKinds] = useState<NodeKind[]>([]);
  const [spotlightSelection, setSpotlightSelection] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>("RL");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [copied, setCopied] = useState<"build" | "analysis">();
  const [toast, setToast] = useState("");
  const [savedAt, setSavedAt] = useState<string>();
  const [hydrated, setHydrated] = useState(false);
  const flowRef = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const flowWrapRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const analysisFileRef = useRef<HTMLInputElement | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((item) => item.id === selectedEdgeId);
  const selectedEdgeSource = selectedEdge ? nodes.find((node) => node.id === selectedEdge.source) : undefined;
  const selectedEdgeTarget = selectedEdge ? nodes.find((node) => node.id === selectedEdge.target) : undefined;
  const inspectorReturnNode = nodes.find((node) => node.id === inspectorReturnNodeId);
  const selectedNodeMeta = selectedNode ? KIND_META[selectedNode.data.kind] : undefined;
  const SelectedNodeIcon = selectedNodeMeta?.icon;
  const selectedNodeConnections = selectedNode ? edges.filter((item) => item.source === selectedNode.id || item.target === selectedNode.id) : [];
  const canvasNodes = useMemo(() => {
    const spotlightIds = new Set<string>();
    if (spotlightSelection && selectedNodeId) {
      spotlightIds.add(selectedNodeId);
      edges.forEach((item) => {
        if (item.source === selectedNodeId) spotlightIds.add(item.target);
        if (item.target === selectedNodeId) spotlightIds.add(item.source);
      });
    }
    return nodes.map((node) => ({
      ...node,
      data: { ...node.data, flowDirection: layoutDirection },
      selected: node.id === selectedNodeId,
      hidden: hiddenKinds.includes(node.data.kind),
      style: { ...node.style, opacity: spotlightIds.size && !spotlightIds.has(node.id) ? .2 : 1, transition: "opacity 160ms ease" },
    }));
  }, [edges, hiddenKinds, layoutDirection, nodes, selectedNodeId, spotlightSelection]);
  const canvasEdges = useMemo(() => {
    const hiddenNodeIds = new Set(nodes.filter((node) => hiddenKinds.includes(node.data.kind)).map((node) => node.id));
    return edges.map((item) => {
      const muted = Boolean(spotlightSelection && selectedNodeId && item.source !== selectedNodeId && item.target !== selectedNodeId);
      return { ...item, hidden: hiddenNodeIds.has(item.source) || hiddenNodeIds.has(item.target), style: { ...item.style, opacity: muted ? .12 : 1, transition: "opacity 160ms ease" }, labelStyle: { ...item.labelStyle, opacity: muted ? .12 : 1 } };
    });
  }, [edges, hiddenKinds, nodes, selectedNodeId, spotlightSelection]);
  const reviewNodes = useMemo<ReviewNode[]>(() => nodes.map((node) => ({ id: node.id, kind: node.data.kind, label: node.data.label, responsibility: node.data.responsibility, fileHint: node.data.fileHint, inputs: node.data.inputs, outputs: node.data.outputs, state: node.data.state, notes: node.data.notes })), [nodes]);
  const reviewEdges = useMemo<ReviewEdge[]>(() => edges.map((item, index) => ({ id: item.id || `edge-${index + 1}`, source: item.source, target: item.target, relationship: item.data?.relationship ?? String(item.label ?? "connects"), payload: item.data?.payload ?? "", notes: item.data?.notes ?? "" })), [edges]);
  const reviewModel = useMemo(() => buildTechnicalReview(project, reviewNodes, reviewEdges), [project, reviewEdges, reviewNodes]);
  const prompt = useMemo(() => buildPrompt({ project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements }), [customAnalysis, edges, focus, nodes, outputFormat, outputRequirements, project, targetChat]);
  const analysisPrompt = useMemo(() => buildRepoAnalysisPrompt(targetChat === "copilot" ? "GitHub Copilot Chat" : targetChat === "codex" ? "Codex" : "the coding assistant", repoScope), [repoScope, targetChat]);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const openHandoff = (section: HandoffSection) => {
    setHandoffSection(section);
    setWorkspaceMode("planner");
    setTab("assistant");
  };

  const inspectNode = (nodeId: string) => {
    setWorkspaceMode("planner");
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    setInspectorReturnNodeId(undefined);
    setTab("inspect");
  };

  const inspectEdge = (edgeId: string, returnNodeId?: string) => {
    setWorkspaceMode("planner");
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(undefined);
    setInspectorReturnNodeId(returnNodeId);
    setTab("inspect");
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const sharedPayload = new URLSearchParams(window.location.hash.slice(1)).get("plan");
      try {
        const raw = sharedPayload ? undefined : window.localStorage.getItem(STORAGE_KEY);
        const saved = sharedPayload ? decodeSharePayload<SavedPlan>(sharedPayload) : raw ? JSON.parse(raw) as SavedPlan : undefined;
        if (saved && saved.version === 1 && Array.isArray(saved.nodes) && Array.isArray(saved.edges)) {
          setProject(saved.project);
          setNodes(saved.nodes);
          setEdges(saved.edges);
          setTargetChat(saved.targetChat ?? "copilot");
          setOutputFormat(saved.outputFormat ?? "markdown-mermaid");
          setFocus(saved.focus ?? DEFAULT_FOCUS);
          setCustomAnalysis(saved.customAnalysis ?? "");
          setOutputRequirements(saved.outputRequirements ?? "");
          setRepoScope(saved.repoScope ?? DEFAULT_REPO_SCOPE);
          setShowEdgeLabels(saved.showEdgeLabels ?? true);
          setHiddenKinds((saved.hiddenKinds ?? []).filter((kind): kind is NodeKind => kind in KIND_META));
          setSpotlightSelection(saved.spotlightSelection ?? false);
          setLayoutDirection(saved.layoutDirection === "TB" ? "TB" : "RL");
          if (sharedPayload) setWorkspaceMode("planner");
          if (sharedPayload) flash("Shared plan loaded — this is now your editable copy");
        } else if (sharedPayload) {
          throw new Error("Invalid shared plan");
        }
      } catch {
        if (sharedPayload) flash("This FlowSpec share link is incomplete or invalid");
        else window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [flash, setEdges, setNodes]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const saved: SavedPlan = { version: 1, project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements, repoScope, showEdgeLabels, hiddenKinds, spotlightSelection, layoutDirection };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [customAnalysis, edges, focus, hiddenKinds, hydrated, layoutDirection, nodes, outputFormat, outputRequirements, project, repoScope, showEdgeLabels, spotlightSelection, targetChat]);

  const addNode = (kind: NodeKind) => {
    const id = uid(kind);
    const index = nodes.length;
    const instance = flowRef.current;
    const canvasBounds = flowWrapRef.current?.getBoundingClientRect();
    const viewportCenter = instance && canvasBounds
      ? instance.screenToFlowPosition({ x: canvasBounds.left + canvasBounds.width / 2, y: canvasBounds.top + canvasBounds.height / 2 })
      : undefined;
    const position = getNewNodePosition({ viewportCenter, nodeCount: index, nodeWidth: NODE_W, nodeHeight: NODE_H });

    setNodes((current) => [...current, { id, type: "planner", position, data: makeNodeData(kind) }]);
    setHiddenKinds((current) => current.filter((item) => item !== kind));
    setSelectedNodeId(id);
    setSelectedEdgeId(undefined);
    setInspectorReturnNodeId(undefined);
    setTab("inspect");
    flash(`${KIND_META[kind].label} added to the centre of the canvas`);
    if (instance) {
      const zoom = Math.min(Math.max(instance.getViewport().zoom, .7), 1.2);
      window.setTimeout(() => void instance.setCenter(position.x + NODE_W / 2, position.y + NODE_H / 2, { zoom, duration: 350 }), 30);
    }
  };

  const addGuidedNode = (input: GuidedNodeInput): string => {
    const id = uid(input.kind);
    const node: FlowNode = {
      id,
      type: "planner",
      position: { x: 100, y: 100 },
      data: {
        ...makeNodeData(input.kind, input.label),
        responsibility: input.responsibility,
        inputs: input.inputs.map((item) => item.trim()).filter(Boolean),
        outputs: input.outputs.map((item) => item.trim()).filter(Boolean),
        state: input.state.map((item) => item.trim()).filter(Boolean),
      },
    };
    const guidedEdge = input.linkNodeId ? edge(
      uid("edge"),
      input.direction === "from-existing" ? input.linkNodeId : id,
      input.direction === "from-existing" ? id : input.linkNodeId,
      input.relationship || "connects",
      input.payload.trim(),
    ) : undefined;
    const nextEdges = guidedEdge ? [...edges, guidedEdge] : edges;
    setNodes((current) => layoutGraph([...current, node], nextEdges, layoutDirection));
    if (guidedEdge) setEdges(nextEdges);
    setHiddenKinds((current) => current.filter((item) => item !== input.kind));
    setSelectedNodeId(id);
    setSelectedEdgeId(undefined);
    setInspectorReturnNodeId(undefined);
    flash(`${input.label} added to the plan`);
    window.setTimeout(() => void flowRef.current?.fitView({ padding: .18, duration: 450 }), 50);
    return id;
  };

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const id = uid("edge");
    setEdges((current) => [...current, edge(id, connection.source!, connection.target!, "connects")]);
    setSelectedEdgeId(id);
    setSelectedNodeId(undefined);
    setInspectorReturnNodeId(connection.source);
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
      setInspectorReturnNodeId(undefined);
    } else if (selectedEdgeId) {
      setEdges((current) => current.filter((item) => item.id !== selectedEdgeId));
      setSelectedEdgeId(undefined);
      setInspectorReturnNodeId(undefined);
    }
  };

  const autoLayout = () => {
    setNodes((current) => layoutGraph(current, edges, layoutDirection));
    window.setTimeout(() => void flowRef.current?.fitView({ padding: .18, duration: 400 }), 30);
    flash("Canvas arranged by architectural hierarchy");
  };

  const changeLayoutDirection = (direction: LayoutDirection) => {
    setLayoutDirection(direction);
    setNodes((current) => layoutGraph(current, edges, direction));
    window.setTimeout(() => void flowRef.current?.fitView({ padding: .18, duration: 400 }), 30);
  };

  const copyText = async (value: string, mode: "build" | "analysis", message: string) => {
    await writeClipboard(value);
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
    const saved: SavedPlan = { version: 1, project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements, repoScope, showEdgeLabels, hiddenKinds, spotlightSelection, layoutDirection };
    download(JSON.stringify(saved, null, 2), `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flowspec"}.json`, "application/json");
  };

  const sharePlan = async () => {
    const saved: SavedPlan = { version: 1, project, nodes, edges, targetChat, outputFormat, focus, customAnalysis, outputRequirements, repoScope, showEdgeLabels, hiddenKinds, spotlightSelection, layoutDirection };
    const shareUrl = `${SHARE_BASE_URL}#plan=${encodeSharePayload(saved)}`;
    if (shareUrl.length > MAX_SHARE_URL_LENGTH) {
      flash("This plan is too large for a reliable link — use Export and share the JSON file instead");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: `FlowSpec — ${project.title}`, text: "Open this editable FlowSpec plan.", url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await writeClipboard(shareUrl);
    flash("Share link copied — anyone with the link can open an editable copy");
  };

  const exportMermaid = () => {
    const mermaid = buildMermaidFlow(
      nodes.map((node) => ({ id: node.id, label: node.data.label, kind: node.data.kind })),
      edges.map((item) => ({ source: item.source, target: item.target, relationship: item.data?.relationship ?? String(item.label ?? "connects"), payload: item.data?.payload })),
      layoutDirection,
    );
    download(mermaid, `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flowspec"}.mmd`, "text/plain");
    flash("Mermaid map downloaded");
  };

  const exportTechnicalDoc = () => {
    const overview = buildTechnicalDocument(
      project,
      nodes.map((node) => ({ id: node.id, label: node.data.label, kind: node.data.kind, responsibility: node.data.responsibility, fileHint: node.data.fileHint, inputs: node.data.inputs, outputs: node.data.outputs, state: node.data.state, notes: node.data.notes })),
      edges.map((item, index) => ({ id: item.id || `edge-${index + 1}`, source: item.source, target: item.target, relationship: item.data?.relationship ?? String(item.label ?? "connects"), payload: item.data?.payload ?? "", notes: item.data?.notes ?? "" })),
      layoutDirection,
    );
    const findings = reviewModel.gaps.length
      ? reviewModel.gaps.map((gap) => `- **${gap.severity === "review" ? "Review" : "Note"} · ${gap.area}:** ${gap.title} — ${gap.detail}`).join("\n")
      : "- No planning gaps detected.";
    const document = `${overview.trim()}\n\n## Review findings\n\n${findings}\n`;
    download(document, `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flowspec"}-technical-overview.md`, "text/markdown");
    setExportMenuOpen(false);
    flash("Technical document downloaded");
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
      setShowEdgeLabels(saved.showEdgeLabels ?? true);
      setHiddenKinds((saved.hiddenKinds ?? []).filter((kind): kind is NodeKind => kind in KIND_META));
      setSpotlightSelection(saved.spotlightSelection ?? false);
      setLayoutDirection(saved.layoutDirection === "TB" ? "TB" : "RL");
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
      setInspectorReturnNodeId(undefined);
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
      openHandoff("map");
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
      setNodes(layoutGraph(importedNodes, importedEdges, layoutDirection));
      setEdges(importedEdges);
      setHiddenKinds([]);
      setSpotlightSelection(false);
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
      setInspectorReturnNodeId(undefined);
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
    setInspectorReturnNodeId(undefined);
    setImportError("");
    setImportSummary("");
    setAnalysisOutput("");
    setShowEdgeLabels(true);
    setHiddenKinds([]);
    setSpotlightSelection(false);
    setLayoutDirection("RL");
    setWorkspaceMode("start");
    setTab("brief");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Braces size={18} /></span><span>FlowSpec</span><span className="beta">React planner</span></div>
        <div className="top-actions">
          <button className="button ghost" onClick={newPlan}><FileJson size={14} /> New</button>
          <button className="button ghost" onClick={() => fileRef.current?.click()}><FolderOpen size={14} /> Open</button>
          <div className="export-control"><button className="button ghost" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((current) => !current)}><Save size={14} /> Export</button>{exportMenuOpen ? <div className="export-menu" role="menu"><button onClick={() => { exportPlan(); setExportMenuOpen(false); }}><FileJson size={15} /><span><strong>Editable plan</strong><small>FlowSpec JSON</small></span></button><button onClick={exportTechnicalDoc}><FileText size={15} /><span><strong>Technical document</strong><small>Markdown with Mermaid</small></span></button><button onClick={() => { exportMermaid(); setExportMenuOpen(false); }}><Network size={15} /><span><strong>Mermaid diagram</strong><small>Standalone .mmd</small></span></button></div> : null}</div>
          <button className="button ghost" onClick={() => void sharePlan()}><Share2 size={14} /> Share</button>
          <button className="button ghost" onClick={() => openHandoff("map")}><Network size={15} /> Map repo</button>
          <button className="button primary" onClick={() => openHandoff("build")}><Sparkles size={15} /> Build prompt</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importPlan(event.target.files?.[0]); event.target.value = ""; }} />
          <input ref={analysisFileRef} type="file" accept="application/json,text/markdown,text/plain,.json,.md,.txt" hidden onChange={(event) => { void loadAnalysisResponse(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
      </header>

      {workspaceMode === "start" ? <section className="start-workspace">
        <div className="start-workspace-heading"><span className="eyebrow">Choose your planning path</span><h1>How do you want to build this plan?</h1><p>Both paths create the same editable diagram, Technical Review and build prompt.</p></div>
        <div className="start-choice-grid">
          <button className="start-choice guided" onClick={() => setWorkspaceMode("guided")}><span><Sparkles size={20} /></span><div><strong>Guided build</strong><p>Answer simple questions about components, hierarchy, props, callbacks and data links.</p><em>Best for planning a page step by step <ArrowRight size={14} /></em></div></button>
          <button className="start-choice manual" onClick={() => setWorkspaceMode("planner")}><span><LayoutGrid size={20} /></span><div><strong>Build it yourself</strong><p>Add and connect nodes directly, or import repository analysis from VS Code chat.</p><em>Open the freeform canvas <ArrowRight size={14} /></em></div></button>
        </div>
        <div className="start-existing"><div><span>Current local plan</span><strong>{project.title}</strong><small>{nodes.length} nodes · {edges.length} connections</small></div><button className="button" onClick={() => setWorkspaceMode("planner")}>Continue plan <ArrowRight size={14} /></button><button className="button ghost" onClick={() => openHandoff("map")}><Network size={14} /> Import repo</button></div>
      </section> : <>
      <section className="brief-bar">
        <div className="brief-title"><span className="eyebrow">Plan</span><input value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} aria-label="Plan title" /></div>
        <div className="brief-objective"><span className="eyebrow">Objective</span><input value={project.objective} onChange={(event) => setProject({ ...project, objective: event.target.value })} placeholder="What are you planning to build?" aria-label="Project objective" /></div>
        <button className="brief-edit" onClick={() => { setWorkspaceMode("planner"); setTab("brief"); }}>Edit brief <ArrowRight size={14} /></button>
      </section>

      <nav className="workspace-mode-bar" aria-label="FlowSpec workspace">
        <div className="workspace-mode-tabs">
          <button className={workspaceMode === "planner" ? "active" : ""} aria-current={workspaceMode === "planner" ? "page" : undefined} onClick={() => setWorkspaceMode("planner")}><LayoutGrid size={14} /> Plan canvas</button>
          <button className={workspaceMode === "guided" ? "active" : ""} aria-current={workspaceMode === "guided" ? "page" : undefined} onClick={() => setWorkspaceMode("guided")}><Sparkles size={14} /> Guided build</button>
          <button className={workspaceMode === "review" ? "active" : ""} aria-current={workspaceMode === "review" ? "page" : undefined} onClick={() => setWorkspaceMode("review")}><ClipboardCheck size={14} /> Technical review{reviewModel.gaps.length ? <span>{reviewModel.gaps.length}</span> : <Check size={13} />}</button>
        </div>
        <p>{workspaceMode === "review" ? "Generated from the current plan · read-only" : workspaceMode === "guided" ? "Simple choices update the same editable plan" : "Build freely or use Hierarchy to order the flow"}</p>
      </nav>

      {workspaceMode === "planner" ? <div className="planner-layout">
        <aside className="palette-panel">
          <div className="palette-heading"><Boxes size={15} /><span>Building blocks</span></div>
          <p>Click to add at the centre of the canvas, then edit it in the Inspector.</p>
          <div className="palette-list">
            {(Object.keys(KIND_META) as NodeKind[]).map((kind) => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              return <button key={kind} aria-label={`Add ${meta.label} to canvas`} style={{ "--kind-color": meta.color } as React.CSSProperties} onClick={() => addNode(kind)}><span><Icon size={14} /></span><strong>{meta.label}</strong><Plus size={13} /></button>;
            })}
          </div>
          <div className="palette-tip"><strong>Round-trip with chat</strong><span>Plan a change for your coding assistant, or import its repository analysis as a map.</span></div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="canvas-actions">
              <button className="toolbar-button" onClick={() => addNode("component")}><Plus size={14} /> Node</button>
              <button className="toolbar-button" onClick={autoLayout} title="Order routes, components, logic, services and boundaries"><LayoutGrid size={14} /> Hierarchy</button>
              <button className="toolbar-button" onClick={() => flowRef.current?.fitView({ padding: .18, duration: 350 })}><Maximize2 size={14} /> Fit</button>
              <div className="view-control">
                <button className={`toolbar-button${hiddenKinds.length || spotlightSelection || !showEdgeLabels ? " active" : ""}`} aria-expanded={viewMenuOpen} onClick={() => setViewMenuOpen((current) => !current)}><SlidersHorizontal size={14} /> View</button>
                {viewMenuOpen ? <div className="view-menu" role="dialog" aria-label="Canvas view controls">
                  <div className="view-menu-heading"><div><strong>Canvas view</strong><span>Arrange and simplify the current view.</span></div><button onClick={() => { setHiddenKinds([]); setSpotlightSelection(false); setShowEdgeLabels(true); changeLayoutDirection("RL"); }}>Reset</button></div>
                  <div className="orientation-control">
                    <span>Flow direction</span>
                    <div>
                      <button className={layoutDirection === "RL" ? "selected" : ""} aria-pressed={layoutDirection === "RL"} onClick={() => changeLayoutDirection("RL")}><ArrowLeft size={13} /><span><strong>Right to left</strong><small>Horizontal</small></span></button>
                      <button className={layoutDirection === "TB" ? "selected" : ""} aria-pressed={layoutDirection === "TB"} onClick={() => changeLayoutDirection("TB")}><ArrowDown size={13} /><span><strong>Top to bottom</strong><small>Vertical</small></span></button>
                    </div>
                  </div>
                  <div className="view-kind-grid">{(Object.keys(KIND_META) as NodeKind[]).map((kind) => {
                    const meta = KIND_META[kind];
                    const Icon = meta.icon;
                    const visible = !hiddenKinds.includes(kind);
                    return <button className={visible ? "visible" : ""} aria-pressed={visible} key={kind} onClick={() => setHiddenKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind])}><span style={{ "--kind-color": meta.color } as React.CSSProperties}><Icon size={12} /></span><strong>{meta.label}</strong>{visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>;
                  })}</div>
                  <div className="view-settings">
                    <button className={spotlightSelection ? "enabled" : ""} aria-pressed={spotlightSelection} onClick={() => setSpotlightSelection((current) => !current)}><span><strong>Spotlight selection</strong><small>Dim nodes outside the selected node’s direct flow</small></span>{spotlightSelection ? <Check size={14} /> : null}</button>
                    <button className={showEdgeLabels ? "enabled" : ""} aria-pressed={showEdgeLabels} onClick={() => setShowEdgeLabels((current) => !current)}><span><strong>Connection labels</strong><small>Show relationship labels on the canvas</small></span>{showEdgeLabels ? <Check size={14} /> : null}</button>
                  </div>
                </div> : null}
              </div>
              <button className="toolbar-button" onClick={exportMermaid} disabled={!nodes.length}><Download size={14} /> Mermaid</button>
            </div>
            <span className="save-status"><i /> {savedAt ? `Saved ${savedAt}` : "Saved locally"}</span>
          </div>
          <div ref={flowWrapRef} className={`flow-wrap${showEdgeLabels ? "" : " labels-hidden"}`}>
            <ReactFlow<FlowNode, FlowEdge>
              nodes={canvasNodes}
              edges={canvasEdges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={(instance) => { flowRef.current = instance; }}
              onNodeClick={(_event, node) => inspectNode(node.id)}
              onEdgeClick={(_event, item) => inspectEdge(item.id)}
              onPaneClick={() => { setSelectedNodeId(undefined); setSelectedEdgeId(undefined); setInspectorReturnNodeId(undefined); }}
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
            <button className={tab === "assistant" ? "active" : ""} onClick={() => setTab("assistant")}>VS Code chat</button>
            <button className={tab === "inspect" ? "active" : ""} onClick={() => setTab("inspect")}>Inspector</button>
          </div>

          {tab === "assistant" ? (
            <div className="panel-scroll handoff-panel">
              <div className="section-title"><div><span className="eyebrow">VS Code handoff</span><h2>Choose the direction</h2></div></div>
              <p className="panel-intro">Send a planned change to chat for implementation, or bring repository analysis back into FlowSpec.</p>

              <div className="handoff-accordion">
                <section className={`handoff-section${handoffSection === "build" ? " open" : ""}`}>
                  <button className="handoff-summary" aria-expanded={handoffSection === "build"} onClick={() => setHandoffSection("build")}><span className="handoff-icon"><Sparkles size={15} /></span><span><strong>Plan → Build</strong><small>Generate an implementation prompt from this canvas</small></span><ChevronDown size={16} /></button>
                  {handoffSection === "build" ? <div className="handoff-content">
                    <div className="form-grid two">
                      <label>Target chat<select value={targetChat} onChange={(event) => setTargetChat(event.target.value as TargetChat)}><option value="copilot">GitHub Copilot</option><option value="codex">Codex</option><option value="generic">Generic assistant</option></select></label>
                      <label>Output format<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>{(Object.keys(OUTPUT_LABELS) as OutputFormat[]).map((format) => <option value={format} key={format}>{OUTPUT_LABELS[format]}</option>)}</select></label>
                    </div>
                    <div className="focus-block"><label>What should it analyse?</label><div className="focus-options">{FOCUS_OPTIONS.map(([id, label]) => <button key={id} className={focus.includes(id) ? "selected" : ""} onClick={() => setFocus((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}>{focus.includes(id) ? <Check size={11} /> : <Plus size={11} />}{label}</button>)}</div></div>
                    <label className="field-label">Additional analysis instruction<textarea rows={2} value={customAnalysis} onChange={(event) => setCustomAnalysis(event.target.value)} placeholder="e.g. Compare context state with the existing Zustand store." /></label>
                    <label className="field-label">Output requirements<textarea rows={2} value={outputRequirements} onChange={(event) => setOutputRequirements(event.target.value)} placeholder="Add any required headings, length limits or schema rules." /></label>
                    <div className="prompt-preview-heading"><label>Generated prompt · {prompt.length.toLocaleString()} chars</label><button onClick={() => download(prompt, `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flowspec"}-prompt.md`, "text/markdown")}><Download size={13} /> .md</button></div>
                    <textarea className="prompt-preview" readOnly value={prompt} aria-label="Generated implementation prompt" />
                    <button className="copy-button" onClick={() => void copyPrompt()}>{copied === "build" ? <Check size={16} /> : <Copy size={16} />}{copied === "build" ? "Copied — paste into VS Code" : `Copy for ${targetChat === "copilot" ? "Copilot" : targetChat === "codex" ? "Codex" : "chat"}`}</button>
                  </div> : null}
                </section>

                <section className={`handoff-section${handoffSection === "map" ? " open" : ""}`}>
                  <button className="handoff-summary" aria-expanded={handoffSection === "map"} onClick={() => setHandoffSection("map")}><span className="handoff-icon"><Network size={15} /></span><span><strong>Repo → Map</strong><small>Analyse an open repo and import its current flow</small></span><ChevronDown size={16} /></button>
                  {handoffSection === "map" ? <div className="handoff-content">
                    <div className="roundtrip-steps" aria-label="Repository mapping workflow"><div><span>1</span><strong>Prompt chat</strong><small>Analyse the open repo</small></div><ArrowRight size={15} /><div><span>2</span><strong>Import output</strong><small>Create an editable map</small></div></div>
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
                  </div> : null}
                </section>
              </div>
            </div>
          ) : null}

          {tab === "inspect" ? (
            <div className="panel-scroll inspector">
              {!selectedNode && !selectedEdge ? <div className="empty-inspector"><Boxes size={25} /><strong>Select something on the canvas</strong><span>Choose a node to review its props, state and connected flow, or choose a connection to edit what it carries.</span></div> : null}

              {selectedNode ? (
                <>
                  <div className="inspector-header">
                    <div>
                      <span className="inspector-kind" style={{ "--node-color": selectedNodeMeta?.color } as React.CSSProperties}>{SelectedNodeIcon ? <SelectedNodeIcon size={13} /> : null}{selectedNodeMeta?.label}</span>
                      <h2>{selectedNode.data.label}</h2>
                    </div>
                    <button className="danger-icon" aria-label={`Delete ${selectedNode.data.label}`} onClick={deleteSelection}><Trash2 size={15} /></button>
                  </div>

                  <InspectorSection title="Identity" description="Name this part of the architecture and define its role.">
                    <div className="form-grid two inspector-identity">
                      <label>Type<select value={selectedNode.data.kind} onChange={(event) => updateNode({ kind: event.target.value as NodeKind })}>{(Object.keys(KIND_META) as NodeKind[]).map((kind) => <option value={kind} key={kind}>{KIND_META[kind].label}</option>)}</select></label>
                      <label>Name<input value={selectedNode.data.label} onChange={(event) => updateNode({ label: event.target.value })} /></label>
                    </div>
                    <div className="form-grid inspector-purpose">
                      <label>Responsibility<textarea rows={2} value={selectedNode.data.responsibility} onChange={(event) => updateNode({ responsibility: event.target.value })} /></label>
                      <label>File or likely location<input value={selectedNode.data.fileHint} placeholder="src/features/products/…" onChange={(event) => updateNode({ fileHint: event.target.value })} /></label>
                    </div>
                  </InspectorSection>

                  <InspectorSection title="Component contract" description="One item per line. These details become part of the generated build prompt.">
                    <div className="contract-grid">
                      <ContractEditor title="Inputs / props received" hint="Props, params and events coming in" items={selectedNode.data.inputs} placeholder="filters: ProductFilters" onChange={(inputs) => updateNode({ inputs })} />
                      <ContractEditor title="Outputs / callbacks emitted" hint="Callbacks, renders and return values" items={selectedNode.data.outputs} placeholder="onFilterChange(filters)" onChange={(outputs) => updateNode({ outputs })} />
                      <ContractEditor title="State used or owned" hint="Local, shared or server state" items={selectedNode.data.state} placeholder="selectedFilters" onChange={(state) => updateNode({ state })} />
                    </div>
                  </InspectorSection>

                  <InspectorSection title="Connected flow" description="Select a row to inspect exactly what crosses that connection.">
                    {selectedNodeConnections.length ? <div className="connection-list">{selectedNodeConnections.map((item) => {
                      const incoming = item.target === selectedNode.id;
                      const peerId = incoming ? item.source : item.target;
                      const peer = nodes.find((node) => node.id === peerId);
                      return <button className="connection-row" key={item.id} onClick={() => inspectEdge(item.id, selectedNode.id)}><span>{incoming ? "From" : "To"}</span><div><strong>{peer?.data.label ?? peerId}</strong><small>{item.data?.relationship ?? String(item.label ?? "connects")}{item.data?.payload ? ` · ${item.data.payload}` : ""}</small></div><ArrowRight size={14} /></button>;
                    })}</div> : <p className="empty-section">No connections yet. Drag between node handles on the canvas to add one.</p>}
                  </InspectorSection>

                  <InspectorSection title="Evidence and notes" description="Record repository evidence, assumptions or implementation context.">
                    <label className="field-label compact-field">Notes<textarea rows={3} value={selectedNode.data.notes} onChange={(event) => updateNode({ notes: event.target.value })} placeholder="Observed: src/features/products/ProductPage.tsx:20" /></label>
                  </InspectorSection>
                </>
              ) : null}

              {selectedEdge ? (
                <>
                  {inspectorReturnNode ? <button className="inspector-back" onClick={() => inspectNode(inspectorReturnNode.id)}><ArrowLeft size={14} /> Back to {inspectorReturnNode.data.label}</button> : null}
                  <div className="inspector-header">
                    <div><span className="eyebrow">Connection</span><h2>{selectedEdgeSource?.data.label} → {selectedEdgeTarget?.data.label}</h2></div>
                    <button className="danger-icon" aria-label="Delete connection" onClick={deleteSelection}><Trash2 size={15} /></button>
                  </div>
                  <InspectorSection title="Data flow" description="Describe the direction and contract crossing this boundary.">
                    <div className="edge-endpoints" aria-label="Connected components">
                      <button onClick={() => inspectNode(selectedEdge.source)}><span>Source</span><strong>{selectedEdgeSource?.data.label ?? selectedEdge.source}</strong><ArrowRight size={13} /></button>
                      <button onClick={() => inspectNode(selectedEdge.target)}><span>Target</span><strong>{selectedEdgeTarget?.data.label ?? selectedEdge.target}</strong><ArrowRight size={13} /></button>
                    </div>
                    <div className="form-grid">
                      <label>Relationship<input list="relationship-options" value={selectedEdge.data?.relationship ?? "connects"} onChange={(event) => updateEdge({ relationship: event.target.value })} /><datalist id="relationship-options">{RELATIONSHIPS.map((relationship) => <option value={relationship} key={relationship} />)}</datalist></label>
                      <label>Props, event or payload<input value={selectedEdge.data?.payload ?? ""} placeholder="filters: ProductFilters" onChange={(event) => updateEdge({ payload: event.target.value })} /></label>
                    </div>
                  </InspectorSection>
                  <InspectorSection title="Evidence and notes" description="Explain where this connection is observed or why it is proposed.">
                    <label className="field-label compact-field">Notes<textarea rows={4} value={selectedEdge.data?.notes ?? ""} onChange={(event) => updateEdge({ notes: event.target.value })} placeholder="Observed: src/routes/products.tsx:16" /></label>
                  </InspectorSection>
                </>
              ) : null}
            </div>
          ) : null}

          {tab === "brief" ? (
            <div className="panel-scroll brief-editor"><div className="section-title"><div><span className="eyebrow">Briefing</span><h2>Set the project context</h2></div><button className="section-action" onClick={() => openHandoff("build")}><Check size={13} /> Done</button></div><p className="panel-intro">This context guides the generated implementation prompt. Edit it here, then select Done when it is ready.</p><div className="form-grid"><label>Plan title<input value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} /></label><label>Objective<textarea rows={3} value={project.objective} onChange={(event) => setProject({ ...project, objective: event.target.value })} placeholder="What should change and why?" /></label><label>Current understanding<textarea rows={4} value={project.existingContext} onChange={(event) => setProject({ ...project, existingContext: event.target.value })} placeholder="What do you already know about the existing flow?" /></label><label>Stack and conventions<input value={project.stack} onChange={(event) => setProject({ ...project, stack: event.target.value })} /></label><label>Constraints<textarea rows={4} value={project.constraints} onChange={(event) => setProject({ ...project, constraints: event.target.value })} placeholder="Compatibility, deadlines, architecture rules…" /></label></div></div>
          ) : null}
        </aside>
      </div> : workspaceMode === "guided" ? <GuidedPlanner nodes={reviewNodes} relationships={RELATIONSHIPS} onAdd={addGuidedNode} onOpenCanvas={() => setWorkspaceMode("planner")} onOpenReview={() => setWorkspaceMode("review")} /> : <TechnicalReview project={project} nodes={reviewNodes} edges={reviewEdges} onEditPlan={() => setWorkspaceMode("planner")} onEditNodeInPlan={inspectNode} onEditEdgeInPlan={inspectEdge} onExport={exportTechnicalDoc} />}
      </>}
      <footer className="statusbar"><span><i /> Local-first · repository analysis via VS Code chat</span><span>{workspaceMode === "start" ? "Guided or freeform planning" : workspaceMode === "review" ? `${reviewModel.reviewGapCount} review gaps · ${reviewModel.gaps.length - reviewModel.reviewGapCount} notes` : `${nodes.length} nodes · ${edges.length} connections · ${OUTPUT_LABELS[outputFormat]}`}</span></footer>
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
