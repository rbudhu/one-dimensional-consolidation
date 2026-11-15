import test from "node:test";
import assert from "node:assert/strict";
import * as p from "../src/procedure.js";
import {
  SPECIMEN,
  READING_MINUTES,
  analysisMeasurements,
} from "../src/physics.js";
const ids =
  "weigh-tare measure-diameter measure-height extrude aliquot-tare aliquot-wet aliquot-dry measure-gs cut-segment pare-horizontal insert-gently invert-first cut-first support-glass invert-second cut-second weigh-wet remove-glass peel-wrap soak-stones bottom-stone bottom-filter place-ring top-filter top-stone lower-assembly flood center-cap adjust-contact zero-dial".split(
    " ",
  );
function prepare(e) {
  for (const id of ids) assert.equal(e.act(id).ok, true, id);
}
test("preparation rejects every out-of-order action and records granular steps", () => {
  assert.deepEqual(
    p.PREPARATION.map((t) => t.id),
    ids,
  );
  const e = p.createExperiment();
  assert.equal(e.state.phase, "preparation");
  assert.equal(e.recordReading().ok, false);
  assert.equal(e.nextIncrement().ok, false);
  for (const id of ids) {
    const task = e.currentTask();
    assert.equal(task.id, id);
    for (const wrong of ids.filter((x) => x !== id))
      assert.equal(e.act(wrong).ok, false, wrong);
    assert.equal(e.act("unknown").ok, false);
    if (task.objectId && task.targetId)
      assert.match(task.instruction, /Drag .+ to .+/);
    assert.ok(task.section && task.buttonLabel);
    assert.equal(e.act(id).ok, true);
    assert.equal(e.state.history.at(-1).actionId, id);
  }
  assert.equal(e.state.phase, "loading");
  assert.equal(e.state.stageIndex, 0);
  assert.equal(e.state.measurements.ringGlassTareG, 241);
  assert.equal(
    e.state.measurements.initialWetAssemblyG,
    241 + SPECIMEN.initialWetMassG,
  );
  const m = e.state.measurements;
  assert.ok(
    Math.abs(
      m.pycnometerDrySoilG /
        (m.pycnometerDrySoilG + m.pycnometerWaterG - m.pycnometerSoilWaterG) -
        2.72,
    ) < 1e-12,
  );
  assert.match(
    p.PREPARATION.find((t) => t.id === "aliquot-dry").instruction,
    /16 h/,
  );
  assert.doesNotThrow(() => JSON.stringify(e.state));
});
test("clock clamps each next due reading and cannot fabricate future observations", () => {
  const e = p.createExperiment();
  prepare(e);
  assert.equal(e.currentTask().id, "record-reading");
  assert.equal(e.nextIncrement().ok, false);
  assert.equal(e.setSpeed(86400).ok, true);
  e.tick(100);
  assert.equal(e.state.elapsedMinutes, 0);
  assert.equal(e.recordReading().ok, true);
  assert.equal(e.state.readings[0].minutes, 0);
  assert.equal(e.recordReading().ok, false);
  e.tick(100);
  assert.equal(e.state.elapsedMinutes, 0.1);
  e.tick(100);
  assert.equal(e.state.elapsedMinutes, 0.1);
  assert.equal(e.recordReading().ok, true);
  for (const minutes of READING_MINUTES.slice(2)) {
    assert.equal(e.recordReading().ok, false);
    e.tick(100);
    assert.equal(e.state.elapsedMinutes, minutes);
    assert.equal(e.recordReading().ok, true);
  }
  assert.equal(e.recordReading().ok, false);
  assert.equal(e.currentTask().id, "next-increment");
  const before = e.state.model.heightM;
  assert.equal(e.nextIncrement().ok, true);
  assert.equal(e.state.stageIndex, 1);
  assert.equal(e.state.elapsedMinutes, 0);
  assert.equal(e.state.model.heightM, before);
});
test("speed validation and reset preserve the public state reference", () => {
  const e = p.createExperiment(),
    state = e.state;
  for (const speed of [1, 60, 3600, 86400])
    assert.equal(e.setSpeed(speed).ok, true);
  for (const speed of [0, -1, 2, NaN, Infinity])
    assert.equal(e.setSpeed(speed).ok, false);
  assert.equal(e.tick(-1).ok, false);
  assert.equal(e.tick(NaN).ok, false);
  prepare(e);
  e.recordReading();
  e.tick(1);
  e.reset();
  assert.equal(e.state, state);
  assert.equal(state.phase, "preparation");
  assert.equal(state.speed, 1);
  assert.equal(state.history.length, 0);
  assert.equal(state.model, null);
});
function finishLoading(e) {
  e.setSpeed(86400);
  for (let index = 0; index < 11; index++) {
    assert.equal(e.state.stageIndex, index);
    for (const minutes of READING_MINUTES) {
      e.tick(100);
      assert.equal(e.state.elapsedMinutes, minutes);
      assert.equal(e.act("record-reading").ok, true);
    }
    assert.equal(e.act("next-increment").ok, true);
  }
}
test("full eleven-stage experiment requires actual 16-hour final oven timer", () => {
  const e = p.createExperiment();
  prepare(e);
  finishLoading(e);
  assert.equal(e.state.phase, "final");
  assert.equal(e.state.stages.length, 11);
  assert.equal(e.state.readings.length, 11 * READING_MINUTES.length);
  const finalIds =
    "release-load disassemble blot weigh-final-wet weigh-can transfer-soil oven-place dry-oven weigh-dry".split(
      " ",
    );
  for (const id of finalIds) {
    assert.equal(e.currentTask().id, id);
    for (const wrong of finalIds.filter((x) => x !== id))
      assert.equal(e.act(wrong).ok, false);
    if (id === "dry-oven") {
      assert.equal(e.act(id).ok, false);
      assert.equal(e.state.ovenMinutes, 0);
      e.setSpeed(60);
      e.tick(959);
      assert.equal(e.state.ovenMinutes, 959);
      assert.equal(e.act(id).ok, false);
      e.tick(1);
      assert.equal(e.state.ovenMinutes, 960);
      e.tick(100);
      assert.equal(e.state.ovenMinutes, 960);
    } else {
      const before = e.state.ovenMinutes;
      e.tick(100);
      assert.equal(e.state.ovenMinutes, before);
    }
    assert.equal(e.act(id).ok, true, id);
    assert.equal(e.state.history.at(-1).actionId, id);
  }
  assert.equal(e.state.phase, "complete");
  assert.equal(e.currentTask().id, "complete");
  assert.equal(
    e.state.history.find((entry) => entry.actionId === "dry-oven").ovenMinutes,
    960,
  );
  assert.equal(e.act("weigh-dry").ok, false);
  assert.equal(e.recordReading().ok, false);
  const m = e.state.measurements;
  assert.equal(m.finalWetAssemblyG, e.state.model.wetMassG + 241);
  assert.equal(m.finalDryCanG, SPECIMEN.dryMassG + SPECIMEN.canMassG);
  const a = analysisMeasurements(e.state);
  assert.ok(Math.abs(a.w0 - SPECIMEN.e0 / SPECIMEN.Gs) < 1e-12);
  assert.ok(Math.abs(a.ef - e.state.model.voidRatio) < 1e-12);
  assert.ok(Math.abs(a.wf - a.ef / a.Gs) < 1e-12);
  assert.equal(a.stageResults.length, 11);
  assert.ok(
    a.stageResults.every((r) => r.readingCount === READING_MINUTES.length),
  );
});
