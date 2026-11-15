import {test,expect} from '@playwright/test';
import {PREPARATION} from '../src/procedure.js';
import fs from 'node:fs';
test('compressed aliquot drying visits real oven then safe balance before typed mass appears',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?qa');await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native',{timeout:30000});
 for(const task of PREPARATION.slice(0,6)){
  await page.waitForFunction(()=>!__lab.inspect().handling.busy && !__lab.inspect().actionCamera.moving);
  await page.locator('#perform-action').click();await page.waitForFunction(id=>__lab.state().history.some(h=>h.actionId===id),task.id);
  if(task.id==='measure-height'){fs.mkdirSync('reports/guided-two-load-evidence',{recursive:true});await page.screenshot({path:'reports/guided-two-load-evidence/caliper-height-result.png'});}
 }
 await page.waitForFunction(()=>!__lab.inspect().handling.busy && !__lab.inspect().actionCamera.moving);
 await page.locator('#perform-action').click();
 await page.waitForFunction(()=>__lab.state().measurements.aliquotDryCanG!==undefined);
 const result=await page.evaluate(()=>__lab.inspect());
 expect(result.actionCamera.station).toBe('balance');expect(result.worldBounds['can-initial'].min[1]).toBeCloseTo(result.panSurfaceY,8);
 expect(result.balanceReadout).toBe('22.50 g');await expect(page.locator('#handling-caption')).toContainText('compressed');
 fs.mkdirSync('reports/guided-two-load-evidence',{recursive:true});await page.screenshot({path:'reports/guided-two-load-evidence/aliquot-real-balance.png'});
 for(const task of PREPARATION.slice(7,10)){
  await page.waitForFunction(()=>!__lab.inspect().handling.busy && !__lab.inspect().actionCamera.moving);
  await page.locator('#perform-action').click();await page.waitForFunction(id=>__lab.state().history.some(h=>h.actionId===id),task.id);
  if(task.id==='cut-segment'||task.id==='pare-horizontal'){await page.evaluate(()=>__lab.handlingFrame(.4));expect(await page.evaluate(()=>__lab.inspect().actionCamera.station)).toBe('trim');await page.screenshot({path:`reports/guided-two-load-evidence/${task.id}-latest-closeup.png`});}
 }
 expect(errors).toEqual([]);
});
