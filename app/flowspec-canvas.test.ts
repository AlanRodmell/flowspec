import assert from "node:assert/strict";
import test from "node:test";
import { getEdgeAnchors, getEdgeCurveOffset, getNewNodePosition, sortByHierarchy } from "./flowspec-canvas.ts";

test("places a new node around the visible viewport centre", () => {
  assert.deepEqual(getNewNodePosition({ viewportCenter: { x: 500, y: 400 }, nodeCount: 2, nodeWidth: 248, nodeHeight: 166 }), {
    x: 376,
    y: 317,
  });
});

test("uses a stagger so repeated additions are not exactly stacked", () => {
  const first = getNewNodePosition({ viewportCenter: { x: 500, y: 400 }, nodeCount: 2, nodeWidth: 248, nodeHeight: 166 });
  const second = getNewNodePosition({ viewportCenter: { x: 500, y: 400 }, nodeCount: 3, nodeWidth: 248, nodeHeight: 166 });
  assert.notDeepEqual(first, second);
});

test("keeps a safe fallback before the canvas instance is ready", () => {
  assert.deepEqual(getNewNodePosition({ nodeCount: 0, nodeWidth: 248, nodeHeight: 166 }), { x: 100, y: 90 });
});

test("orders nodes by the architectural hierarchy", () => {
  const nodes = [
    { id: "api", data: { kind: "api" as const, label: "Products API" } },
    { id: "component-b", data: { kind: "component" as const, label: "Results" } },
    { id: "route", data: { kind: "route" as const, label: "Products route" } },
    { id: "hook", data: { kind: "hook" as const, label: "useProducts" } },
    { id: "component-a", data: { kind: "component" as const, label: "Filters" } },
  ];
  assert.deepEqual(sortByHierarchy(nodes).map((node) => node.id), ["route", "component-a", "component-b", "hook", "api"]);
});

test("routes horizontal flow through the nearest facing anchors", () => {
  const anchors = getEdgeAnchors({ source: { x: 900, y: 100 }, target: { x: 500, y: 130 }, direction: "RL", nodeWidth: 248, nodeHeight: 166 });
  assert.deepEqual(anchors, { sourceHandle: "anchor-left", targetHandle: "anchor-right" });
});

test("routes reverse horizontal flow directly instead of looping around nodes", () => {
  const anchors = getEdgeAnchors({ source: { x: 500, y: 130 }, target: { x: 900, y: 100 }, direction: "RL", nodeWidth: 248, nodeHeight: 166 });
  assert.deepEqual(anchors, { sourceHandle: "anchor-right", targetHandle: "anchor-left" });
});

test("routes vertical flow through top and bottom anchors", () => {
  const anchors = getEdgeAnchors({ source: { x: 100, y: 100 }, target: { x: 130, y: 450 }, direction: "TB", nodeWidth: 248, nodeHeight: 166 });
  assert.deepEqual(anchors, { sourceHandle: "anchor-bottom", targetHandle: "anchor-top" });
});

test("uses actual geometry for same-rank neighbours", () => {
  const anchors = getEdgeAnchors({ source: { x: 100, y: 100 }, target: { x: 120, y: 380 }, direction: "RL", nodeWidth: 248, nodeHeight: 166 });
  assert.deepEqual(anchors, { sourceHandle: "anchor-bottom", targetHandle: "anchor-top" });
});

test("gives reciprocal connections a small separating curve", () => {
  const edges = [{ source: "route", target: "filters" }, { source: "filters", target: "route" }];
  assert.equal(getEdgeCurveOffset(edges[0], edges), 18);
  assert.equal(getEdgeCurveOffset({ source: "page", target: "query" }, edges), 0);
});
