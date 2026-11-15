import {chromium,webkit} from '@playwright/test';
import {readdir,readFile,writeFile} from 'node:fs/promises';import {gzipSync} from 'node:zlib';
const result={url:'http://127.0.0.1:4174/',browsers:{},bundle:[]};
for(const name of await readdir('dist/assets')){const b=await readFile('dist/assets/'+name);result.bundle.push({file:name,bytes:b.length,gzipBytes:gzipSync(b).length});}const html=await readFile('dist/index.html');result.bundle.push({file:'index.html',bytes:html.length,gzipBytes:gzipSync(html).length});result.totalBytes=result.bundle.reduce((a,b)=>a+b.bytes,0);result.totalGzipBytes=result.bundle.reduce((a,b)=>a+b.gzipBytes,0);
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist']}: {})});const page=await browser.newPage({viewport:{width:1440,height:900}});const requests=[],errors=[];page.on('request',r=>requests.push({url:r.url(),type:r.resourceType()}));page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(result.url+'?qa');await page.waitForFunction(()=>document.querySelector('#gpu-status')?.textContent!=='Initializing WebGPU',{timeout:30000});
 const status=await page.locator('#gpu-status').textContent();const data={version:browser.version(),status,errors,requests,navigatorGPU:await page.evaluate(()=>!!navigator.gpu)};
 if(status==='WebGPU · native'){data.renderer=await page.evaluate(()=>window.__lab.inspect());data.frames=await page.evaluate(()=>new Promise(resolve=>{let count=0,start=performance.now();function frame(t){count++;if(t-start>2000)resolve({count,seconds:(t-start)/1000,fps:count/((t-start)/1000)});else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));}
 else data.visibleError=await page.locator('#fatal-message').textContent();result.browsers[name]=data;await page.screenshot({path:`reports/screenshots/${name}-boot.png`});await browser.close();
}
await writeFile('reports/browser-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
