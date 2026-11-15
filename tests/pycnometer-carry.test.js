import test from 'node:test';
import assert from 'node:assert/strict';
import {planCarry,sweptClear,translated,CLEARANCE_M} from '../src/carry.js';

test('already-clear carried bottle does not accumulate a second lift before safe pan seating',()=>{
  // Native green-cursor repro, rounded to metres: 70.5 mm bottle already
  // carried with bottom at 128 mm; another 12 mm lift exceeds the 205 mm roof.
  const bounds={min:[-.517,.128,.159],max:[-.469,.1985,.207]};
  const start=[-.493,.150,.183],destination=[-.5,.06,.151],support=.062;
  const obstacles=[{min:[-.6,.0115,.0875],max:[-.4,.0585,.2325]},
    {min:[-.5875,.058,.0995],max:[-.4125,.062,.2025]}];
  const route=planCarry(bounds,start,destination,support,obstacles,{ceilingY:.205});
  assert.equal(route.ok,true,'clear bottle must not be lifted past the ceiling again');
  const relative=translated(bounds,start.map(v=>-v));
  for(let i=1;i<route.points.length;i++)assert.equal(sweptClear(relative,route.points[i-1],route.points[i],obstacles),true);
  assert.ok(route.points.slice(1,-1).every(p=>p[1]+relative.max[1]<=.205));
  assert.ok(route.points.slice(1,-1).every(p=>p[1]+relative.min[1]>=support+CLEARANCE_M));
  assert.ok(Math.abs(route.points.at(-1)[1]+relative.min[1]-support)<1e-12);
  // A real overhead obstruction still rejects; neither ceiling nor collision
  // policy may be bypassed to make accepted cursor intent succeed.
  const roof={min:[-.7,.195,.05],max:[-.3,.25,.3]};
  assert.equal(planCarry(bounds,start,destination,support,[...obstacles,roof],{ceilingY:.205}).ok,false);
});
