import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const output='reports/drop-feedback-baseline';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4174/?qa');await page.waitForFunction(()=>document.querySelector('#gpu-status').textContent==='WebGPU · native');
 const points=await page.evaluate(()=>({from:__lab.projectObject('ring'),to:__lab.projectTarget('balance',{forDrag:false,offsetZM:.08})}));
 await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await page.waitForFunction(()=>__lab.inspect().handling.phase==='carry');
 await page.mouse.move(points.to.x,points.to.y,{steps:20});await page.screenshot({path:output+'/cursor-near-balance-body.png'});await page.mouse.up();
 await page.waitForFunction(()=>!__lab.inspect().handling.busy);
 const result=await page.evaluate(()=>({task:__lab.inspect().task,tare:__lab.state().history.filter(h=>h.actionId==='weigh-tare').length,message:document.querySelector('#hover-label').textContent}));
 await fs.writeFile(output+'/baseline.json',JSON.stringify({points,result,errors},null,2));console.log(JSON.stringify({points,result,errors},null,2));
 if(result.task!=='weigh-tare'||result.tare!==0||errors.length)throw new Error('Expected old physical-pan-only rejection was not reproduced');
} finally {await browser.close();}
