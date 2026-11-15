import test from "node:test";
import assert from "node:assert/strict";
import { validatePlacement } from "../src/placement.js";
const t = { id: "place-ring", objectId: "ring", targetId: "assembly" };
test("assembly placement has a 2 mm centering contract, never a 95 mm acquisition contract", () => {
  for (const x of [0, 0.002])
    assert.equal(
      validatePlacement(t, {
        objectId: "ring",
        targetId: "assembly",
        center: { x, z: 0 },
        target: { x: 0, z: 0 },
      }).ok,
      true,
    );
  for (const x of [0.0021, 0.05])
    assert.equal(
      validatePlacement(t, {
        objectId: "ring",
        targetId: "assembly",
        center: { x, z: 0 },
        target: { x: 0, z: 0 },
      }).ok,
      false,
    );
  assert.equal(
    validatePlacement(t, {
      objectId: "ring",
      targetId: "reservoir",
      center: { x: 0, z: 0 },
      target: { x: 0, z: 0 },
    }).ok,
    false,
  );
});

test("the procedure rejects invalid validated placement and records successful placement provenance", async () => {
  const { createExperiment, PREPARATION } = await import("../src/procedure.js");
  const e = createExperiment();
  for (const step of PREPARATION.slice(0, 22)) e.act(step.id);
  const bad = {
    objectId: "ring",
    targetId: "assembly",
    center: { x: 0.1, z: 0.115 },
    target: { x: 0.05, z: 0.115 },
  };
  assert.equal(e.act("place-ring", bad).ok, false);
  assert.equal(e.currentTask().id, "place-ring");
  bad.center.x = 0.05;
  assert.equal(e.act("place-ring", bad).ok, true);
  assert.deepEqual(e.state.history.at(-1).placement, bad);
});
