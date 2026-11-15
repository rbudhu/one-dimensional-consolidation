import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createExperiment, PREPARATION } from "../src/procedure.js";
import { READING_MINUTES, PRESSURES_TSF, SPECIMEN } from "../src/physics.js";

const { createLoadingAutomation } = await import("../src/loading-automation.js")
  .catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return {};
    throw error;
  });
function prepare() {
  const e = createExperiment();
  for (const task of PREPARATION) assert.equal(e.act(task.id).ok, true);
  return e;
}
function recordStage(e) {
  for (const minutes of READING_MINUTES) {
    assert.equal(e.tick(100000).ok, true);
    assert.equal(e.state.elapsedMinutes, minutes);
    assert.equal(e.recordReading().ok, true);
  }
}
function ready() {
  const e = prepare();
  recordStage(e);
  assert.equal(e.nextIncrement().ok, true);
  recordStage(e);
  return e;
}

test("automation start is opt-in and guarded by the completed second increment", () => {
  assert.equal(typeof createLoadingAutomation, "function", "automation factory exists");
  const e = createExperiment(), automation = createLoadingAutomation(e);
  const initial = { active: false, paused: false, complete: false, completedIncrements: 0, recordedCount: 0 };
  assert.deepEqual(automation.state, initial);
  let before = structuredClone(e.state);
  assert.equal(automation.start().ok, false);
  assert.deepEqual(e.state, before);
  for (const task of PREPARATION) e.act(task.id);
  assert.equal(automation.start().ok, false);
  recordStage(e);
  assert.equal(automation.start().ok, false);
  e.nextIncrement();
  assert.equal(automation.start().ok, false);
  for (const minutes of READING_MINUTES.slice(0, -1)) {
    e.tick(100000);
    e.recordReading();
  }
  before = structuredClone(e.state);
  assert.equal(automation.start().ok, false);
  assert.deepEqual(e.state, before);
  e.tick(100000);
  e.recordReading();
  e.setSpeed(60);
  assert.equal(automation.start().ok, true);
  assert.equal(e.state.stageIndex, 2);
  assert.equal(e.state.speed, 86400);
  assert.equal(e.state.readings.length, 30);
  assert.deepEqual(automation.state, { ...initial, active: true });
  before = structuredClone(e.state);
  assert.equal(automation.start().ok, false);
  assert.deepEqual(e.state, before);
  assert.equal(e.state.history.at(-1).actionId, "next-increment");
});

