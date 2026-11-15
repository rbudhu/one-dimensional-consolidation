import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three/webgpu";
import {
  createRingGeometry,
  BENCH_LAYOUT,
  specimenStackPositions,
  preparationGeometry,
  dragPayload,
  reservoirWaterSurface,
  dialContactGeometry,
  capturePayload,
  movePayload,
  restorePayload,
  sceneMilestones,
  finalSoilGeometry,
} from "../src/scene.js";

test("preparation cuts a long extrusion to 76.2 mm, pares bore-fit sides and trims faces separately", () => {
  const extruded = preparationGeometry(4),
    cut = preparationGeometry(9),
    pared = preparationGeometry(10),
    inserted = preparationGeometry(11),
    first = preparationGeometry(13),
    second = preparationGeometry(16);
  assert.ok(extruded.lengthM > 0.0762);
  assert.equal(cut.lengthM, 0.0762);
  assert.equal(pared.radiusM, 0.03175);
  assert.equal(inserted.radiusM, 0.03175);
  assert.ok(inserted.bottomExcessM > 0 && inserted.topExcessM > 0);
  assert.equal(first.topExcessM, 0);
  assert.ok(first.bottomExcessM > 0);
  assert.ok(first.lengthM > 0.0254);
  assert.equal(second.lengthM, 0.0254);
  assert.equal(second.bottomExcessM, 0);
  assert.equal(second.topExcessM, 0);
  assert.equal(preparationGeometry(12).inverted, true);
  assert.equal(preparationGeometry(15).inverted, false);
});

