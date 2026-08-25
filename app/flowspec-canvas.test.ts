import assert from "node:assert/strict";
import test from "node:test";
import { getNewNodePosition, sortByHierarchy } from "./flowspec-canvas.ts";

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
