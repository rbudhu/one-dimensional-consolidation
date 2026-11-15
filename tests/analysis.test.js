import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnalysisState,
  analyzeExperiment,
  exportExperimentCSV,
} from "../src/analysis.js";
import { createExperiment, PREPARATION } from "../src/procedure.js";
import {
  SPECIMEN,
  READING_MINUTES,
  analysisMeasurements,
} from "../src/physics.js";
test('CSV derived section contains only finite meaningful scalars with units and actual selected fits',()=>{
  const e=complete(), a=createAnalysisState();
  a.pressure.firstVirgin=2; a.pressure.tangent=-.14;
  const r=analyzeExperiment(e.state,a,SPECIMEN,analysisMeasurements);
  const csv=exportExperimentCSV(e.state,r,analysisMeasurements);
  assert.ok(!csv.includes('[object Object]'));
  assert.ok(!/fittedCc|fittedCr|inferredPcKPa/.test(csv));
  const rows=csv.split('derived_property,value,unit\n')[1]?.split('\n\n')[0].split('\n');
  assert.ok(rows?.length>0);
  for(const row of rows) { const [key,value,unit]=row.split(','); assert.ok(Number.isFinite(Number(value)),key); assert.ok(unit,key); }
  for(const key of ['Cc','Cr','PcKPa']) assert.ok(csv.includes(`pressure.${key},${r.pressure[key]}`));
  assert.equal(csv.split('\n').filter(row=>/^\d+,/.test(row)).length,165);
});
function complete() {
  const e = createExperiment();
  for (const t of PREPARATION) e.act(t.id);
  for (let i = 0; i < 11; i++) {
    for (const t of READING_MINUTES) {
      e.tick(100000);
      e.recordReading();
    }
    e.nextIncrement();
  }
  while (e.state.phase === "final") {
    e.tick(100000);
    e.act(e.currentTask().id);
  }
  return e;
}
test("early analysis cannot poison completed EOP and selected results export independently of tabs", () => {
  const e = createExperiment(),
    a = createAnalysisState();
  analyzeExperiment(e.state, a, SPECIMEN, analysisMeasurements);
  const full = complete();
  const r = analyzeExperiment(full.state, a, SPECIMEN, analysisMeasurements);
  assert.equal(r.ends.length, 11);
  assert.ok(r.ends.every((p) => p.isPrimary));
  assert.ok(r.pressure.virgin.index > 0);
  a.stage(0).primaryStart = 2;
  a.stage(0).D100 = 123;
  a.stage(0).manualD100 = true;
  a.pressure.firstVirgin = 2;
  a.pressure.tangent = -0.08;
  const selected = analyzeExperiment(
      full.state,
      a,
      SPECIMEN,
      analysisMeasurements,
    ),
    csv = exportExperimentCSV(full.state, selected, analysisMeasurements);
  assert.equal(selected.stages[0].D100, 123);
  assert.ok(
    csv.includes("pressure.virgin.index," + selected.pressure.virgin.index),
  );
  assert.ok(csv.includes("stages.0.controls.primaryStart,2"));
  assert.ok(csv.includes("stages.0.controls.manualD100,true"));
  assert.ok(csv.includes("initialEffectiveStressKPa,10"));
  assert.equal(a.stage(1).primaryStart, 4);
  assert.equal(a.stage(0).primaryStart, 2);
  a.reset();
  assert.equal(a.selectedStage, 0);
  assert.equal(a.stage(0).manualD100, false);
  assert.equal(a.stage(0).D100, null);
});

test("manual finite overrides survive current-reading revisions only in this run; complete reset restores every control", () => {
  const e = complete(),
    a = createAnalysisState(),
    p = a.stage(0);
  Object.assign(p, {
    earlyTime: 0.5,
    primaryStart: 2,
    primaryEnd: 30,
    secondaryStart: 480,
    secondaryEnd: 1440,
    secondaryA: 13,
    secondaryB: 14,
    D0: 0,
    D100: 123,
    manualD0: true,
    manualD100: true,
  });
  a.selectedStage = 8;
  Object.assign(a.pressure, { firstVirgin: 2, tangent: -0.1 });
  const r = analyzeExperiment(e.state, a, SPECIMEN, analysisMeasurements);
  assert.equal(r.stages[0].D0, 0);
  assert.equal(r.stages[0].D100, 123);
  assert.equal(a.stage(1).earlyTime, 0.25);
  assert.equal(a.stage(0).secondaryA, 13);
  e.state.readings[1].dialDivisions += 1;
  assert.equal(
    analyzeExperiment(e.state, a, SPECIMEN, analysisMeasurements).stages[0]
      .D100,
    123,
  );
  a.reset();
  assert.equal(a.selectedStage, 0);
  assert.equal(a.pressure.tangent, null);
  assert.equal(a.pressure.firstVirgin, 3);
  for (const [k, v] of Object.entries({
    earlyTime: 0.25,
    primaryStart: 4,
    primaryEnd: 15,
    secondaryStart: 240,
    secondaryEnd: 1440,
    secondaryA: 12,
    secondaryB: 14,
    manualD0: false,
    manualD100: false,
  }))
    assert.equal(a.stage(0)[k], v);
  const second = complete();
  assert.notEqual(
    analyzeExperiment(second.state, a, SPECIMEN, analysisMeasurements).stages[0]
      .D100,
    123,
  );
});
