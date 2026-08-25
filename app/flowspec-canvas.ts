export interface CanvasPoint {
  x: number;
  y: number;
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
