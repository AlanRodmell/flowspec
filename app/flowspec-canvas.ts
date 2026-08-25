export interface CanvasPoint {
  x: number;
  y: number;
}

export type CanvasDirection = "RL" | "TB";
export type AnchorSide = "left" | "right" | "top" | "bottom";

export interface EdgeAnchors {
  sourceHandle: `anchor-${AnchorSide}`;
  targetHandle: `anchor-${AnchorSide}`;
}

interface EdgeAnchorOptions {
  source: CanvasPoint;
  target: CanvasPoint;
  direction: CanvasDirection;
  nodeWidth: number;
  nodeHeight: number;
}

interface ConnectedEdge {
  source: string;
  target: string;
}

export type HierarchyKind = "route" | "component" | "hook" | "state" | "service" | "api" | "external" | "test";

const HIERARCHY_ORDER: Record<HierarchyKind, number> = {
  route: 0,
  component: 1,
  hook: 2,
  state: 2,
  service: 3,
  api: 4,
  external: 4,
  test: 5,
};

interface NewNodePositionOptions {
  viewportCenter?: CanvasPoint;
  nodeCount: number;
  nodeWidth: number;
  nodeHeight: number;
}

export function getNewNodePosition({ viewportCenter, nodeCount, nodeWidth, nodeHeight }: NewNodePositionOptions): CanvasPoint {
  if (!viewportCenter) {
    return { x: 100 + (nodeCount % 3) * 48, y: 90 + (nodeCount % 4) * 52 };
  }

  const stagger = ((nodeCount % 5) - 2) * 24;
  return {
    x: viewportCenter.x - nodeWidth / 2 + stagger,
    y: viewportCenter.y - nodeHeight / 2 + stagger,
  };
}

export function sortByHierarchy<T extends { data: { kind: HierarchyKind; label: string } }>(nodes: T[]): T[] {
  return [...nodes].sort((left, right) => HIERARCHY_ORDER[left.data.kind] - HIERARCHY_ORDER[right.data.kind] || left.data.label.localeCompare(right.data.label));
}

export function getEdgeAnchors({ source, target, direction, nodeWidth, nodeHeight }: EdgeAnchorOptions): EdgeAnchors {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const horizontalDistance = Math.abs(deltaX) / nodeWidth;
  const verticalDistance = Math.abs(deltaY) / nodeHeight;
  const horizontal = horizontalDistance === verticalDistance ? direction === "RL" : horizontalDistance > verticalDistance;

  if (horizontal) {
    return deltaX < 0
      ? { sourceHandle: "anchor-left", targetHandle: "anchor-right" }
      : { sourceHandle: "anchor-right", targetHandle: "anchor-left" };
  }

  return deltaY < 0
    ? { sourceHandle: "anchor-top", targetHandle: "anchor-bottom" }
    : { sourceHandle: "anchor-bottom", targetHandle: "anchor-top" };
}

export function getEdgeCurveOffset(edge: ConnectedEdge, edges: ConnectedEdge[]): number {
  return edges.some((candidate) => candidate.source === edge.target && candidate.target === edge.source) ? 18 : 0;
}
