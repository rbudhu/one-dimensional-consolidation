import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const dir=process.env.LAB_DROP_EVIDENCE_DIR || 'reports/drop-feedback-evidence';
const errors=new WeakMap();
test.beforeEach(({page})=>{const list=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));page.on('console',m=>{if(m.type()==='error')list.push(m.text());});});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function boot(page){await page.goto('/?qa');await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native',{timeout:30000});}
async function idle(page){await page.waitForFunction(()=>!__lab.inspect().handling.busy);}
async function pickup(page,id='ring'){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const p=await page.evaluate(id=>__lab.projectObject(id),id);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForFunction(()=>__lab.inspect().dragPayload.length>0);if(id==='ring')await page.waitForFunction(()=>__lab.inspect().handling.phase==='carry');}
async function frontFace(page){return page.evaluate(()=>{
  const q=__lab.inspect(),c=__lab.projectTarget('balance',{forDrag:false}),pan=q.solidBounds.find(b=>b.owner==='balance'&&Math.abs(b.max[1]-q.panSurfaceY)<1e-8);
  for(let y=c.y+8;y<c.y+100;y+=3)for(let x=c.x-60;x<c.x+60;x+=3){
    const d=__lab.debugPick(x,y),body=q.solidBounds.find(b=>b.owner==='balance'&&b.max[1]<q.panSurfaceY-.002&&b.max[0]-b.min[0]>.19);
    const frontT=(body.max[2]-d.ray.origin[2])/d.ray.direction[2],front=d.ray.origin.map((v,i)=>v+frontT*d.ray.direction[i]);
    if(front[0]<body.min[0]||front[0]>body.max[0]||front[1]<body.min[1]||front[1]>body.max[1])continue;
    const t=(q.panSurfaceY-d.ray.origin[1])/d.ray.direction[1],p=d.ray.origin.map((v,i)=>v+t*d.ray.direction[i]);
    if(p[2]>pan.max[2]+.005||p[2]<pan.min[2]-.005||p[0]>pan.max[0]+.005||p[0]<pan.min[0]-.005)return {x,y,hit:front,plane:p,pan};
  }throw Error('No visible balance front-face point outside projected pan');
});}
test('visible balance front face outside pan accepts cursor intent and seats before tare',async({page})=>{
  await boot(page);const face=await frontFace(page);await pickup(page);await page.mouse.move(face.x,face.y,{steps:20});await page.mouse.up();await idle(page);
  expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare'))).toHaveLength(1);
  const q=await page.evaluate(()=>__lab.inspect());expect(q.worldBounds.glass.min[1]).toBeCloseTo(q.panSurfaceY,8);expect(q.handling.parked).toEqual(['ring','glass','film']);
});
test('native cue breathes amber with fixed client boundary then steady green and hides on release',async({page})=>{
  await boot(page);await pickup(page);await page.mouse.move(650,700);await page.waitForTimeout(80);
  const a=await page.evaluate(()=>__lab.inspect().dropMarker),samples=[a.style?.opacity];for(let i=0;i<5;i++){await page.waitForTimeout(240);samples.push(await page.evaluate(()=>__lab.inspect().dropMarker.style?.opacity));}const b=await page.evaluate(()=>__lab.inspect().dropMarker);
  expect(a.style?.color).toBe('#ffb52e');expect(Math.max(...samples)-Math.min(...samples)).toBeGreaterThan(.04);expect(a.zone).toEqual(b.zone);
  fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/amber.png`});
  const face=await frontFace(page);await page.mouse.move(face.x,face.y,{steps:15});await expect(page.locator('#hover-label')).toContainText('Release here');
  const g=await page.evaluate(()=>__lab.inspect().dropMarker);await page.waitForTimeout(650);const g2=await page.evaluate(()=>__lab.inspect().dropMarker);
  expect(g.style.color).toBe('#47ef88');expect(g.style.opacity).toBe(g2.style.opacity);expect(g.zone).toEqual(g2.zone);
  await page.screenshot({path:`${dir}/green.png`});fs.writeFileSync(`${dir}/cue.json`,JSON.stringify({amber:a,amberLater:b,green:g,greenLater:g2,face},null,2));await page.mouse.up();expect(await page.evaluate(()=>__lab.inspect().dropMarker.visible)).toBe(false);await expect(page.locator('#hover-label')).not.toContainText('Release here');await idle(page);
});
test('parent baseline near balance body intent accepts and seats',async({page})=>{
  await boot(page);const p=await page.evaluate(()=>__lab.projectTarget('balance',{forDrag:false,offsetZM:.08}));await pickup(page);await page.mouse.move(p.x,p.y,{steps:20});await expect(page.locator('#hover-label')).toContainText('Release here');await page.mouse.up();await idle(page);
  const q=await page.evaluate(()=>__lab.inspect());expect(q.worldBounds.glass.min[1]).toBeCloseTo(q.panSurfaceY,8);expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare'))).toHaveLength(1);
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/front-face.json`,JSON.stringify({cursor:p,seated:q},null,2));await page.screenshot({path:`${dir}/front-seated.png`});
});
test('just outside displayed boundary and wrong apparatus reject without records',async({page})=>{
  await boot(page);const before=await page.evaluate(()=>__lab.inspect().objectPositions);
  for(const wrong of [false,true]){
    await pickup(page);const p=await page.evaluate(wrong=>{const z=__lab.inspect().dropMarker.zone;return wrong ? __lab.projectTarget('oven',{forDrag:false}) : {x:z.left-1,y:(z.top+z.bottom)/2};},wrong);
    await page.mouse.move(p.x,p.y,{steps:20});await page.mouse.up();await expect(page.locator('#hover-label')).toHaveText('Drop inside the highlighted destination zone; placement restored.');await idle(page);expect(await page.evaluate(()=>__lab.inspect().task)).toBe('weigh-tare');
    for(const id of ['ring','glass','film'])expect(await page.evaluate(id=>__lab.inspect().objectPositions[id],id)).toEqual(before[id]);
  }
  expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare'))).toHaveLength(0);
});
test('small layer rectangular corner halo accepts and physically centers on support',async({page})=>{
  await boot(page);for(let i=0;i<22;i++){await page.locator('#perform-action').click();await idle(page);}expect(await page.evaluate(()=>__lab.inspect().task)).toBe('place-ring');
  await pickup(page);const z=await page.evaluate(()=>__lab.inspect().dropMarker.zone);expect(z.width).toBeGreaterThanOrEqual(44);expect(z.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(z.left+2,z.top+2,{steps:20});await expect(page.locator('#hover-label')).toContainText('Release here');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/small-green.png`});await page.mouse.up();await idle(page);
  const q=await page.evaluate(()=>__lab.inspect());expect(q.task).toBe('top-filter');expect(q.worldBounds.ring.min[1]).toBeCloseTo(q.worldBounds['filter-bottom'].max[1],8);expect(q.objectPositions.ring[0]).toBeCloseTo(q.objectPositions['filter-bottom'][0],8);expect(q.objectPositions.ring[2]).toBeCloseTo(q.objectPositions['filter-bottom'][2],8);
  const h=await page.evaluate(()=>__lab.state().history.find(h=>h.actionId==='place-ring'));expect(Math.hypot(h.placement.center.x-h.placement.target.x,h.placement.center.z-h.placement.target.z)).toBeLessThanOrEqual(.002);
  fs.writeFileSync(`${dir}/small-target.json`,JSON.stringify({zone:z,seated:q,placement:h.placement},null,2));
});
for(const cancel of ['P','pointercancel','restart'])test(`drag ${cancel} hides cue and restores payload without tare`,async({page})=>{
  await boot(page);const before=await page.evaluate(()=>__lab.inspect().objectPositions);await pickup(page);const z=await page.evaluate(()=>__lab.inspect().dropMarker.zone);await page.mouse.move((z.left+z.right)/2,(z.top+z.bottom)/2,{steps:15});await expect(page.locator('#hover-label')).toContainText('Release here');
  if(cancel==='P')await page.keyboard.press('p');else if(cancel==='pointercancel')await page.locator('canvas').first().dispatchEvent('pointercancel');else {page.once('dialog',d=>d.accept());await page.locator('#restart').click();}
  await page.mouse.up();await idle(page);await expect(page.locator('#hover-label')).not.toContainText('Release here');expect(await page.evaluate(()=>__lab.inspect().dropMarker.visible)).toBe(false);expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare'))).toHaveLength(0);
  for(const id of ['ring','glass','film'])expect(await page.evaluate(id=>__lab.inspect().objectPositions[id],id)).toEqual(before[id]);
});
test('initial and live reduced motion amber stays steady across resize',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await boot(page);await pickup(page);await page.mouse.move(650,700);await page.waitForTimeout(80);
  const a=await page.evaluate(()=>__lab.inspect().dropMarker);await page.waitForTimeout(650);const b=await page.evaluate(()=>__lab.inspect().dropMarker);expect(a.style.opacity).toBe(b.style.opacity);
  await page.setViewportSize({width:1024,height:640});await page.waitForFunction(left=>__lab.inspect().dropMarker.zone?.left!==left,a.zone.left);const resized=await page.evaluate(()=>__lab.inspect().dropMarker);expect(resized.zone).not.toEqual(a.zone);
  await page.mouse.move(resized.zone.left+1,resized.zone.bottom-1);await expect(page.locator('#hover-label')).toContainText('Release here');await page.mouse.move(700,580);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(80);const c=await page.evaluate(()=>__lab.inspect().dropMarker.style.opacity);await page.waitForTimeout(650);expect(await page.evaluate(()=>__lab.inspect().dropMarker.style.opacity)).not.toBe(c);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);const d=await page.evaluate(()=>__lab.inspect().dropMarker.style.opacity);await page.waitForTimeout(650);expect(await page.evaluate(()=>__lab.inspect().dropMarker.style.opacity)).toBe(d);await page.locator('canvas').first().dispatchEvent('pointercancel');await page.mouse.up();
});
test('tool corner intent uses ideal action without fabricated settled pose',async({page})=>{
  await boot(page);await page.locator('#perform-action').click();await idle(page);await page.locator('#return-assembly').click();await idle(page);await pickup(page,'caliper');
  const z=await page.evaluate(()=>__lab.inspect().dropMarker.zone);await page.mouse.move(z.left+1,z.top+1,{steps:20});await expect(page.locator('#hover-label')).toContainText('Release here');await page.mouse.up();
  await expect(page.locator('#task-title')).toContainText('height');const h=await page.evaluate(()=>__lab.state().history.find(h=>h.actionId==='measure-diameter'));expect(h.placement).toBeUndefined();
  const intent=await page.evaluate(()=>__lab.inspect().dropIntent);expect(intent.accepted).toBe(true);expect(intent.intentOnly).toBe(true);expect(intent.releasedPose).toHaveLength(3);expect(intent.center).toBeUndefined();
});
test('camera close-up hides fully offscreen small target and rejects its old cursor zone',async({page})=>{
  await boot(page);for(let i=0;i<22;i++){await page.locator('#perform-action').click();await idle(page);}await pickup(page);
  const z=await page.evaluate(()=>__lab.inspect().dropMarker.zone);await page.mouse.move(z.left+1,z.top+1,{steps:15});await expect(page.locator('#hover-label')).toContainText('Release here');await page.locator('#closeup').evaluate(el=>el.click());await page.waitForFunction(()=>__lab.inspect().closeup&&__lab.inspect().dropMarker.zone===null);
  await expect(page.locator('#hover-label')).not.toContainText('Release here');expect(await page.evaluate(()=>__lab.inspect().dropMarker.visible)).toBe(false);await page.mouse.move((z.left+z.right)/2,(z.top+z.bottom)/2,{steps:15});await page.mouse.up();await idle(page);expect(await page.evaluate(()=>__lab.inspect().task)).toBe('place-ring');expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='place-ring'))).toHaveLength(0);
});

