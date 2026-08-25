import assert from "node:assert/strict";
import test from "node:test";
import { buildTechnicalReview, type ReviewEdge, type ReviewNode, type ReviewProject } from "./flowspec-review.ts";

const project: ReviewProject = { title: "Checkout", objective: "Review checkout", existingContext: "Current flow", constraints: "Keep deep links", stack: "React" };
const nodes: ReviewNode[] = [
  { id: "route", kind: "route", label: "Checkout route", responsibility: "Own the entry point.", fileHint: "src/routes/checkout.tsx", inputs: [], outputs: ["page"], state: [], notes: "Observed" },
  { id: "page", kind: "component", label: "Checkout page", responsibility: "Compose checkout.", fileHint: "src/checkout/Page.tsx", inputs: ["cart"], outputs: ["submit"], state: [], notes: "Observed" },
];
const edges: ReviewEdge[] = [{ id: "route-page", source: "route", target: "page", relationship: "renders", payload: "cart id", notes: "Observed" }];

test("builds the review from a self-authored diagram", () => {
  const review = buildTechnicalReview(project, nodes, edges);
  assert.equal(review.completeContractCount, 2);
  assert.equal(review.evidenceCount, 2);
  assert.deepEqual(review.layers.map((layer) => layer.label), ["Entry", "UI"]);
  assert.equal(review.connectedNodeIds.has("page"), true);
});

test("reports actionable structural and contract gaps", () => {
  const incomplete: ReviewNode = { id: "orphan", kind: "state", label: "Checkout state", responsibility: "Describe this part of the flow.", fileHint: "", inputs: [], outputs: [], state: [], notes: "" };
  const review = buildTechnicalReview(project, [...nodes, incomplete], edges);
  const titles = review.gaps.map((item) => item.title);
  assert.ok(titles.includes("Checkout state is disconnected"));
  assert.ok(titles.includes("Checkout state needs a responsibility"));
  assert.ok(titles.includes("Checkout state has no contract"));
  assert.ok(titles.includes("Checkout state has no state ownership"));
});

test("flags generic connections without payload or evidence", () => {
  const review = buildTechnicalReview(project, nodes, [{ ...edges[0], relationship: "connects", payload: "", notes: "" }]);
  assert.ok(review.gaps.some((item) => item.edgeId === "route-page" && item.area === "Structure"));
  assert.ok(review.gaps.some((item) => item.edgeId === "route-page" && item.area === "Contracts"));
  assert.ok(review.gaps.some((item) => item.edgeId === "route-page" && item.area === "Evidence"));
});
