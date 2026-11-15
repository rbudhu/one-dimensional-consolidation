import {test,expect} from '@playwright/test';
const errors=new WeakMap();
test.beforeEach(({page})=>{const list=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));page.on('console',m=>{if(m.type()==='error')list.push(m.text());});});
test.afterEach(({page})=>{expect(errors.get(page)).toEqual([]);});
async function boot(page){await page.goto('/?qa');await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native',{timeout:30000});}
async function idle(page){await page.waitForFunction(()=>!__lab.inspect().handling.busy);}
async function drop(page,id,target,offset={}){
  const p=await page.evaluate(({id,target,offset})=>({from:__lab.projectObject(id),to:__lab.projectTarget(target,{forDrag:false,...offset})}),{id,target,offset});
  await page.mouse.move(p.from.x,p.from.y);await page.mouse.down();
  await page.waitForFunction(()=>__lab.inspect().handling.phase==='carry');
  await page.mouse.move(p.to.x,p.to.y,{steps:20});await page.mouse.up();await idle(page);
}
// Approved cursor-intent design supersedes strict support-footprint acquisition.
test('release on visible balance body beyond pan edge accepts and seats before tare',async({page})=>{
  await boot(page);await drop(page,'ring','balance',{offsetZM:.08});
  expect(await page.evaluate(()=>__lab.inspect().task)).toBe('measure-diameter');
  expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare'))).toHaveLength(1);
  const after=await page.evaluate(()=>__lab.inspect());expect(after.worldBounds.glass.min[1]).toBeCloseTo(after.panSurfaceY,8);
});
test('visible destination zone accepts a 2.5 mm intent with real final centering',async({page})=>{
  await boot(page);
  const p=await page.evaluate(()=>({from:__lab.projectObject('ring'),to:__lab.projectTarget('balance',{forDrag:false,offsetXM:.0025})}));
  await page.mouse.move(p.from.x,p.from.y);await page.mouse.down();await page.waitForFunction(()=>__lab.inspect().handling.phase==='carry');
  const q=await page.evaluate(()=>__lab.inspect());
  expect(q.dropMarker.zone).toBeDefined();
  expect(q.dropMarker.zone.width).toBeGreaterThanOrEqual(44);
  expect(q.dropMarker.zone.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(p.to.x,p.to.y,{steps:20});await page.mouse.up();await idle(page);
  const state=await page.evaluate(()=>__lab.state());const placement=state.history.find(h=>h.actionId==='weigh-tare').placement;
  expect(Math.hypot(placement.center.x-placement.target.x,placement.center.z-placement.target.z)).toBeLessThanOrEqual(.002);
  expect(placement.intent.x-placement.target.x).toBeCloseTo(.0025,7);
  expect(placement.intent.z).toBeCloseTo(placement.target.z,7);
  const seated=await page.evaluate(()=>__lab.inspect());expect(seated.worldBounds.glass.min[1]).toBeCloseTo(seated.panSurfaceY,8);
});
test('explicit return preserves tare and enables advertised real caliper drag',async({page})=>{
  await boot(page);await drop(page,'ring','balance');
  await expect(page.locator('#return-assembly')).toBeVisible();
  await expect(page.locator('#drag-from')).toContainText('Drag disabled');
  const caliper=await page.evaluate(()=>__lab.projectObject('caliper'));
  await page.mouse.click(caliper.x,caliper.y);
  await expect(page.locator('#hover-label')).toContainText('Return assembly to bench');
  await page.locator('#return-assembly').click();
  await expect(page.locator('#return-assembly')).toBeDisabled();await idle(page);
  expect(await page.evaluate(()=>__lab.inspect().handling.parked)).toEqual([]);
  expect(await page.evaluate(()=>__lab.inspect().task)).toBe('measure-diameter');
  expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='measure-diameter'))).toHaveLength(0);
  expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare'))).toHaveLength(1);
  await expect(page.locator('#return-assembly')).toBeHidden();
  const p=await page.evaluate(()=>({from:__lab.projectObject('caliper'),to:__lab.projectTarget('ring')}));
  await page.mouse.move(p.from.x,p.from.y);await page.mouse.down();await page.mouse.move(p.to.x,p.to.y,{steps:20});await page.mouse.up();
  await expect(page.locator('#task-title')).toContainText('height');
});
test('inside small target corner outside physical disk accepts and centers real ring drop',async({page})=>{
  await boot(page);
  for(let i=0;i<22;i++){await page.locator('#perform-action').click();await idle(page);}
  expect(await page.evaluate(()=>__lab.inspect().task)).toBe('place-ring');
  await drop(page,'ring','assembly',{offsetXM:.025,offsetZM:.025});
  const q=await page.evaluate(()=>__lab.inspect());expect(q.task).toBe('top-filter');
  expect(q.worldBounds.ring.min[1]).toBeCloseTo(q.worldBounds['filter-bottom'].max[1],8);
  expect(q.objectPositions.ring[0]).toBeCloseTo(q.objectPositions['filter-bottom'][0],8);
  expect(q.objectPositions.ring[2]).toBeCloseTo(q.objectPositions['filter-bottom'][2],8);
  expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='place-ring'))).toHaveLength(1);
});
for(const cancel of ['P','pointercancel','restart'])test(`explicit return ${cancel} cancellation preserves correct measured state`,async({page})=>{
  await boot(page);await drop(page,'ring','balance');
  const parked=await page.evaluate(()=>__lab.inspect().objectPositions);
  await page.locator('#return-assembly').click();await page.waitForFunction(()=>__lab.inspect().handling.phase==='return-transfer');
  if(cancel==='P') {
    await page.keyboard.press('p');await expect(page.locator('#return-assembly')).toBeDisabled();
  } else if(cancel==='pointercancel') await page.locator('canvas').first().dispatchEvent('pointercancel');
  else {page.once('dialog',d=>d.accept());await page.locator('#restart').click();}
  await idle(page);
  const q=await page.evaluate(()=>__lab.inspect()),state=await page.evaluate(()=>__lab.state());
  expect(q.task).toBe(cancel==='restart'?'weigh-tare':'measure-diameter');
  expect(state.history.filter(h=>h.actionId==='measure-diameter')).toHaveLength(0);
  expect(state.history.filter(h=>h.actionId==='weigh-tare')).toHaveLength(cancel==='restart'?0:1);
  if(cancel!=='restart')for(const id of ['ring','glass','film'])expect(q.objectPositions[id]).toEqual(parked[id]);
  else expect(q.handling.parked).toEqual([]);
});
