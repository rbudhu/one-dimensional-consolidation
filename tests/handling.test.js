import test from 'node:test';
import assert from 'node:assert/strict';
import * as scene from '../src/scene.js';
test('paring helper keeps full length on ring and stationary blade edge at shrinking side',()=>{
  assert.equal(typeof scene.paringPose,'function');
  const a=scene.paringPose(.2),b=scene.paringPose(.8);
  for(const p of [a,b]) {
    assert.equal(p.lengthM,.0762);
    assert.equal(p.soil[0],p.ring[0]);
    assert.ok(Math.abs(p.soil[1]-.0381-p.ring[1]-.0127)<1e-12);
    assert.equal(p.bladeYaw,0);
    assert.ok(Math.abs(p.blade[2]-.007-p.soil[2]-p.radiusM)<1e-12);
  }
  assert.ok(a.radiusM>b.radiusM);
  assert.equal(scene.paringPose(1).radiusM,.03175);
});
