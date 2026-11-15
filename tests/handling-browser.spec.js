import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const dir = 'reports/handling-final-evidence';
async function boot(page) {
  await page.goto('/?qa');
  await expect(page.locator('#gpu-status')).toHaveText('WebGPU · native', { timeout: 30000 });
}
async function actions(page, n) { for (let i=0;i<n;i++) await page.locator('#perform-action').click(); }
async function finalStage(page) {
  await actions(page,30);
  for(let stage=0;stage<11;stage++) {
    for(let row=0;row<15;row++) await page.locator('#record-reading').click();
    if(stage===10) await page.locator('#cutaway').click();
    await page.locator('#next-increment').click();
  }
}
async function pose(page, fraction) {
  return page.evaluate(f => window.__lab.handlingFrame(f), fraction);
}
function near(a,b) { expect(a).toBeCloseTo(b,8); }
async function evidence(page, name, data) {
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2));
  await page.screenshot({path:`${dir}/${name}.png`});
}
test('actual paring sample rests on ring, shares rotation and stationary horizontal side edge', async ({page}) => {
  await boot(page); await actions(page,10);
  await page.waitForFunction(() => window.__lab.inspect().animation === null);
  const before=await page.evaluate(() => window.__lab.state());
  const base=await page.evaluate(() => window.__lab.inspect());
  near(base.objectPositions.specimen[0],base.objectPositions.ring[0]);
  near(base.objectPositions.specimen[1]-.0762/2,base.objectPositions.ring[1]+.0254/2);
  await page.locator('#replay-handling').click();
  const a=await pose(page,.2), b=await pose(page,.65);
  for(const p of [a,b]) {
    near(p.objectPositions.specimen[0],p.objectPositions.ring[0]);
    near(p.objectPositions.specimen[1]-.0762/2,p.objectPositions.ring[1]+.0127);
    near(p.objectRotations.specimen[1],p.objectRotations.ring[1]);
    near(p.objectRotations.cutter[1],0);
    near(p.objectPositions.cutter[2]-.007-p.objectPositions.specimen[2],p.soilRadiusM);
    expect(p.objectPositions.cutter[1]).toBeLessThan(p.objectPositions.specimen[1]+.0381);
  }
  expect(a.soilRadiusM).toBeGreaterThan(b.soilRadiusM);
  expect(a.objectRotations.ring[1]).not.toBe(b.objectRotations.ring[1]);
  expect(a.rotationWitness.ring).not.toEqual(b.rotationWitness.ring);
  expect(a.rotationWitness.soil).not.toEqual(b.rotationWitness.soil);
  expect(await page.evaluate(() => window.__lab.state())).toEqual(before);
  await evidence(page,'paring',b);
  await actions(page,1); await page.waitForFunction(() => window.__lab.inspect().animation === null);
  near((await page.evaluate(() => window.__lab.inspect())).soilRadiusM,.03175);
});
test('short inspection caption does not overlap layer disclaimer',async({page})=>{
  await page.setViewportSize({width:1024,height:640}); await boot(page); await actions(page,30);
  await page.locator('#cutaway').click();
  await expect(page.locator('#layer-labels')).toBeVisible();
  const boxes=await page.evaluate(()=>{
    const a=document.querySelector('#handling-caption').getBoundingClientRect(),b=document.querySelector('#layer-labels').getBoundingClientRect();
    return {caption:a.toJSON(),key:b.toJSON(),overlap:a.width>0&&a.height>0&&a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom};
  });
  expect(boxes.overlap).toBe(false);
  await evidence(page,'short-inspection',boxes);
});
test('release panel distinguishes frozen last load from current equilibrium',async({page})=>{
  await boot(page); await finalStage(page);
  await page.locator('#cutaway').click(); await page.locator('#cutaway').click();
  await expect(page.locator('#pore-panel')).toBeVisible();
  await expect(page.locator('#pore-panel')).toContainText('Effective');
  await expect(page.locator('#stress')).toHaveText('47.88');
  await evidence(page,'before-release',await page.evaluate(()=>window.__lab.inspect()));
  await actions(page,1);
  await expect(page.locator('#stress')).toHaveText('0.00');
  await expect(page.locator('#pore-panel')).toContainText('post-release pressure evolution not modelled');
  await expect(page.locator('#pore-panel svg')).toHaveCount(0);
  await evidence(page,'released-panel',await page.evaluate(()=>window.__lab.inspect()));
  await page.locator('#cutaway').click();
  await actions(page,2);
  const before=await page.evaluate(()=>window.__lab.state());
  const blotBase=await pose(page,1);
  await page.locator('#replay-handling').click();
  const top=await pose(page,.2), bottom=await pose(page,.7);
  for(const [p,angle] of [[top,0],[bottom,Math.PI]]) {
    near(p.objectRotations.specimen[2],angle);
    near(p.objectRotations.ring[2],angle);
    near(p.objectPositions.towel[0],p.objectPositions.specimen[0]);
    near(p.objectPositions.towel[1]-.001,p.objectPositions.specimen[1]+p.soilHeightM/2);
    expect(p.objectPositions.specimen[1]-p.soilHeightM/2).toBeGreaterThan(.04);
  }
  expect(await page.evaluate(()=>window.__lab.state())).toEqual(before);
  await pose(page,.2); await evidence(page,'blot-top',top);
  await pose(page,.7); await evidence(page,'blot-bottom',bottom);
  const restored=await pose(page,1);
  expect(restored.animation).toBe(null);
  near(restored.objectRotations.ring[2],0); near(restored.objectRotations.specimen[2],0);
  for(const id of ['ring','specimen','towel']) expect(restored.objectPositions[id]).toEqual(blotBase.objectPositions[id]);
  await actions(page,4);
  const oven=await page.evaluate(()=>window.__lab.inspect());
  expect(oven.finalCanLid.covered).toBe(false);
  expect(Math.abs(oven.finalCanLid.localCenter[0])).toBeGreaterThan(.034);
  await evidence(page,'oven-lid-open',oven);
  await actions(page,1);
  await page.waitForFunction(()=>window.__lab.inspect().animation===null);
  const dry=await page.evaluate(()=>window.__lab.inspect());
  expect(dry.finalCanLid.covered).toBe(true);
  near(dry.finalCanLid.localCenter[0],0); near(dry.finalCanLid.localCenter[2],0);
  near(dry.finalCanLid.localCenter[1]-.0015,.045/2);
  await expect(page.locator('#handling-caption')).toContainText('covered cooling; illustrative handling, thermal cooling not modelled');
  await evidence(page,'covered-cooling',dry);
  await actions(page,1); await page.locator('#replay-handling').click();
  const weighing=await pose(page,.2);
  near(weighing.finalCanLid.localCenter[1],.024);
  await evidence(page,'covered-weighing',weighing);
  expect(await page.evaluate(()=>window.__lab.inspect().readings)).toBe(165);
});
