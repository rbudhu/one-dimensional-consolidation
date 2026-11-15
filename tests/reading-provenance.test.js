import test from "node:test";
import assert from "node:assert/strict";
import { createExperiment, PREPARATION } from "../src/procedure.js";
import { createLoadingAutomation } from "../src/loading-automation.js";
import { READING_MINUTES, SPECIMEN, analysisMeasurements } from "../src/physics.js";
import { createAnalysisState, analyzeExperiment, exportExperimentCSV } from "../src/analysis.js";

function prepare() {
  const e = createExperiment();
  for (const task of PREPARATION) assert.equal(e.act(task.id).ok, true);
  return e;
}

test("reading provenance defaults to learner and logs an independent truthful copy", () => {
  const e = prepare();
  assert.equal(e.recordReading().ok, true);
  assert.equal(e.state.readings[0].recordedBy, "learner");
  e.tick(6);
  assert.equal(e.recordReading({ recordedBy: "automatic" }).ok, true);
  assert.equal(e.state.readings[1].recordedBy, "automatic");
  e.tick(9);
  assert.equal(e.act("record-reading").ok, true);
  assert.equal(e.state.readings[2].recordedBy, "learner");
  const logged = e.state.history.filter((h) => h.actionId === "record-reading");
  assert.deepEqual(logged.map((h) => h.reading), e.state.readings);
  for (let i = 0; i < logged.length; i++) assert.notEqual(logged[i].reading, e.state.readings[i]);
  e.state.readings[0].recordedBy = "automatic";
  assert.equal(logged[0].reading.recordedBy, "learner");
});

test("invalid reading origins fail before any reading or history mutation", () => {
  const e = prepare();
  for (const recordedBy of ["manual", "Automatic", "", null, 0, {}, []]) {
    const before = structuredClone(e.state);
    assert.equal(e.recordReading({ recordedBy }).ok, false, String(recordedBy));
    assert.deepEqual(e.state, before);
  }
  assert.equal(e.recordReading({}).ok, true);
  assert.equal(e.state.readings[0].recordedBy, "learner");
  assert.equal(e.recordReading({ recordedBy: "automatic" }).ok, false, "future observations remain guarded");
  assert.equal(e.state.readings.length, 1);
});

test("CSV appends truthful origins for all 165 readings while retaining numeric columns and legacy learner defaults", () => {
  const e = prepare();
  for (let stage = 0; stage < 2; stage++) {
    for (const minutes of READING_MINUTES) {
      e.tick(100000);
      assert.equal(e.state.elapsedMinutes, minutes);
      e.recordReading();
    }
    if (stage === 0) e.nextIncrement();
  }
  const automation = createLoadingAutomation(e);
  automation.start();
  automation.tick(9);
  const result = analyzeExperiment(e.state, createAnalysisState(), SPECIMEN, analysisMeasurements);
  const lines = exportExperimentCSV(e.state, result, analysisMeasurements).split("\n");
  assert.equal(lines[2], "stage,pressure_tsf,pressure_kPa,elapsed_min,dial_div,settlement_mm,height_mm,void_ratio,recorded_by");
  const rows = lines.filter((line) => /^\d+,/.test(line)).map((line) => line.split(","));
  assert.equal(rows.length, 165);
  assert.equal(rows.filter((row) => row[8] === "learner").length, 30);
  assert.equal(rows.filter((row) => row[8] === "automatic").length, 135);
  assert.deepEqual(rows.map((row) => row.slice(0, 8)), e.state.readings.map((r) => [
    r.stageIndex + 1, r.pressureTsf, r.pressureKPa, r.minutes, r.dialDivisions,
    r.settlementMm, r.heightM * 1000, r.voidRatio,
  ].map(String)));
  const legacy = structuredClone(e.state);
  delete legacy.readings[0].recordedBy;
  const legacyLines = exportExperimentCSV(legacy, result, analysisMeasurements).split("\n");
  assert.equal(legacyLines[3], lines[3]);
  assert.equal(legacyLines.slice(3, 168).filter((line) => line.endsWith(",automatic")).length, 135);
});
