import {createExperiment} from '/Users/budhur/.hermes/cache/scratch/two-load-reference-baseline/src/procedure.js';
import {READING_MINUTES,PRESSURES_TSF} from '/Users/budhur/.hermes/cache/scratch/two-load-reference-baseline/src/physics.js';
import fs from 'node:fs/promises';
const e=createExperiment();e.setSpeed(86400);
let actions=0;while(e.state.phase==='preparation'){const t=e.currentTask();const r=e.act(t.id);if(!r.ok)throw Error(r.message);actions++;}
for(let stage=0;stage<PRESSURES_TSF.length;stage++) {
 for(const minute of READING_MINUTES){e.tick(86400);const r=e.recordReading();if(!r.ok)throw Error(r.message);const last=e.state.readings.at(-1);if(last.minutes!==minute||last.stageIndex!==stage)throw Error('Reference reading mismatch');}
 const r=e.nextIncrement();if(!r.ok)throw Error(r.message);
}
const result={source:'441d200',preparationActions:actions,phase:e.state.phase,pressures:PRESSURES_TSF,timestamps:READING_MINUTES,readings:e.state.readings,measurements:e.state.measurements};
await fs.mkdir('reports/two-load-baseline',{recursive:true});await fs.writeFile('reports/two-load-baseline/reference-fully-manual.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({source:result.source,preparationActions:actions,phase:result.phase,readings:result.readings.length,pressureStages:PRESSURES_TSF.length,lastPressure:result.readings.at(-1).pressureTsf}));
