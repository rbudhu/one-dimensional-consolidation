import test from "node:test";
import assert from "node:assert/strict";
import {
  balanceMeasurement,
  BALANCE_FIELDS,
  appliedLoad,
} from "../src/measurements.js";
import { createExperiment, PREPARATION } from "../src/procedure.js";
test("balance uses successful typed mass actions and preserves the previous weighing through dimensions and timers", () => {
  const e = createExperiment();
  for (const t of PREPARATION.slice(0, 8)) {
    e.act(t.id);
    const m = balanceMeasurement(e.state);
    assert.equal(m.unit, "g");
    if (t.id === "aliquot-dry") assert.equal(m.value, 22.5);
    if (t.id === "measure-diameter" || t.id === "measure-height")
      assert.equal(m.field, "ringGlassTareG");
    if (t.id === "measure-gs") assert.equal(m.field, "pycnometerSoilWaterG");
  }
  e.state.history.push({
    actionId: "other",
    measurements: { dryMinutes: 960, massSomething: 999 },
  });
  assert.equal(balanceMeasurement(e.state).field, "pycnometerSoilWaterG");
});

test("each explicit balance field is selected from its own successful measurement history", () => {
  for (const [actionId, field] of Object.entries(BALANCE_FIELDS)) {
    const s = {
      history: [
        {
          actionId,
          measurements: {
            [field]: 22.5,
            aliquotDryingMinutes: 960,
            diameterM: 0.0635,
          },
        },
      ],
    };
    assert.deepEqual(balanceMeasurement(s), {
      field,
      value: 22.5,
      unit: "g",
      actionId,
    });
    assert.equal(
      balanceMeasurement({
        history: [{ actionId, measurements: { [field]: NaN } }],
      }),
      null,
    );
  }
});
test("applied load stays engaged in final phase until named release succeeds", () => {
  const s = {
    phase: "final",
    history: [{ actionId: "adjust-contact" }],
    model: { pressureTsf: 0.5, pressureKPa: 47.88025 },
  };
  assert.equal(appliedLoad(s).pressureKPa, 47.88025);
  s.history.push({ actionId: "release-load" });
  assert.equal(appliedLoad(s).pressureKPa, 0);
});