test("two manual plus nine automatic increments use every due guard and match full manual physics", () => {
  const e = ready(), baseline = prepare();
  e.setSpeed(3600);
  const captures = [], transitions = [];
  const record = e.recordReading, next = e.nextIncrement;
  e.recordReading = (options) => {
    const count = e.state.readings.filter((r) => r.stageIndex === e.state.stageIndex).length;
    assert.equal(e.state.elapsedMinutes, READING_MINUTES[count], "capture is at actual due time");
    assert.deepEqual(options, { recordedBy: "automatic" });
    const result = record(options);
    assert.equal(result.ok, true);
    captures.push([e.state.stageIndex, e.state.elapsedMinutes]);
    return result;
  };
  e.nextIncrement = () => {
    assert.equal(e.state.elapsedMinutes, 1440);
    transitions.push(e.state.stageIndex);
    return next();
  };
  const automation = createLoadingAutomation(e);
  assert.equal(automation.start().ok, true);
  assert.equal(typeof automation.tick, "function", "automation advances synchronously");
  assert.equal(automation.tick(9).ok, true);
  assert.deepEqual(automation.state, { active: false, paused: false, complete: true, completedIncrements: 9, recordedCount: 135 });
  assert.equal(e.state.speed, 3600);
  assert.equal(e.state.phase, "final");
  assert.equal(e.currentTask().id, "release-load");
  assert.deepEqual(transitions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(captures, PRESSURES_TSF.slice(2).flatMap((_, i) => READING_MINUTES.map((t) => [i + 2, t])));
  assert.equal(new Set(captures.map(([stage, t]) => `${stage}:${t}`)).size, 135);
  assert.equal(e.state.readings.length, 165);
  for (let i = 0; i < PRESSURES_TSF.length; i++) {
    recordStage(baseline);
    baseline.nextIncrement();
  }
  const physicalRows = (rows) => rows.map(({ recordedBy, ...physical }) => physical);
  assert.deepEqual(physicalRows(e.state.readings), physicalRows(baseline.state.readings));
  assert.deepEqual(e.state.readings.map((r) => r.recordedBy), [...Array(30).fill("learner"), ...Array(135).fill("automatic")]);
  assert.deepEqual(e.state.history.filter((h) => h.actionId === "record-reading").map((h) => h.reading), e.state.readings);
  assert.deepEqual(e.state.stages, baseline.state.stages);
  assert.deepEqual(e.state.model, baseline.state.model);
  assert.deepEqual(e.state.stages.map((s) => s.pressureTsf), PRESSURES_TSF);
  assert.equal(e.state.model.dryMassG, SPECIMEN.dryMassG);
  assert.equal(e.state.model.wetMassG, SPECIMEN.dryMassG * (1 + e.state.model.voidRatio / SPECIMEN.Gs));
  assert.deepEqual(e.state.history.filter((h) => h.actionId === "next-increment"), baseline.state.history.filter((h) => h.actionId === "next-increment"));
});

test("pause freezes the automatic clock and resume preserves the remaining schedule", () => {
  const e = ready(), automation = createLoadingAutomation(e);
  automation.start();
  automation.tick(0.25);
  const before = structuredClone(e.state), progress = structuredClone(automation.state);
  assert.equal(typeof automation.setPaused, "function", "automation can pause");
  assert.equal(automation.setPaused(true).ok, true);
  assert.deepEqual(automation.state, { ...progress, paused: true });
  assert.equal(automation.tick(100).ok, true);
  assert.deepEqual(e.state, before);
  assert.equal(automation.setPaused(false).ok, true);
  assert.equal(automation.tick(8.75).ok, true);
  assert.equal(automation.state.complete, true);
  assert.equal(e.state.readings.length, 165);
});

test("reset cancels automation without resetting the experiment and restores speed only for the original run", () => {
  for (const resetExperimentFirst of [false, true]) {
    const e = ready(), automation = createLoadingAutomation(e), state = automation.state;
    e.setSpeed(60);
    automation.start();
    automation.tick(0.25);
    automation.setPaused(true);
    const before = structuredClone(e.state);
    if (resetExperimentFirst) e.reset();
    assert.equal(typeof automation.reset, "function", "wrapper reset exists");
    assert.equal(automation.reset().ok, true);
    assert.equal(automation.state, state);
    assert.deepEqual(state, { active: false, paused: false, complete: false, completedIncrements: 0, recordedCount: 0 });
    assert.equal(e.state.speed, resetExperimentFirst ? 1 : 60);
    if (resetExperimentFirst) assert.equal(e.state.history.length, 0);
    else {
      assert.equal(e.state.phase, before.phase);
      assert.equal(e.state.stageIndex, before.stageIndex);
      assert.equal(e.state.elapsedMinutes, before.elapsedMinutes);
      assert.deepEqual(e.state.readings, before.readings);
      assert.deepEqual(e.state.model, before.model);
    }
    const cancelled = structuredClone(e.state);
    automation.tick(100);
    automation.reset();
    assert.deepEqual(e.state, cancelled, "no callbacks or repeated speed history after cancellation");
    e.reset();
    for (const task of PREPARATION) e.act(task.id);
    recordStage(e);
    e.nextIncrement();
    recordStage(e);
    assert.equal(automation.start().ok, true);
    automation.tick(9);
    assert.equal(automation.state.complete, true);
  }
});

test("automation is physically identical to independent immutable 441d200 reference readings", async () => {
  const reference = JSON.parse(await readFile(new URL("../reports/two-load-baseline/reference-fully-manual.json", import.meta.url), "utf8"));
  assert.equal(reference.source, "441d200");
  const e = ready(), automation = createLoadingAutomation(e);
  automation.start();
  automation.tick(9);
  assert.deepEqual(e.state.readings.map(({ recordedBy, ...physical }) => physical), reference.readings);
  assert.deepEqual(e.state.measurements, reference.measurements);
  assert.deepEqual(e.state.stages.map((s) => s.pressureTsf), reference.pressures);
  assert.deepEqual(READING_MINUTES, reference.timestamps);
  assert.equal(e.state.phase, reference.phase);
});

test("fragmented frame budgets and a huge finite tick retain every exact reference observation", async () => {
  const reference = JSON.parse(await readFile(new URL("../reports/two-load-baseline/reference-fully-manual.json", import.meta.url), "utf8"));
  for (const step of [1 / 60, 0.001, 0.07, Number.MAX_VALUE]) {
    const e = ready(), automation = createLoadingAutomation(e);
    automation.start();
    let calls = 0;
    while (automation.state.active && calls < 10000) {
      assert.equal(automation.tick(step).ok, true);
      calls++;
    }
    assert.equal(automation.state.complete, true, `bounded completion for ${step}`);
    assert.equal(automation.state.recordedCount, 135);
    assert.deepEqual(e.state.readings.map(({ recordedBy, ...physical }) => physical), reference.readings);
  }
});

test("zero budget captures only the due zero-minute reading and full budget crosses stages without loss", () => {
  const e = ready(), automation = createLoadingAutomation(e);
  automation.start();
  assert.equal(automation.tick(0).ok, true);
  assert.equal(automation.state.recordedCount, 1);
  assert.equal(e.state.elapsedMinutes, 0);
  assert.equal(e.state.readings.at(-1).minutes, 0);
  const snapshot = structuredClone(e.state);
  automation.tick(0);
  assert.deepEqual(e.state, snapshot, "no duplicate capture at zero budget");
  automation.tick(1);
  assert.equal(automation.state.completedIncrements, 1);
  assert.equal(automation.state.recordedCount, 16);
  assert.equal(e.state.stageIndex, 3);
  assert.equal(e.state.elapsedMinutes, 0);
  automation.tick(8);
  assert.equal(automation.state.completedIncrements, 9);
  assert.equal(automation.state.recordedCount, 135);
});

test("completed automation holds the last load until explicit interactive release and recovery", () => {
  const e = ready(), automation = createLoadingAutomation(e);
  e.setSpeed(60);
  automation.start();
  automation.tick(100000);
  assert.equal(e.state.phase, "final");
  assert.equal(e.state.model.pressureTsf, 0.5);
  assert.equal(e.currentTask().id, "release-load");
  assert.equal(e.state.history.some((h) => h.actionId === "release-load"), false);
  const before = structuredClone(e.state);
  automation.tick(100000);
  assert.deepEqual(e.state, before);
  assert.equal(automation.start().ok, false);
  for (const id of ["release-load", "disassemble", "blot", "weigh-final-wet", "weigh-can", "transfer-soil", "oven-place"]) {
    assert.equal(e.currentTask().id, id);
    assert.equal(e.act(id).ok, true);
  }
  assert.equal(e.act("dry-oven").ok, false);
  automation.tick(100000);
  assert.equal(e.state.ovenMinutes, 0, "idle wrapper does not drive final handling");
  e.tick(959);
  assert.equal(e.act("dry-oven").ok, false);
  e.tick(1);
  assert.equal(e.act("dry-oven").ok, true);
  assert.equal(e.act("weigh-dry").ok, true);
  assert.equal(e.state.phase, "complete");
  assert.equal(e.state.measurements.finalDryCanG, SPECIMEN.dryMassG + SPECIMEN.canMassG);
});

test("experiment reset invalidates a running wrapper before any subsequent clock or history", () => {
  const e = ready(), automation = createLoadingAutomation(e);
  automation.start();
  automation.tick(0.25);
  e.reset();
  const fresh = structuredClone(e.state);
  assert.equal(automation.tick(1).ok, true);
  assert.equal(automation.state.active, false);
  assert.deepEqual(e.state, fresh);
  for (const task of PREPARATION) e.act(task.id);
  const preparation = structuredClone(e.state);
  automation.tick(100);
  assert.deepEqual(e.state, preparation, "stale wrapper cannot record a restarted experiment");
});

test("invalid clock budgets are rejected without mutation even when inactive or paused", () => {
  const e = ready(), automation = createLoadingAutomation(e);
  for (const mode of ["idle", "active", "paused"]) {
    if (mode === "active") automation.start();
    if (mode === "paused") automation.setPaused(true);
    for (const seconds of [-1, NaN, Infinity, -Infinity, undefined, null, "1"]) {
      const before = structuredClone(e.state), state = structuredClone(automation.state);
      assert.equal(automation.tick(seconds).ok, false, `${mode}: ${seconds}`);
      assert.deepEqual(e.state, before);
      assert.deepEqual(automation.state, state);
    }
  }
});
