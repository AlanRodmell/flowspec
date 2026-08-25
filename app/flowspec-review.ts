import type { RepoNodeKind } from "./flowspec-import";

export interface ReviewProject {
  title: string;
  objective: string;
  existingContext: string;
  constraints: string;
  stack: string;
}

export interface ReviewNode {
  id: string;
  kind: RepoNodeKind;
  label: string;
  responsibility: string;
  fileHint: string;
  inputs: string[];
  outputs: string[];
  state: string[];
  notes: string;
}

export interface ReviewEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  payload: string;
  notes: string;
}

export type ReviewGapSeverity = "review" | "note";
export type ReviewGapArea = "Brief" | "Structure" | "Contracts" | "State" | "Evidence" | "Tests";

export interface ReviewGap {
  id: string;
  area: ReviewGapArea;
  severity: ReviewGapSeverity;
  title: string;
  detail: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ReviewLayer {
  id: string;
  label: string;
  nodes: ReviewNode[];
}

export interface TechnicalReviewModel {
  gaps: ReviewGap[];
  layers: ReviewLayer[];
  connectedNodeIds: Set<string>;
  completeContractCount: number;
  evidenceCount: number;
  reviewGapCount: number;
}

const DEFAULT_RESPONSIBILITY = "Describe this part of the flow.";
const HIERARCHY: Array<{ id: string; label: string; kinds: RepoNodeKind[] }> = [
  { id: "entry", label: "Entry", kinds: ["route"] },
  { id: "ui", label: "UI", kinds: ["component"] },
  { id: "logic", label: "Logic & state", kinds: ["hook", "state"] },
  { id: "services", label: "Services", kinds: ["service"] },
  { id: "boundaries", label: "Boundaries", kinds: ["api", "external"] },
  { id: "verification", label: "Verification", kinds: ["test"] },
];

function hasValues(values: string[]): boolean {
  return values.some((value) => value.trim());
}

function hasResponsibility(node: ReviewNode): boolean {
  const value = node.responsibility.trim();
  return Boolean(value && value !== DEFAULT_RESPONSIBILITY);
}

function gap(id: string, area: ReviewGapArea, severity: ReviewGapSeverity, title: string, detail: string, target?: { nodeId?: string; edgeId?: string }): ReviewGap {
  return { id, area, severity, title, detail, ...target };
}

export function buildTechnicalReview(project: ReviewProject, nodes: ReviewNode[], edges: ReviewEdge[]): TechnicalReviewModel {
  const gaps: ReviewGap[] = [];
  const connectedNodeIds = new Set(edges.flatMap((item) => [item.source, item.target]));

  if (!project.objective.trim()) gaps.push(gap("brief-objective", "Brief", "review", "Objective is missing", "Add the user-visible outcome this plan should deliver."));
  if (!project.stack.trim()) gaps.push(gap("brief-stack", "Brief", "note", "Stack is not recorded", "Record the relevant framework and conventions so the build prompt can reconcile them."));
  if (!project.constraints.trim()) gaps.push(gap("brief-constraints", "Brief", "note", "Constraints are not recorded", "Capture compatibility, accessibility or architectural constraints that should shape the implementation."));
  if (nodes.length && !nodes.some((node) => node.kind === "route")) gaps.push(gap("structure-entry", "Structure", "note", "No route or entry point is mapped", "Confirm how a user or parent system enters this flow."));

  nodes.forEach((node) => {
    if (nodes.length > 1 && !connectedNodeIds.has(node.id)) gaps.push(gap(`node-${node.id}-disconnected`, "Structure", "review", `${node.label} is disconnected`, "Connect it to the flow or remove it from this plan.", { nodeId: node.id }));
    if (!hasResponsibility(node)) gaps.push(gap(`node-${node.id}-responsibility`, "Contracts", "review", `${node.label} needs a responsibility`, "Describe the single architectural role this node owns.", { nodeId: node.id }));
    if (!hasValues(node.inputs) && !hasValues(node.outputs)) gaps.push(gap(`node-${node.id}-contract`, "Contracts", "review", `${node.label} has no contract`, "Record at least one input, output, callback or effect.", { nodeId: node.id }));
    if (node.kind === "state" && !hasValues(node.state)) gaps.push(gap(`node-${node.id}-state`, "State", "review", `${node.label} has no state ownership`, "Name the state it owns, reads or derives.", { nodeId: node.id }));
    if (!node.fileHint.trim() && !node.notes.trim()) gaps.push(gap(`node-${node.id}-evidence`, "Evidence", "note", `${node.label} has no evidence`, "Add a likely file location, repository path or supporting note.", { nodeId: node.id }));
  });

  edges.forEach((item) => {
    const relationship = item.relationship.trim().toLowerCase();
    if (!relationship || relationship === "connects") gaps.push(gap(`edge-${item.id}-relationship`, "Structure", "review", "A connection is too generic", "Replace “connects” with the mechanism, such as renders, passes props, calls or writes state.", { edgeId: item.id }));
    if (!item.payload.trim()) gaps.push(gap(`edge-${item.id}-payload`, "Contracts", "note", "A connection has no payload", "Describe the prop, event, query, response or state value crossing this boundary.", { edgeId: item.id }));
    if (!item.notes.trim()) gaps.push(gap(`edge-${item.id}-evidence`, "Evidence", "note", "A connection has no evidence", "Add a path, line reference or concise reason for this relationship.", { edgeId: item.id }));
  });

  if (nodes.length && !nodes.some((node) => node.kind === "test")) gaps.push(gap("tests-boundary", "Tests", "note", "No test boundary is mapped", "Add a test node or record the verification strategy in the technical review."));

  const layers = HIERARCHY.map((layer) => ({ ...layer, nodes: nodes.filter((node) => layer.kinds.includes(node.kind)) })).filter((layer) => layer.nodes.length);
  const completeContractCount = nodes.filter((node) => hasResponsibility(node) && (hasValues(node.inputs) || hasValues(node.outputs))).length;
  const evidenceCount = nodes.filter((node) => node.fileHint.trim() || node.notes.trim()).length;

  return {
    gaps,
    layers,
    connectedNodeIds,
    completeContractCount,
    evidenceCount,
    reviewGapCount: gaps.filter((item) => item.severity === "review").length,
  };
}
