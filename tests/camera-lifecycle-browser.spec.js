import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const dir='reports/two-load-lifecycle-evidence';
const errors=new WeakMap();
test.beforeEach(({page})=>{const e=[];errors.set(page,e);page.on('pageerror',x=>e.push(x.message));page.on('console',x=>{if(x.type()==='error')e.push(x.text());});});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));
async function boot(page){await page.goto('/?qa');await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native',{timeout:30000});await ready(page);}
async function ready(page){await page.waitForFunction(()=>!__lab.inspect().handling.busy && !__lab.inspect().actionCamera.moving);}
async function reachable(page,object,target){const data=await page.evaluate(({object,target})=>({source:__lab.projectObject(object),target:__lab.projectTarget(target,{forDrag:false}),canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()}),{object,target});for(const p of [data.source,data.target]){expect(p).toBeTruthy();expect(p.x).toBeGreaterThan(data.canvas.left);expect(p.x).toBeLessThan(data.canvas.right);expect(p.y).toBeGreaterThan(data.canvas.top);expect(p.y).toBeLessThan(data.canvas.bottom);}return data;}
async function evidence(page,name,extra={}){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify({inspect:await page.evaluate(()=>__lab.inspect()),state:await page.evaluate(()=>__lab.state()),errors:errors.get(page),...extra},null,2));await page.screenshot({path:`${dir}/${name}.png`});}
test('I1 P during nonparked extrusion dwell prepares reachable current aliquot source and target',async({page})=>{
 await boot(page);
 for(const id of ['weigh-tare','measure-diameter','measure-height','extrude']){await ready(page);await page.locator('#perform-action').click();await page.waitForFunction(id=>__lab.state().history.some(h=>h.actionId===id),id);}
 const before=await page.evaluate(()=>__lab.inspect());expect(before.task).toBe('aliquot-tare');expect(before.actionCamera.phase).toBe('dwell');expect(before.handling.parked).toEqual([]);
 await page.keyboard.press('p');await page.keyboard.press('w');await page.keyboard.press('p');await page.waitForTimeout(2600);await ready(page);
 expect(await page.evaluate(()=>__lab.inspect().task)).toBe('aliquot-tare');const projection=await reachable(page,'can-initial','balance');await evidence(page,'I1-current-task-restored',{before,projection});
});
test('I2 trusted native pointercancel during seating rolls back payload and permits ordinary tare retry',async({page})=>{
 await boot(page);const before=await page.evaluate(()=>({bounds:__lab.inspect().worldBounds,state:__lab.state()}));
 await page.evaluate(()=>{window.nativeCancels=[];document.querySelector('canvas').addEventListener('pointercancel',e=>nativeCancels.push({trusted:e.isTrusted,type:e.pointerType,id:e.pointerId}));});
 await page.locator('#perform-action').click();await page.waitForFunction(()=>__lab.inspect().handling.phase.startsWith('seat-'));
 const session=await page.context().newCDPSession(page);const box=await page.locator('canvas').boundingBox();await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:7}]});await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.waitForFunction(()=>nativeCancels.length>0);const native=await page.evaluate(()=>nativeCancels);expect(native.some(e=>e.trusted&&e.type==='touch')).toBe(true);
 await page.waitForTimeout(2600);const cancelled=await page.evaluate(()=>({inspect:__lab.inspect(),state:__lab.state()}));await evidence(page,'I2-cancelled-seat',{native,before,cancelled});
 expect(cancelled.inspect.handling.busy).toBe(false);expect(cancelled.inspect.handling.route).toBeNull();expect(cancelled.inspect.handling.parked).toEqual([]);expect(cancelled.state.measurements.ringGlassTareG).toBeUndefined();expect(cancelled.state.history).toEqual(before.state.history);
 for(const id of ['ring','glass','film'])expect(cancelled.inspect.worldBounds[id]).toEqual(before.bounds[id]);
 await expect(page.locator('#perform-action')).toBeEnabled();await page.locator('#perform-action').click();await page.waitForFunction(()=>__lab.state().measurements.ringGlassTareG===241);expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare').length)).toBe(1);const result=await page.evaluate(()=>__lab.inspect());expect(result.worldBounds.glass.min[1]).toBeCloseTo(result.panSurfaceY,8);await evidence(page,'I2-retry-seated',{native});
});
test('I3 native held mouse plus Tab Enter cannot start action; accepted release remains usable',async({page})=>{
 await boot(page);const p=await page.evaluate(()=>__lab.projectObject('ring'));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForFunction(()=>__lab.inspect().dragPayload.length===3);
 const held=await page.evaluate(()=>({pose:__lab.inspect().actionCamera.pose,history:__lab.state().history}));
 let focused=false;for(let i=0;i<30;i++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.id==='perform-action')){focused=true;break;}}
 if(!focused){for(let i=0;i<20;i++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.id==='closeup'))break;}expect(await page.evaluate(()=>document.activeElement?.id)).toBe('closeup');}
 // Disabled actions are skipped by native Tab; still deliver native Enter to
 // the guarded view control while held, then check the action handler below.
 await page.keyboard.press('Enter');await page.waitForTimeout(300);
 const after=await page.evaluate(()=>({inspect:__lab.inspect(),state:__lab.state()}));await evidence(page,'I3-held-keyboard',{held,focused,after});expect(after.inspect.actionCamera.pose).toEqual(held.pose);expect(after.inspect.actionCamera.moving).toBe(false);expect(after.inspect.dragPayload).toEqual(['ring','glass','film']);expect(after.state.history).toEqual(held.history);expect(after.state.measurements.ringGlassTareG).toBeUndefined();await expect(page.locator('#perform-action')).toBeDisabled();
 // Exercise the actual handler as a second boundary check, independent of disabled markup.
 await page.evaluate(()=>document.querySelector('#perform-action').onclick());await page.waitForTimeout(300);const boundary=await page.evaluate(()=>({pose:__lab.inspect().actionCamera.pose,moving:__lab.inspect().actionCamera.moving,history:__lab.state().history}));expect(boundary.pose).toEqual(held.pose);expect(boundary.moving).toBe(false);expect(boundary.history).toEqual(held.history);
 const z=await page.evaluate(()=>__lab.inspect().dropMarker.zone);await page.mouse.move((z.left+z.right)/2,(z.top+z.bottom)/2,{steps:20});await page.waitForFunction(()=>__lab.inspect().dropMarker.style.color==='#47ef88');await page.mouse.up();await page.waitForFunction(()=>__lab.state().measurements.ringGlassTareG===241);expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='weigh-tare').length)).toBe(1);await evidence(page,'I3-valid-drop');
});
