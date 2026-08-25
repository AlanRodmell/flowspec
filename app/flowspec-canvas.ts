export interface CanvasPoint {
  x: number;
  y: number;
}

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
