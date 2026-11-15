import test from "node:test";
import assert from "node:assert/strict";
import { SOUND_TYPES, seededNoise } from "../src/audio.js";
test("procedural apparatus effects use finite reproducible noise", () => {
  const a = seededNoise(1024, 17),
    b = seededNoise(1024, 17);
  assert.deepEqual(a, b);
  assert.ok(a.every((v) => Number.isFinite(v) && Math.abs(v) <= 1));
  assert.ok(a.some((v) => Math.abs(v) > 0.5));
});
test("sound routes cover preparation, water, loading, reading and oven", () => {
  for (const v of ["place", "cut", "water", "load", "read", "oven"])
    assert.ok(SOUND_TYPES.includes(v));
});
