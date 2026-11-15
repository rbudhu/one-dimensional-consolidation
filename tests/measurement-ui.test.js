import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExperiment} from '../src/procedure.js';
import {measurementRows,latestMeasurement,caliperMeasurement,liveMeasurements} from '../src/measurement-ui.js';
test('pending measurements blank; completed tare human named with explicit unit',()=>{
 const e=createExperiment();assert.ok(measurementRows(e.state).every(r=>r.value===null));assert.equal(latestMeasurement(e.state),null);
 e.act('weigh-tare');assert.deepEqual(latestMeasurement(e.state),{field:'ringGlassTareG',name:'Ring + wrapped plate tare',value:241,unit:'g',actionId:'weigh-tare',derived:false});
 assert.equal(measurementRows(e.state).find(r=>r.field==='ringGlassTareG').value,241);
});
test('dry aliquot mass never confused with 960 minute drying and caliper follows height',()=>{
 const e=createExperiment();for(let i=0;i<7;i++)e.act(e.currentTask().id);
 assert.equal(latestMeasurement(e.state).value,22.5);assert.equal(latestMeasurement(e.state).unit,'g');
 assert.equal(caliperMeasurement(e.state).value,25.4);assert.equal(caliperMeasurement(e.state).field,'initialHeightM');
 assert.ok(measurementRows(e.state).some(r=>r.field==='w0' && r.derived && Math.abs(r.value-30)<1e-9));
});
test('live loading blank before model and explicit released frozen distinction',()=>{
 const e=createExperiment();assert.equal(liveMeasurements(e.state).dial,null);
 for(let i=0;i<30;i++)e.act(e.currentTask().id);assert.equal(liveMeasurements(e.state).pressureTsf,.5);
 e.state.history.push({actionId:'release-load'});assert.equal(liveMeasurements(e.state).pressureTsf,0);assert.equal(liveMeasurements(e.state).status,'Released · last loaded reading frozen');
});
