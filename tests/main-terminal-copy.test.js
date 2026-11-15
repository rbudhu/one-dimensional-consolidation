import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Exercise the real refresh function in isolation: no renderer or scientific state mutation.
const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const refresh=source.slice(source.indexOf('function refresh() {'),source.indexOf('\ntry {',source.indexOf('function refresh() {')));
function render(phase,parked){
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{dataset:{},hidden:false});return elements.get(id);};
 const readings=Array.from({length:165},(_,i)=>({recordedBy:i<30?'learner':'automatic',stageIndex:Math.floor(i/15)}));
 const s={phase,taskIndex:phase==='complete'?9:0,stageIndex:10,readings,stages:[],speed:3600};
 const t=phase==='complete'?{id:'complete',title:'Experiment complete',instruction:'Open the notebook to analyze measured masses and recorded stage readings.'}:{id:'release-load',instruction:'Release the final load.'};
 vm.runInNewContext(`${refresh}\nrefresh();`,{$,experiment:{state:s,currentTask:()=>t},automation:{state:{active:false,complete:true}},scene:{hasParked:()=>parked,isWholeBench:()=>false,actionBlocked:()=>false,update:()=>{},setTask:()=>{}},document:{querySelector:()=>$('stage')},latestMeasurement:()=>null,liveMeasurements:()=>({status:'Complete'}),measurementRows:()=>[],appliedLoad:()=>({pressureKPa:0}),lastTaskKey:null,names:{},roam:false,lastHandling:null,READING_MINUTES:[0],PREPARATION:[]});
 return $;
}
for(const parked of [false,true])test(`complete instructions prioritize analysis with optional return (parked=${parked})`,()=>{
 const $=render('complete',parked);
 assert.match($('automation-status').textContent,/All 11 increments and recovery complete/);
 assert.match($('automation-status').textContent,/notebook.*analyze.*export/i);
 assert.doesNotMatch($('automation-status').textContent,/release|finish recovery/i);
 assert.match($('instruction').textContent,/notebook.*analyze.*export/i);
 assert.doesNotMatch($('instruction').textContent,/before dragging|next action|continue/i);
 assert.match($('scene-key').innerHTML,/complete/i);
 assert.doesNotMatch($('scene-key').innerHTML,/before dragging|Drag highlighted/);
 if(parked)assert.match($('return-assembly').textContent,/optional/i);
 assert.equal($('return-assembly').hidden,!parked);
 assert.equal($('perform-action').hidden,true);
 assert.equal($('loading-provenance').textContent,'30 learner-recorded · 135 automatic readings · 165 total');
});
test('final phase still directs interactive load release and recovery',()=>{
 const $=render('final',true);
 assert.match($('automation-status').textContent,/Release the final load and finish recovery yourself/);
 assert.match($('instruction').textContent,/before dragging/);
 assert.equal($('perform-action').hidden,false);
});
