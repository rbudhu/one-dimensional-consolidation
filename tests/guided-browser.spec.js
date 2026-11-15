import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const dir=process.env.LAB_GUIDED_EVIDENCE_DIR || 'reports/guided-handling-evidence';
async function boot(page) {
  await page.addInitScript(()=>{
    window.__contextKinds=[];
    const native=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...args){window.__contextKinds.push(kind);return native.call(this,kind,...args);};
  });
  await page.goto('/?qa'); await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native',{timeout:30000});
  await page.waitForFunction(()=>window.__contextKinds.includes('webgpu'),{},{timeout:30000});
}
async function idle(page) { await page.waitForFunction(()=>!window.__lab.inspect().handling?.busy); }
test('front-left scale pan and display are unobscured at both desktop sizes',async({page})=>{
  for(const viewport of [{width:1440,height:900},{width:1024,height:640}]) {
    await page.setViewportSize(viewport); await boot(page);
    const q=await page.evaluate(()=>window.__lab.inspect());
    expect(q.scaleLayout?.position[2]).toBeCloseTo(.16,3);
    expect(q.scaleLayout.panTubeOccluded).toBe(false);
    expect(q.scaleLayout.displayTubeOccluded).toBe(false);
    expect(q.scaleLayout.footprintOverlaps).toEqual([]);
    fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(`${dir}/layout-${viewport.width}.json`,JSON.stringify(q.scaleLayout,null,2));
    await page.screenshot({path:`${dir}/layout-${viewport.width}.png`});
  }
});
test('guided 2.5 mm release aligns final stack within 2 mm and uses real support contacts',async({page})=>{
  await boot(page);
  for(let i=0;i<22;i++) {
    const task=await page.evaluate(()=>window.__lab.inspect().task);
    await page.locator('#perform-action').click(); await idle(page);
    expect(await page.evaluate(()=>({task:window.__lab.inspect().task,hover:document.querySelector('#hover-label').textContent}))).not.toMatchObject({task});
  }
  const p=await page.evaluate(()=>({object:window.__lab.projectObject('ring'),target:window.__lab.projectTarget('assembly',{forDrag:false,offsetXM:.0025})}));
  await page.mouse.move(p.object.x,p.object.y); await page.mouse.down();
  await page.mouse.move(p.target.x,p.target.y,{steps:20});
  await page.waitForFunction(()=>window.__lab.inspect().handling?.phase==='carry');
  await page.mouse.up(); await idle(page);
  await expect(page.locator('#task-title')).toHaveText('Place top filter paper');
  const q=await page.evaluate(()=>window.__lab.inspect());
  expect(q.worldBounds.ring.min[1]).toBeCloseTo(q.worldBounds['filter-bottom'].max[1],7);
  expect(q.objectPositions.ring[0]).toBeCloseTo(q.objectPositions['filter-bottom'][0],8);
  const state=await page.evaluate(()=>window.__lab.state());
  const placement=state.history.find(h=>h.actionId==='place-ring').placement;
  expect(Math.hypot(placement.center.x-placement.target.x,placement.center.z-placement.target.z)).toBeLessThanOrEqual(.002);
});
test('real pointer ring payload lifts before translation, seats from release and remains parked',async({page})=>{
  await boot(page);
  const start=await page.evaluate(()=>window.__lab.inspect());
  const contexts=await page.evaluate(()=>window.__contextKinds);
  expect(contexts).toContain('webgpu');expect(contexts.some(k=>/webgl/.test(k))).toBe(false);
  await page.evaluate(()=>{
    window.__carryTrace=[];window.__traceRunning=true;
    const sample=()=>{if(!window.__traceRunning)return;const q=__lab.inspect();__carryTrace.push({phase:q.handling.phase,glass:q.worldBounds.glass,ring:q.worldBounds.ring,film:q.worldBounds.film,scale:q.scaleLayout.bounds});requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  const p=await page.evaluate(()=>({object:window.__lab.projectObject('ring'),target:window.__lab.projectTarget('balance',{forDrag:false})}));
  await page.mouse.move(p.object.x,p.object.y); await page.mouse.down();
  await page.mouse.move(p.target.x,p.target.y,{steps:25});
  await page.waitForFunction(()=>window.__lab.inspect().handling?.phase==='carry');
  const carried=await page.evaluate(()=>window.__lab.inspect());
  fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/ring-carried.png`});
  expect(carried.worldBounds.glass.min[1]).toBeGreaterThan(carried.panSurfaceY+.008);
  for(const id of ['glass','film']) for(const axis of [0,1,2])
    expect(carried.objectPositions[id][axis]-start.objectPositions[id][axis]).toBeCloseTo(carried.objectPositions.ring[axis]-start.objectPositions.ring[axis],8);
  await page.mouse.up();
  expect((await page.evaluate(()=>window.__lab.state())).history.filter(h=>h.actionId==='weigh-tare')).toHaveLength(0);
  const release=await page.evaluate(()=>window.__lab.inspect());
  expect(release.handling.releasePose).toEqual(carried.objectPositions.ring);
  await page.waitForFunction(()=>__lab.inspect().handling.phase==='seat-lower');
  await page.screenshot({path:`${dir}/ring-lowering.png`});
  await idle(page); await expect(page.locator('#task-title')).toContainText('diameter');
  const seated=await page.evaluate(()=>window.__lab.inspect());
  expect(seated.worldBounds.glass.min[1]).toBeCloseTo(seated.panSurfaceY,8);
  expect(seated.handling.parked).toEqual(['ring','glass','film']);
  expect((await page.evaluate(()=>window.__lab.state())).history.filter(h=>h.actionId==='weigh-tare')).toHaveLength(1);
  await page.waitForTimeout(750);
  expect((await page.evaluate(()=>window.__lab.inspect())).objectPositions.ring).toEqual(seated.objectPositions.ring);
  const trace=await page.evaluate(()=>{window.__traceRunning=false;return window.__carryTrace;});
  expect(trace.length).toBeGreaterThan(8);
  for(const frame of trace) for(const id of ['ring','glass','film']) {
    const a=frame[id],b=frame.scale;
    expect([0,1,2].every(i=>a.min[i]<b.max[i]-1e-7&&a.max[i]>b.min[i]+1e-7),JSON.stringify(frame)).toBe(false);
  }
  fs.writeFileSync(`${dir}/ring-pointer.json`,JSON.stringify({start,carried,release,seated,contexts,trace},null,2));
  await page.screenshot({path:`${dir}/ring-seated.png`});
  await page.locator('#perform-action').click();
  const returning=await page.evaluate(()=>window.__lab.inspect()); expect(returning.handling.phase).toBe('return-lift');
  await idle(page); expect((await page.evaluate(()=>window.__lab.inspect())).handling.parked).toEqual([]);
});
for(const phase of ['seat-lift','seat-transfer','seat-lower']) for(const cancel of ['P','restart'])
  test(`${cancel} cancels ${phase} without an unsettled or stale tare`,async({page})=>{
    await boot(page);await page.locator('#perform-action').click();
    await page.waitForFunction(p=>__lab.inspect().handling.phase===p,phase);
    await expect(page.locator('#perform-action')).toBeDisabled();
    await page.locator('#perform-action').evaluate(el=>el.click());
    if(cancel==='P') await page.keyboard.press('p');
    else {page.once('dialog',d=>d.accept());await page.locator('#restart').click();}
    await page.waitForTimeout(1100);
    const state=await page.evaluate(()=>__lab.state()),q=await page.evaluate(()=>__lab.inspect());
    expect(state.history.filter(h=>h.actionId==='weigh-tare')).toHaveLength(0);
    expect(q.handling.busy).toBe(false);expect(q.task).toBe('weigh-tare');
    expect(q.objectPositions.ring[0]).toBeCloseTo(-.22,8);
    if(cancel==='P') await page.keyboard.press('p');
    await page.locator('#perform-action').click();await idle(page);
    expect((await page.evaluate(()=>__lab.state())).history.filter(h=>h.actionId==='weigh-tare')).toHaveLength(1);
  });
test('blocked real pointer movement stops the real payload and rejects wrong support',async({page})=>{
  await boot(page);
  const p=await page.evaluate(()=>({object:__lab.projectObject('ring'),target:__lab.projectTarget('oven')}));
  await page.mouse.move(p.object.x,p.object.y);await page.mouse.down();await page.waitForFunction(()=>__lab.inspect().handling.phase==='carry');
  await page.mouse.move(p.target.x,p.target.y,{steps:25});
  const blocked=await page.evaluate(()=>__lab.inspect());expect(blocked.handling.blocked).toBe(true);
  await expect(page.locator('#hover-label')).toContainText('Blocked');
  await page.mouse.up();expect((await page.evaluate(()=>__lab.inspect())).task).toBe('weigh-tare');
});
for(const phase of ['return-lift','return-transfer','return-lower'])
  test(`P cancels ${phase} leaving measured assembly on pan and next action uncommitted`,async({page})=>{
    await boot(page);await page.locator('#perform-action').click();await idle(page);
    const parked=await page.evaluate(()=>__lab.inspect().objectPositions);
    await page.locator('#perform-action').click();await page.waitForFunction(p=>__lab.inspect().handling.phase===p,phase);
    await page.keyboard.press('p');await page.waitForTimeout(1100);
    const q=await page.evaluate(()=>__lab.inspect()),state=await page.evaluate(()=>__lab.state());
    expect(q.task).toBe('measure-diameter');expect(q.handling.busy).toBe(false);
    for(const id of ['ring','glass','film']) expect(q.objectPositions[id]).toEqual(parked[id]);
    expect(state.history.filter(h=>h.actionId==='measure-diameter')).toHaveLength(0);
  });
test('stack and cap descend under retracted ram without frame contact; mounted adjuster never detaches',async({page})=>{
  await boot(page);
  for(let i=0;i<25;i++){await page.locator('#perform-action').click();await idle(page);}
  const before=await page.evaluate(()=>__lab.inspect());expect(before.ramBottomY).toBeGreaterThan(.2);
  await page.locator('#perform-action').click();
  const samples=await page.evaluate(async()=>{
    const frames=[];
    do {await new Promise(requestAnimationFrame); const q=__lab.inspect();frames.push(q);} while(__lab.inspect().handling.busy);
    return frames;
  });
  for(const q of samples) for(const id of ['ring','specimen','stone-bottom','filter-bottom','filter-top','stone-top']) {
    const a=q.worldBounds[id];
    for(const b of q.solidBounds.filter(b=>b.owner==='frame'))
      expect([0,1,2].every(i=>a.min[i]<b.max[i]-1e-7&&a.max[i]>b.min[i]+1e-7),`${id} at ${q.handling.phase}`).toBe(false);
  }
  await page.locator('#perform-action').click();
  await page.locator('#perform-action').click();await idle(page);
  const seated=await page.evaluate(()=>__lab.inspect());
  expect(seated.worldBounds.cap.min[1]).toBeCloseTo(seated.worldBounds['stone-top'].max[1],7);
  const p=await page.evaluate(()=>({object:__lab.projectObject('adjuster'),target:__lab.projectTarget('cap',{forDrag:false})}));
  await page.mouse.move(p.object.x,p.object.y);await page.mouse.down();await page.mouse.move(p.target.x,p.target.y,{steps:20});
  expect((await page.evaluate(()=>__lab.inspect())).mountedControls).toEqual(seated.mountedControls);
  await page.mouse.up();
  await expect(page.locator('#task-title')).toHaveText('Zero dial and apply first increment');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/frame-clearance.json`,JSON.stringify({before,samples,seated},null,2));
});

