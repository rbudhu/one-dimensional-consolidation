import test from "node:test";
import assert from "node:assert/strict";
import {
  interpolateTime,
  fitCompression,
  casagrandeIntersection,
  secondarySlope,
} from "../src/notebook.js";
test("t50 interpolates in log time between recorded dial readings", () => {
  const t = interpolateTime(
    [
      { minutes: 1, dialDivisions: 10 },
      { minutes: 100, dialDivisions: 30 },
    ],
    20,
  );
  assert.ok(Math.abs(t - 10) < 1e-8);
});
test("compression fit uses base-ten pressure slope", () => {
  const f = fitCompression([
    { pressureKPa: 100, voidRatio: 0.8 },
    { pressureKPa: 1000, voidRatio: 0.57 },
  ]);
  assert.ok(Math.abs(f.index - 0.23) < 1e-9);
});
test("Casagrande bisector intersects virgin compression line", () => {
  const pc = casagrandeIntersection(
    { pressureKPa: 100, voidRatio: 0.8 },
    -0.05,
    { slope: -0.23, intercept: 1.26 },
  );
  assert.ok(Number.isFinite(pc) && pc > 0);
});
test("secondary compression uses change in void ratio over log time", () =>
  assert.ok(
    Math.abs(
      secondarySlope(
        { minutes: 10, voidRatio: 0.8 },
        { minutes: 1000, voidRatio: 0.79 },
      ) - 0.005,
    ) < 1e-9,
  ));
