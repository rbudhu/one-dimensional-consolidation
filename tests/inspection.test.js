import test from "node:test";
import assert from "node:assert/strict";
import { poreProfile } from "../src/inspection.js";
import { createStage, evaluateStage } from "../src/physics.js";
test("inspection field is drained at both faces and carries increment at t0", () => {
  const s = createStage(0),
    p = poreProfile(s, evaluateStage(s, 0));
  assert.equal(p.points[0].excessKPa, 0);
  assert.equal(p.points.at(-1).excessKPa, 0);
  assert.ok(Math.abs(p.points[8].excessKPa - s.deltaKPa) < 1e-9);
});
test("inspection responds to real dissipation without amplified geometry", () => {
  const s = createStage(0),
    p = poreProfile(s, evaluateStage(s, 1440));
  assert.ok(p.points.every((p) => Math.abs(p.excessKPa) < 1e-9));
  assert.ok(p.heightMm < 25.4);
});