test("final can soil fits the container and conserves all solids through drying", () => {
  const wet = finalSoilGeometry(0.024, false),
    dry = finalSoilGeometry(0.024, true),
    area = Math.PI * 0.03175 ** 2;
  assert.ok(wet.radiusM < 0.034);
  assert.ok(wet.heightM < 0.043);
  assert.ok(dry.heightM < 0.043);
  assert.ok(Math.abs(wet.bulkVolumeM3 - area * 0.024) < 1e-12);
  assert.equal(wet.solidsVolumeM3, dry.solidsVolumeM3);
  assert.ok(Math.abs(dry.bulkVolumeM3 - dry.solidsVolumeM3 * 1.5) < 1e-12);
});
test("history controls milestones despite inserted tasks and final phase does not release the load", () => {
  const history = [
    "lower-assembly",
    "flood",
    "center-cap",
    "adjust-contact",
    "zero-dial",
  ].map((actionId) => ({ actionId }));
  const a = sceneMilestones({ phase: "preparation", taskIndex: 0, history }),
    b = sceneMilestones({ phase: "final", taskIndex: 0, history });
  assert.equal(a.index, 30);
  assert.equal(a.lowered, true);
  assert.equal(b.released, false);
  assert.equal(b.engaged, true);
  assert.equal(
    sceneMilestones({ phase: "final", taskIndex: 1, history }).released,
    false,
  );
  assert.equal(
    sceneMilestones({
      phase: "final",
      taskIndex: 0,
      history: [...history, { actionId: "release-load" }],
    }).released,
    true,
  );
});
test("rigid payload carries wrapped plate for weighing, inserted soil and every assembled layer", () => {
  assert.deepEqual(
    dragPayload("ring", { phase: "preparation", taskIndex: 0 }),
    ["ring", "glass", "film"],
  );
  assert.deepEqual(
    dragPayload("ring", { phase: "preparation", taskIndex: 16 }),
    ["ring", "specimen", "glass", "film"],
  );
  assert.deepEqual(
    dragPayload("assembly", { phase: "preparation", taskIndex: 25 }),
    [
      "ring",
      "specimen",
      "stone-bottom",
      "filter-bottom",
      "filter-top",
      "stone-top",
    ],
  );
  assert.deepEqual(dragPayload("ring", { phase: "final", taskIndex: 3 }), [
    "ring",
    "specimen",
    "glass",
    "film",
  ]);
  assert.deepEqual(
    dragPayload("stone-bottom", { phase: "preparation", taskIndex: 19 }),
    ["stone-bottom", "stone-top"],
  );
});
test("drag retains companion offsets and cancellation restores the entire payload", () => {
  const root = new T.Group(),
    frame = new T.Group(),
    ring = new T.Group(),
    glass = new T.Group();
  root.add(frame, glass);
  frame.position.set(0.1, 0, -0.03);
  frame.add(ring);
  ring.position.set(0.02, 0.019, 0.12);
  glass.position.set(0.12, 0.003, 0.09);
  const saved = capturePayload([ring, glass]);
  movePayload(saved, new T.Vector3(0.3, 0.04, -0.2));
  assert.ok(
    ring
      .getWorldPosition(new T.Vector3())
      .distanceTo(new T.Vector3(0.42, 0.059, -0.11)) < 1e-12,
  );
  assert.ok(
    glass.position.distanceTo(new T.Vector3(0.42, 0.043, -0.11)) < 1e-12,
  );
  movePayload(saved, new T.Vector3(0.3, 0.04, -0.2));
  assert.ok(Math.abs(glass.position.x - 0.42) < 1e-12);
  restorePayload(saved);
  assert.deepEqual(ring.position.toArray(), [0.02, 0.019, 0.12]);
  assert.deepEqual(glass.position.toArray(), [0.12, 0.003, 0.09]);
});
test("reservoir conserves expelled void volume and falls again on reabsorption", () => {
  const a = reservoirWaterSurface(0.0254),
    b = reservoirWaterSurface(0.0244),
    c = reservoirWaterSurface(0.025);
  assert.ok(a > 0.016 + specimenStackPositions(0.0254).soil + 0.0254 / 2);
  const area = Math.PI * (0.0475 ** 2 - 0.03475 ** 2),
    soilArea = Math.PI * 0.03175 ** 2;
  assert.ok(Math.abs((b - a) * area - soilArea * 0.001) < 1e-12);
  assert.ok(c < b && c > a);
});
test("dial tip and engaged ram follow cap contact with fixed dial housing", () => {
  const a = dialContactGeometry(0.065, true),
    b = dialContactGeometry(0.06, true),
    released = dialContactGeometry(0.06, false);
  assert.ok(Math.abs(a.contactY - 0.068) < 1e-12);
  assert.equal(a.gapM, 0);
  assert.equal(b.gapM, 0);
  assert.ok(Math.abs(a.leverY - b.leverY - 0.005) < 1e-12);
  assert.ok(released.ramBottomY > b.ramBottomY);
});
test("confinement ring has open bore and physically correct specimen height", () => {
  const g = createRingGeometry(0.03175, 0.03475, 0.0254);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    assert.ok(r >= 0.031749 && r <= 0.034751);
    assert.ok(Math.abs(p.getY(i)) <= 0.012701);
  }
  assert.ok(g.index.count > 100);
});
test("settlement moves top stone and cap, never bottom drainage or ring", () => {
  const a = specimenStackPositions(0.0254),
    b = specimenStackPositions(0.0204);
  assert.equal(a.ring, b.ring);
  assert.equal(a.bottomStone, b.bottomStone);
  assert.ok(Math.abs(a.topStone - b.topStone - 0.005) < 1e-9);
  assert.ok(Math.abs(a.cap - b.cap - 0.005) < 1e-9);
});
test("bench layout identifies essential draggable apparatus", () => {
  for (const id of [
    "ring",
    "glass",
    "shelby",
    "stone-bottom",
    "stone-top",
    "filter-bottom",
    "filter-top",
    "cap",
    "water",
    "straightedge",
    "caliper",
    "can-final",
    "oven",
    "pycnometer",
  ])
    assert.ok(BENCH_LAYOUT[id], id);
});

test("short illustrative insertion projection is trimmed one face at a time", () => {
  const cut = preparationGeometry(9),
    a = preparationGeometry(11),
    b = preparationGeometry(13),
    c = preparationGeometry(15),
    d = preparationGeometry(16);
  assert.equal(cut.lengthM, 0.0762);
  assert.equal(a.bottomExcessM, 0.005);
  assert.ok(Math.abs(a.topExcessM - 0.0458) < 1e-12);
  assert.ok(Math.abs(a.lengthM - 0.0762) < 1e-12);
  assert.ok(Math.abs(b.lengthM - 0.0712) < 1e-12);
  assert.equal(b.topExcessM, 0);
  assert.ok(Math.abs(b.bottomExcessM - 0.0458) < 1e-12);
  assert.ok(Math.abs(c.topExcessM - 0.0458) < 1e-12);
  assert.equal(c.bottomExcessM, 0);
  assert.equal(d.lengthM, 0.0254);
  const area = Math.PI * 0.03175 ** 2;
  assert.ok(Math.abs((a.lengthM - b.lengthM) * area - 0.005 * area) < 1e-15);
  assert.ok(Math.abs((b.lengthM - d.lengthM) * area - 0.0458 * area) < 1e-15);
});
