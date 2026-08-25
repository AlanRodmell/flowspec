import assert from "node:assert/strict";
import test from "node:test";
import { decodeSharePayload, encodeSharePayload } from "./flowspec-share.ts";

test("round-trips a unicode FlowSpec share payload", () => {
  const payload = { version: 1, project: { title: "Café checkout → confirmation" }, nodes: [{ id: "route", label: "Route" }] };
  assert.deepEqual(decodeSharePayload(encodeSharePayload(payload)), payload);
});

test("rejects a malformed share payload", () => {
  assert.throws(() => decodeSharePayload("not-valid-json"));
});
