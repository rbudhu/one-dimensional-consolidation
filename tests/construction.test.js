import test from "node:test";
import assert from "node:assert/strict";
import {
  casagrandeTimeConstruction,
  endPrimaryVoidRatio,
  interpolateTime,
  secondarySlope,
  fitCompression,
  finiteInput,
} from "../src/analysis.js";
test("Casagrande D0 uses readings at t and 4t, D100 uses tangent intersection", () => {
  const rows = [
    { minutes: 0.25, dialDivisions: 12 },
    { minutes: 1, dialDivisions: 17 },
    { minutes: 2, dialDivisions: 20 },
    { minutes: 20, dialDivisions: 40 },
    { minutes: 100, dialDivisions: 42 },
    { minutes: 1000, dialDivisions: 44 },
  ];
  const c = casagrandeTimeConstruction(rows, {
    earlyTime: 0.25,
    primaryStart: 2,
    primaryEnd: 20,
    secondaryStart: 100,
    secondaryEnd: 1000,
  });
  assert.equal(c.D0, 7);
  assert.ok(Number.isFinite(c.D100) && c.D100 > 40 && c.D100 < 44);
  assert.ok(c.intersectionMinutes > 20);
});
test("end-primary void ratio excludes secondary settlement", () => {
  const e = endPrimaryVoidRatio(100, 0.0254, 0.014);
  assert.ok(Math.abs(e - (0.025146 / 0.014 - 1)) < 1e-10);
});

test("null and flat readings cannot invent zero or NaN t50", () => {
  assert.equal(
    interpolateTime(
      [
        { minutes: 1, dialDivisions: 0 },
        { minutes: 2, dialDivisions: 0 },
      ],
      0,
    ),
    null,
  );
  assert.equal(
    interpolateTime(
      [
        { minutes: 1, dialDivisions: -1 },
        { minutes: 2, dialDivisions: 1 },
      ],
      null,
    ),
    null,
  );
});

test("blank/invalid input and invalid selected time ranges are unavailable, while signed unloading is valid", () => {
  for (const v of ["", " ", null, undefined, "NaN", "Infinity"])
    assert.equal(finiteInput(v), null);
  assert.equal(finiteInput("0"), 0);
  const rows = [
    { minutes: 0.25, dialDivisions: 20 },
    { minutes: 1, dialDivisions: 15 },
    { minutes: 4, dialDivisions: 10 },
    { minutes: 15, dialDivisions: 0 },
    { minutes: 240, dialDivisions: -2 },
    { minutes: 1440, dialDivisions: -3 },
  ];
  const c = casagrandeTimeConstruction(rows);
  assert.ok(Number.isFinite(c.D100));
  for (const [a, b] of [
    [0, 15],
    [4, 4],
    [15, 4],
    [-1, 4],
  ]) {
    const invalid = casagrandeTimeConstruction(rows, {
      primaryStart: a,
      primaryEnd: b,
    });
    assert.equal(invalid.D100, null);
    assert.ok(invalid.issues.some((s) => s.includes("strictly increasing")));
  }
  assert.equal(
    secondarySlope(
      { minutes: 1, voidRatio: 0.5 },
      { minutes: 1, voidRatio: 0.4 },
    ),
    null,
  );
  assert.ok(
    secondarySlope(
      { minutes: 1, voidRatio: 0.5 },
      { minutes: 2, voidRatio: 0.6 },
    ) < 0,
  );
  assert.equal(
    fitCompression([
      { pressureKPa: 0, voidRatio: 1 },
      { pressureKPa: 1, voidRatio: 0.5 },
    ]),
    null,
  );
});

test("invalid negative and duplicate recorded times are explicit unavailable constructions", () => {
  const good = [
    { minutes: 1, dialDivisions: 1 },
    { minutes: 2, dialDivisions: 2 },
  ];
  assert.equal(
    interpolateTime([{ minutes: -1, dialDivisions: 0 }, ...good], 1.5),
    null,
  );
  assert.equal(interpolateTime([good[0], good[0], good[1]], 1.5), null);
});
