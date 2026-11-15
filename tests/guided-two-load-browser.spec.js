import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {PREPARATION} from '../src/procedure.js';
const FINAL=[['release-load','adjuster','cap'],['disassemble','assembly','bench'],['blot','towel','specimen'],['weigh-final-wet','ring','balance'],['weigh-can','can-final','balance'],['transfer-soil','specimen','can-final'],['oven-place','can-final','oven'],['dry-oven',null,null],['weigh-dry','can-final','balance']].map(([id,objectId,targetId])=>({id,objectId,targetId}));
import {READING_MINUTES,PRESSURES_TSF} from '../src/physics.js';
const dir='reports/guided-two-load-evidence';
const reference=JSON.parse(fs.readFileSync('reports/two-load-baseline/reference-fully-manual.json','utf8'));
async function ready(page){await page.waitForFunction(()=>!__lab.inspect().handling.busy && !__lab.inspect().actionCamera.moving,null,{timeout:15000});}
async function action(page,task){
 await ready(page);if(await page.locator('#return-assembly').isVisible()){await page.locator('#return-assembly').click();await ready(page);}if(task.title)await expect(page.locator('#task-title')).toHaveText(task.title);expect(await page.evaluate(()=>__lab.inspect().task)).toBe(task.id);
 if(task.objectId){const source=await page.evaluate(id=>__lab.projectObject(id),task.objectId);expect(source,`${task.id} grabbable source`).toBeTruthy();expect(source.x,task.id).toBeGreaterThan(0);expect(source.x,task.id).toBeLessThan(1114);expect(source.y,task.id).toBeGreaterThan(170);expect(source.y,task.id).toBeLessThan(850);}
 if(task.targetId){const target=await page.evaluate(id=>__lab.projectTarget(id,{forDrag:false}),task.targetId);expect(target,`${task.id} actual target`).toBeTruthy();expect(target.x,task.id).toBeGreaterThan(0);expect(target.x,task.id).toBeLessThan(1114);expect(target.y,task.id).toBeGreaterThan(170);expect(target.y,task.id).toBeLessThan(850);}
 console.log('REAL_ACTION',task.id);
 await page.locator('#perform-action').click();
 await page.waitForFunction(id=>__lab.state().history.some(h=>h.actionId===id),task.id,{timeout:15000}).catch(async error=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/failed-action.json`,JSON.stringify(await page.evaluate(()=>({inspect:__lab.inspect(),state:__lab.state(),feedback:document.querySelector('#feedback').textContent})),null,2));throw error;});
}
async function boot(page){await page.goto('/?qa');await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native',{timeout:30000});}
async function prepare(page){for(const task of PREPARATION)await action(page,task);await ready(page);}
async function manualTwo(page){
 await page.locator('#speed').selectOption('86400');
 for(let stage=0;stage<2;stage++){
  for(let point=0;point<15;point++){
   await expect(page.locator('#record-reading')).toBeEnabled();await page.locator('#record-reading').click();
   await page.waitForFunction(n=>__lab.state().readings.length===n,stage*15+point+1);
  }
  if(stage===0){await page.locator('#next-increment').click();await page.waitForFunction(()=>__lab.state().stageIndex===1);}
 }
 await expect(page.locator('#next-increment')).toHaveText('Simulate remaining 9 increments');
 expect((await page.evaluate(()=>__lab.state().readings)).every(r=>r.recordedBy==='learner')).toBe(true);
}
async function shot(page,name){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/${name}.png`});}
test('two learner loadings plus automatic nine produce real 165 readings, final recovery and truthful CSV',async({page})=>{
 test.setTimeout(500000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await boot(page);await prepare(page);await manualTwo(page);
 await expect(page.locator('#loading-provenance')).toContainText('30 learner');await shot(page,'two-learner-complete');
 // Restore a learner-selected speed after the automatic clock finishes.
 await page.locator('#speed').selectOption('3600');await page.locator('#next-increment').click();
 await page.waitForFunction(()=>__lab.inspect().automation?.active);
 await expect(page.locator('#record-reading')).toBeDisabled();await expect(page.locator('#next-increment')).toBeDisabled();await expect(page.locator('#speed')).toBeDisabled();
 await page.keyboard.press('p');await page.waitForFunction(()=>__lab.inspect().automation.paused);
 const paused=await page.evaluate(()=>({readings:__lab.state().readings,minutes:__lab.state().elapsedMinutes}));await page.waitForTimeout(450);
 expect(await page.evaluate(()=>({readings:__lab.state().readings,minutes:__lab.state().elapsedMinutes}))).toEqual(paused);
 await shot(page,'automatic-paused');
 // Exercise reset during a real active/paused run, not a fabricated loading fixture.
 page.once('dialog',dialog=>dialog.accept());await page.locator('#restart').click();
 await page.waitForFunction(()=>__lab.state().phase==='preparation');
 expect(await page.evaluate(()=>__lab.inspect().automation)).toMatchObject({active:false,paused:false,complete:false,recordedCount:0,completedIncrements:0});
 expect(await page.evaluate(()=>__lab.state().readings)).toEqual([]);expect(await page.evaluate(()=>__lab.state().history.filter(h=>h.actionId==='record-reading'))).toEqual([]);
 await page.waitForTimeout(300);expect(await page.evaluate(()=>__lab.state().readings)).toEqual([]);
 if(await page.evaluate(()=>__lab.inspect().roam))await page.keyboard.press('p');
 await ready(page);expect(await page.evaluate(()=>__lab.inspect().actionCamera.station)).toBe('balance');
 const resetSource=await page.evaluate(()=>__lab.projectObject('ring'));expect(resetSource).toBeTruthy();expect(resetSource.x).toBeGreaterThan(0);expect(resetSource.x).toBeLessThan(1114);expect(resetSource.y).toBeGreaterThan(76);expect(resetSource.y).toBeLessThan(900);
 await prepare(page);await manualTwo(page);await page.locator('#speed').selectOption('3600');await page.locator('#next-increment').click();
 await page.waitForFunction(()=>__lab.state().phase==='final',{},{timeout:30000});await ready(page);
 const state=await page.evaluate(()=>__lab.state());const automation=await page.evaluate(()=>__lab.inspect().automation);
 expect(automation).toMatchObject({active:false,complete:true,completedIncrements:9,recordedCount:135});expect(state.speed).toBe(3600);
 expect(state.readings).toHaveLength(165);expect(state.readings.filter(r=>r.recordedBy==='learner')).toHaveLength(30);expect(state.readings.filter(r=>r.recordedBy==='automatic')).toHaveLength(135);
 for(let i=0;i<11;i++){const rows=state.readings.filter(r=>r.stageIndex===i);expect(rows.map(r=>r.minutes)).toEqual(READING_MINUTES);expect(rows.map(r=>r.pressureTsf)).toEqual(Array(15).fill(PRESSURES_TSF[i]));}
 expect(state.readings.map(({recordedBy,...physical})=>physical)).toEqual(reference.readings);
 expect(await page.evaluate(()=>__lab.inspect().pressureTsf)).toBe(.5);expect(state.history.filter(h=>h.actionId==='release-load')).toHaveLength(0);
 await expect(page.locator('#loading-provenance')).toContainText('135 automatic');await shot(page,'automatic-complete-held-load');
 fs.writeFileSync(`${dir}/loading-state.json`,JSON.stringify({state,automation,errors},null,2));
 for(const task of FINAL){
  if(task.id==='dry-oven'){
   await ready(page);const before=await page.evaluate(()=>__lab.state().ovenMinutes);if(before<960)await expect(page.locator('#perform-action')).toBeDisabled();await page.locator('#speed').selectOption('86400');
   await page.waitForFunction(()=>__lab.state().ovenMinutes>=960);
  }
  await action(page,task);
  if(task.id==='release-load'){expect(await page.evaluate(()=>__lab.inspect().pressureTsf)).toBe(0);}
 }
 await expect(page.locator('#task-title')).toHaveText('Experiment complete');await ready(page);
 await page.waitForFunction(()=>__lab.inspect().actionCamera.phase==='idle');
 const terminalCamera=await page.evaluate(()=>__lab.inspect().actionCamera);
 expect(terminalCamera).toMatchObject({station:'balance',mode:'operation',moving:false,wholeBench:false});
 await page.waitForTimeout(1700);expect(await page.evaluate(()=>__lab.inspect().actionCamera)).toEqual(terminalCamera);
 await expect(page.locator('#automation-status')).toContainText('All 11 increments and recovery complete');
 await expect(page.locator('#automation-status')).not.toContainText('Release');
 await expect(page.locator('#instruction')).toContainText('analyze');await expect(page.locator('#instruction')).toContainText('export');
 await expect(page.locator('#instruction')).not.toContainText('before dragging');
 await expect(page.locator('#scene-key')).toContainText('Experiment complete');
 await expect(page.locator('#perform-action')).toBeHidden();
 if(await page.locator('#return-assembly').isVisible())await expect(page.locator('#return-assembly')).toContainText('optional');
 await shot(page,'final-recovery-complete');
 await page.locator('#notebook-open').click();await expect(page.locator('#notebook-provenance')).toContainText('30 learner');await expect(page.locator('#notebook-provenance')).toContainText('135 automatic');
 await page.locator('[data-tab="time"]').click();expect(await page.locator('#nb-stage option').count()).toBe(11);
 await page.locator('#nb-stage').selectOption('10');await expect(page.locator('#notebook-panel')).toContainText('Automatically calculated');await expect(page.locator('.plot')).toBeVisible();await shot(page,'automatic-time-curve');
 await page.locator('[data-tab="pressure"]').click();await expect(page.locator('.plot')).toBeVisible();expect((await page.evaluate(()=>__lab.analysis())).ends).toHaveLength(11);await shot(page,'eleven-pressure-curve');
 const pending=page.waitForEvent('download');await page.locator('#export-csv').click();const download=await pending;await download.saveAs(`${dir}/readings.csv`);
 const csv=fs.readFileSync(`${dir}/readings.csv`,'utf8').split(/\r?\n/);const header=csv.findIndex(l=>l.startsWith('stage,pressure_tsf,'));expect(csv[header]).toContain('recorded_by');
 const rows=csv.slice(header+1).filter(l=>/^\d+,/.test(l));expect(rows).toHaveLength(165);expect(rows.filter(l=>l.endsWith(',learner'))).toHaveLength(30);expect(rows.filter(l=>l.endsWith(',automatic'))).toHaveLength(135);
 fs.writeFileSync(`${dir}/browser-state.json`,JSON.stringify({state:await page.evaluate(()=>__lab.state()),automation,errors},null,2));expect(errors).toEqual([]);
});
