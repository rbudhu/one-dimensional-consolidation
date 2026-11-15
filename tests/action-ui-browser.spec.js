import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {PREPARATION} from '../src/procedure.js';
const dir='reports/guided-two-load-evidence/action-ui';
const errors=new WeakMap();
test.beforeEach(({page})=>{const e=[];errors.set(page,e);page.on('pageerror',x=>e.push(x.message));page.on('console',x=>{if(x.type()==='error')e.push(x.text());});});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function boot(page){await page.goto('/?qa');await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native',{timeout:30000});await page.waitForFunction(()=>__lab.inspect().sourceGlow?.visible);}
async function idle(page){await page.waitForFunction(()=>!__lab.inspect().handling.busy);}
async function viewReady(page){await page.waitForFunction(()=>!__lab.inspect().actionCamera?.moving);}
test('automatic scale closeup freezes during real hold, seats before measurement and dwells before next view',async({page})=>{
 await boot(page);await viewReady(page);const initial=await page.evaluate(()=>__lab.inspect().actionCamera);expect(initial.station).toBe('balance');
 const p=await page.evaluate(()=>__lab.projectObject('ring'));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForFunction(()=>__lab.inspect().dragPayload.length>0);
 const held=await page.evaluate(()=>__lab.inspect().actionCamera.pose);await page.waitForTimeout(650);expect(await page.evaluate(()=>__lab.inspect().actionCamera.pose)).toEqual(held);
 const z=await page.evaluate(()=>__lab.inspect().dropMarker.zone);
 const outside={x:z.left>40 ? z.left-25 : z.right+25,y:(z.top+z.bottom)/2};await page.mouse.move(outside.x,outside.y,{steps:10});await page.waitForFunction(()=>__lab.inspect().dropMarker.style.color==='#ffb52e');
 const amber=await page.evaluate(()=>__lab.inspect().dropMarker);const opacities=[];for(let i=0;i<5;i++){await page.waitForTimeout(170);opacities.push(await page.evaluate(()=>__lab.inspect().dropMarker.style.opacity));}expect(Math.max(...opacities)-Math.min(...opacities)).toBeGreaterThan(.04);expect(await page.evaluate(()=>__lab.inspect().dropMarker.zone)).toEqual(amber.zone);await shot(page,'native-amber-fixed-zone');
 await page.mouse.move(z.left+3,z.bottom-3,{steps:20});await page.waitForFunction(()=>__lab.inspect().dropMarker.style.color==='#47ef88');const green=await page.evaluate(()=>__lab.inspect().dropMarker);await page.waitForTimeout(300);expect(await page.evaluate(()=>__lab.inspect().dropMarker.style.opacity)).toBe(green.style.opacity);expect(await page.evaluate(()=>__lab.inspect().actionCamera.pose)).toEqual(held);await shot(page,'native-green-valid-zone');await page.mouse.up();
 await page.waitForFunction(()=>!__lab.inspect().dropMarker.visible);await expect(page.locator('#hover-label')).not.toContainText('Release here');
 await page.waitForFunction(()=>__lab.state().measurements.ringGlassTareG===241);const result=await page.evaluate(()=>__lab.inspect());expect(result.worldBounds.glass.min[1]).toBeCloseTo(result.panSurfaceY,8);expect(result.actionCamera.phase).toBe('dwell');expect(result.actionCamera.station).toBe('balance');expect(result.balanceReadout).toBe('241.00 g');await shot(page,'scale-result-closeup');
 // Screenshot capture consumes wall time and can cross the result-dwell boundary.
 // The initial real dwell is asserted above; its exact duration is tested with
 // the coordinator clock in action-camera.test.js. Observe the next view here.
 await idle(page);await viewReady(page);expect(await page.evaluate(()=>__lab.inspect().actionCamera.station)).toBe('caliper');
 await page.locator('#return-assembly').click();await idle(page);await viewReady(page);const next=await page.evaluate(()=>__lab.projectObject('caliper'));expect(next.x).toBeGreaterThan(0);expect(next.x).toBeLessThan(1114);expect(next.y).toBeGreaterThan(76);expect(next.y).toBeLessThan(850);
});
test('P and restart cancel operation focus before a stale tare can commit',async({page})=>{
 for(const cancel of ['P','restart']){
  await boot(page);await viewReady(page);const before=await page.evaluate(()=>__lab.inspect().actionCamera.pose);await page.locator('#perform-action').click();await page.waitForFunction(()=>__lab.inspect().actionCamera.phase==='focusing');
  if(cancel==='P'){await page.keyboard.press('p');await page.keyboard.press('w');await page.keyboard.press('p');await viewReady(page);const p=await page.evaluate(()=>({source:__lab.projectObject('ring'),target:__lab.projectTarget('balance',{forDrag:false}),canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()}));for(const point of [p.source,p.target]){expect(point.x).toBeGreaterThan(p.canvas.left);expect(point.x).toBeLessThan(p.canvas.right);expect(point.y).toBeGreaterThan(p.canvas.top);expect(point.y).toBeLessThan(p.canvas.bottom);}}
  else{page.once('dialog',d=>d.accept());await page.locator('#restart').click();}
  await idle(page);await viewReady(page);expect(await page.evaluate(()=>__lab.state().measurements.ringGlassTareG)).toBeUndefined();expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare').length)).toBe(0);
 }
 // Idle P must preserve the learner-selected whole bench, not refocus an
 // already prepared unchanged task as if it were interrupted readiness.
 await page.locator('#closeup').click();await viewReady(page);const selected=await page.evaluate(()=>__lab.inspect().actionCamera.pose);await page.keyboard.press('p');await page.keyboard.press('w');await page.keyboard.press('p');await page.waitForTimeout(700);await viewReady(page);expect(await page.evaluate(()=>__lab.inspect().actionCamera.pose)).toEqual(selected);expect(await page.evaluate(()=>__lab.inspect().actionCamera.wholeBench)).toBe(true);
});
test('restart while in free roam restores a fresh reachable initial action view',async({page})=>{
 await boot(page);await viewReady(page);await page.keyboard.press('p');page.once('dialog',d=>d.accept());await page.locator('#restart').click();
 if(await page.evaluate(()=>__lab.inspect().roam))await page.keyboard.press('p');await viewReady(page);
 expect(await page.evaluate(()=>__lab.inspect().actionCamera.station)).toBe('balance');
 const p=await page.evaluate(()=>__lab.projectObject('ring'));expect(p).toBeTruthy();expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(1114);expect(p.y).toBeGreaterThan(76);expect(p.y).toBeLessThan(900);
});
test('every preparation operation has reachable source and contextual animation; loading stays steady across readings',async({page})=>{
 test.setTimeout(240000);await boot(page);
 for(let i=0;i<30;i++){
  await idle(page);await viewReady(page);const t=await page.evaluate(()=>__lab.inspect().task);
  if(await page.locator('#return-assembly').isVisible()){await page.locator('#return-assembly').click();await idle(page);await viewReady(page);}
  const source=await page.evaluate(()=>{const g=__lab.inspect().sourceGlow;return g.visible ? __lab.projectObject(g.objectId) : null;});
  if(source){expect(source.x,t).toBeGreaterThan(15);expect(source.x,t).toBeLessThan(1100);expect(source.y,t).toBeGreaterThan(170);expect(source.y,t).toBeLessThan(850);}
  const task=PREPARATION.find(task=>task.id===t);
  if(task.targetId){const target=await page.evaluate(id=>__lab.projectTarget(id,{forDrag:false}),task.targetId);expect(target,`${t} actual target`).toBeTruthy();expect(target.x,t).toBeGreaterThan(15);expect(target.x,t).toBeLessThan(1100);expect(target.y,t).toBeGreaterThan(170);expect(target.y,t).toBeLessThan(850);}
  await page.locator('#perform-action').click();await page.waitForFunction(t=>__lab.state().history.some(h=>h.actionId===t),t);
  if(t==='cut-segment'||t==='pare-horizontal'){await page.evaluate(()=>__lab.handlingFrame(.4));await shot(page,`${t}-closeup`);}
 }
 await idle(page);await viewReady(page);const initial=await page.evaluate(()=>__lab.inspect().actionCamera.pose);await page.locator('#record-reading').click();await page.waitForFunction(()=>__lab.state().readings.length===1);await page.locator('#record-reading').click();await page.waitForFunction(()=>__lab.state().readings.length===2);expect(await page.evaluate(()=>__lab.inspect().actionCamera.pose)).toEqual(initial);await expect(page.locator('#live-measurements')).toContainText('0.50 tsf');await shot(page,'loading-live-measurements');
});
async function shot(page,name){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/${name}.png`});}
test('pickup glow is native annotation and real ring pickup preserves physical bounds',async({page})=>{
 await boot(page);const before=await page.evaluate(()=>__lab.inspect());expect(before.sourceGlow.objectId).toBe('ring');expect(before.sourceGlow.physical).toBe(false);await shot(page,'pickup-glow');
 const p=await page.evaluate(()=>__lab.projectObject('ring'));expect(p).toBeTruthy();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForFunction(()=>__lab.inspect().dragPayload.length===3);await page.waitForFunction(()=>!__lab.inspect().sourceGlow.visible);
 await page.locator('canvas').first().dispatchEvent('pointercancel');await page.mouse.up();await idle(page);const after=await page.evaluate(()=>__lab.inspect());expect(after.worldBounds.ring).toEqual(before.worldBounds.ring);
 await page.locator('#perform-action').click();await idle(page);await page.waitForFunction(()=>!__lab.inspect().sourceGlow.visible);
 await page.keyboard.press('p');await page.waitForFunction(()=>!__lab.inspect().sourceGlow.visible);
});
test('reduced motion snaps action framing while preserving real seating and result dwell',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await boot(page);expect(await page.evaluate(()=>__lab.inspect().actionCamera.moving)).toBe(false);
 await page.locator('#perform-action').click();await page.waitForFunction(()=>__lab.inspect().handling.phase.startsWith('seat-'));
 expect(await page.evaluate(()=>__lab.inspect().actionCamera.moving)).toBe(false);expect(await page.evaluate(()=>__lab.state().measurements.ringGlassTareG)).toBeUndefined();
 await page.waitForFunction(()=>__lab.state().measurements.ringGlassTareG===241);expect(await page.evaluate(()=>__lab.inspect().actionCamera.phase)).toBe('dwell');await shot(page,'reduced-motion-scale');
});
test('sidebar starts blank and retains typed tare; caliper displays completed height',async({page})=>{
 await boot(page);await expect(page.locator('#latest-measurement')).toHaveText('No completed measurement');await expect(page.locator('[data-measurement="ringGlassTareG"] .measurement-value')).toHaveText('—');
 await page.locator('#perform-action').click();await idle(page);await expect(page.locator('#latest-measurement')).toContainText('241.00 g');expect(await page.evaluate(()=>__lab.inspect().balanceReadout)).toBe('241.00 g');
 await page.locator('#perform-action').click();await idle(page);await page.locator('#perform-action').click();await idle(page);await expect(page.locator('[data-measurement="ringGlassTareG"]')).toContainText('241.00');expect(await page.evaluate(()=>__lab.inspect().caliperReadout)).toBe('25.40 mm');
 await shot(page,'sidebar-measurements');await page.setViewportSize({width:1024,height:640});
 const layout=await page.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,sidebar:document.querySelector('.sidebar').getBoundingClientRect().toJSON(),overflow:getComputedStyle(document.querySelector('.sidebar')).overflowY}));expect(layout.scroll).toBeLessThanOrEqual(layout.height);expect(layout.sidebar.bottom).toBeLessThanOrEqual(layout.height);expect(layout.overflow).toBe('auto');await shot(page,'sidebar-short-desktop');
});
