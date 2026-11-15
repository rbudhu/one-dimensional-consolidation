import test from "node:test";
import assert from "node:assert/strict";
import * as p from "../src/physics.js";
const near = (a, b, t = 1e-10) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test("specimen geometry, saturated masses and US short ton conversion are coherent", () => {
  near(p.tsfToKPa(1), 95.76051798033584);
  near(p.SPECIMEN.areaM2, (Math.PI * 0.0635 ** 2) / 4);
  near(
    p.SPECIMEN.dryMassG,
    ((p.SPECIMEN.areaM2 * 0.0254) / (1 + 0.816)) * 2.72 * 1e6,
  );
  near(p.SPECIMEN.initialWetMassG, p.SPECIMEN.dryMassG * (1 + 0.816 / 2.72));
  assert.deepEqual(p.PRESSURES_TSF, [0.5, 1, 2, 4, 8, 16, 8, 4, 2, 1, 0.5]);
  assert.deepEqual(
    p.READING_MINUTES,
    [0, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240, 480, 1440],
  );
});
test("Terzaghi solution has exact drainage boundaries and convergent average", () => {
  near(p.degreeOfConsolidation(0), 0);
  near(p.degreeOfConsolidation(100), 1);
  near(p.degreeOfConsolidation(0.197), 0.5, 0.001);
  let previous = 0;
  for (const tv of [1e-8, 0.0001, 0.01, 0.1, 1, 10]) {
    const u = p.degreeOfConsolidation(tv);
    assert.ok(u >= previous && u <= 1);
    previous = u;
    near(p.excessPorePressure(0, tv, 100), 0);
    near(p.excessPorePressure(1, tv, 100), 0);
    near(
      p.excessPorePressure(0.2, tv, 100),
      p.excessPorePressure(0.8, tv, 100),
      1e-8,
    );
  }
  near(p.excessPorePressure(0.5, 0, 100), 100);
  near(
    p.excessPorePressure(0.5, 0.2, -100),
    -p.excessPorePressure(0.5, 0.2, 100),
  );
  const tv = 0.2,
    n = 2000;
  let mean = 0;
  for (let i = 0; i < n; i++)
    mean += p.excessPorePressure((i + 0.5) / n, tv, 100) / n;
  near(mean, 100 * (1 - p.degreeOfConsolidation(tv)), 1e-4);
});
test("eleven stress-history stages preserve solids and cumulative dial reference", () => {
  let previous;
  for (let i = 0; i < p.PRESSURES_TSF.length; i++) {
    const stage = p.createStage(i, previous);
    assert.ok(stage.cvM2Year >= 4.2 && stage.cvM2Year <= 7.25);
    const start = p.evaluateStage(stage, 0),
      end = p.evaluateStage(stage, 1440);
    near(start.heightM, previous?.heightM ?? p.SPECIMEN.heightM);
    near(stage.HdrM, stage.startHeightM / 2);
    near(end.dryMassG, p.SPECIMEN.dryMassG);
    near(end.wetMassG, end.dryMassG * (1 + end.voidRatio / p.SPECIMEN.Gs));
    near(end.settlementMm, (p.SPECIMEN.heightM - end.heightM) * 1000);
    near(end.dialDivisions, end.settlementMm / 0.00254);
    near(end.excessAverageKPa, 0, 1e-8);
    assert.ok(end.heightM > 0 && end.voidRatio > 0);
    if (i < 6) assert.ok(end.heightM < start.heightM);
    else assert.ok(end.heightM > start.heightM);
    if (i === 0)
      near(stage.targetE, 0.816 - 0.06 * Math.log10(stage.pressureKPa / 10));
    if (i === 2)
      near(
        stage.targetE,
        stage.startE -
          0.06 * Math.log10(115 / stage.previousPressureKPa) -
          0.23 * Math.log10(stage.pressureKPa / 115),
      );
    if (i >= 6)
      near(
        stage.targetE,
        stage.startE -
          0.06 * Math.log10(stage.pressureKPa / stage.previousPressureKPa),
      );
    const earlier = p.evaluateStage(stage, 60),
      later = p.evaluateStage(stage, 240);
    if (i < 6)
      assert.ok(later.secondarySettlementMm > earlier.secondarySettlementMm);
    previous = end;
  }
  assert.ok(previous.settlementMm > 0);
  assert.throws(() => p.createStage(11), RangeError);
});
test("analysis derives gravimetric values rather than copying model inputs", () => {
  const m = {
    diameterM: 0.0635,
    initialHeightM: 0.0254,
    ringGlassTareG: 241,
    initialWetAssemblyG: 451,
    finalWetAssemblyG: 421,
    finalCanTareG: 32.6,
    finalDryCanG: 182.6,
    aliquotTareG: 12.5,
    aliquotWetCanG: 25.5,
    aliquotDryCanG: 22.5,
    pycnometerDrySoilG: 20,
    pycnometerWaterG: 180,
    pycnometerSoilWaterG: 192,
  };
  const a = p.analysisMeasurements({
    measurements: m,
    model: { heightM: 0.02 },
    stages: [],
    readings: [],
  });
  near(a.dryMassG, 150);
  near(a.w0, 0.3);
  near(a.wf, 0.2);
  near(a.Gs, 2.5);
  near(a.heightSolidsM, 150 / 2.5 / 1e6 / a.areaM2);
  near(a.e0, 0.0254 / a.heightSolidsM - 1);
  near(a.ef, 0.02 / a.heightSolidsM - 1);
  assert.equal(a.fittedCc, null);
  assert.equal(p.analysisMeasurements({ measurements: {} }).dryMassG, null);
});
test("least squares and Casagrande cv expose unit-safe inferred results", () => {
  const fit = p.fitLine([
    { x: 1, y: 5 },
    { x: 2, y: 8 },
    { x: 3, y: 11 },
  ]);
  near(fit.slope, 3);
  near(fit.intercept, 2);
  near(fit.r2, 1);
  assert.equal(
    p.fitLine([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]),
    null,
  );
  assert.equal(p.fitLine([]), null);
  near(
    p.casagrandeCv(0.0127, 10),
    ((0.197 * 0.0127 ** 2) / (10 * 60)) * 365.25 * 86400,
  );
  assert.equal(p.casagrandeCv(0.0127, 0), null);
});
