import {test} from 'node:test';import assert from 'node:assert/strict';
import {createActionCamera,actionStation} from '../src/action-camera.js';
import {PREPARATION} from '../src/procedure.js';
test('each preparation operation has specific station including scale oven and trim',()=>{
 for(const t of PREPARATION)assert.ok(actionStation(t));assert.equal(actionStation(PREPARATION[0]),'balance');assert.equal(actionStation(PREPARATION[8]),'trim');assert.equal(actionStation({id:'dry-oven'}),'oven');assert.equal(actionStation({id:'record-reading'}),'cell');
});
test('compressed aliquot drying focuses its actual oven target before subsequent balance weighing',()=>{assert.equal(actionStation({id:'aliquot-dry',objectId:'can-initial',targetId:'oven'}),'oven');assert.equal(actionStation({id:'aliquot-weigh',targetId:'balance'}),'balance');});
test('one coordinator readies operation before callback, dwells then prepares next; reset cancels stale readiness',()=>{
 let ready,moves=[],calls=0;const c=createActionCamera({move:(view,done)=>{moves.push(view);ready=done;},cancelMove:()=>{}});
 c.request({id:'weigh-tare',targetId:'balance'});ready();c.begin({id:'weigh-tare',targetId:'balance'},()=>calls++);assert.equal(calls,0);ready();assert.equal(calls,1);
 c.request({id:'measure-diameter'});c.complete(100,650);c.tick(2249);assert.equal(moves.at(-1).mode,'operation');c.tick(2250);assert.equal(moves.at(-1).mode,'prepare');
 c.begin({id:'weigh-tare'},()=>calls++);const stale=ready;c.reset();stale();assert.equal(calls,1);
});
test('failed or cancelled operation returns to a retryable task and invalidates its readiness',()=>{
 let ready,calls=0;const c=createActionCamera({move:(_,done)=>ready=done,cancelMove:()=>{}});
 const task={id:'weigh-tare',targetId:'balance'};c.request(task);ready();c.begin(task,()=>calls++);const stale=ready;
 c.abort();stale();assert.equal(calls,0);assert.equal(c.busy(),false);assert.equal(c.state.view.mode,'prepare');ready();assert.equal(c.state.phase,'idle');
 c.begin(task,()=>calls++);ready();assert.equal(calls,1);
});
for(const terminal of [{id:'complete'},null])test(`terminal ${terminal?.id || 'null'} retains final balance operation after dwell`,()=>{
 const moves=[];const c=createActionCamera({move:(view,done)=>{moves.push(view);done();},cancelMove:()=>{}});
 c.request({id:'weigh-dry',targetId:'balance'});c.begin({id:'weigh-dry',targetId:'balance'});
 c.request({id:'measure-diameter'});c.request(terminal);c.complete(100,650);
 const finalView=c.state.view,count=moves.length;c.tick(2249);assert.equal(c.state.phase,'dwell');c.tick(2250);
 assert.equal(moves.length,count,'terminal dwell must not queue a trim/next-task move');assert.equal(c.state.phase,'idle');assert.equal(c.state.pending,null);assert.equal(c.state.view,finalView);assert.equal(c.state.view.station,'balance');
 c.request(terminal);assert.equal(moves.length,count,'terminal refresh must retain the result view');
});
test('roam preserves completed result dwell and consumes pending next task on its original deadline',()=>{
 const moves=[];const c=createActionCamera({move:(view,done)=>{moves.push(view);done();},cancelMove:()=>{}});
 c.request({id:'extrude'});c.begin({id:'extrude'});c.complete(100,650);c.request({id:'aliquot-tare',targetId:'balance'});
 const count=moves.length;c.setRoam(true);c.tick(4000);assert.equal(moves.length,count);c.setRoam(false);
 assert.equal(c.state.phase,'dwell');assert.equal(c.state.until,2250);assert.equal(moves.length,count);c.tick(2249);assert.equal(moves.length,count);c.tick(2250);
 assert.equal(c.state.view.task.id,'aliquot-tare');assert.equal(c.state.view.mode,'prepare');assert.equal(c.busy(),false);
});
test('idle roam restoration does not replace the selected view when current task is already prepared',()=>{
 const moves=[];const c=createActionCamera({move:(view,done)=>{moves.push(view);done();},cancelMove:()=>{}});
 c.request({id:'weigh-tare',targetId:'balance'});const count=moves.length;c.setRoam(true);c.setRoam(false);assert.equal(moves.length,count);assert.equal(c.state.phase,'idle');
});
test('roam invalidates uncommitted readiness and prepares the current required task after restoration',()=>{
 let ready,calls=0;const c=createActionCamera({move:(_,done)=>ready=done,cancelMove:()=>{}});const task={id:'weigh-tare',targetId:'balance'};
 c.request(task);ready();c.begin(task,()=>calls++);const stale=ready;c.setRoam(true);stale();c.setRoam(false);assert.equal(calls,0);assert.equal(c.state.view.task,task);assert.equal(c.state.view.mode,'prepare');ready();assert.equal(c.busy(),false);
});
test('held pointer freezes transition and free roam cancels pending action without losing context',()=>{
 let ready,calls=0,cancels=0;const c=createActionCamera({move:(_,done)=>{ready=done;},cancelMove:()=>cancels++});c.request({id:'cut-first'});c.freeze();assert.ok(cancels>0);c.begin({id:'cut-first'},()=>calls++);const stale=ready;c.setRoam(true);stale();assert.equal(calls,0);c.setRoam(false);assert.equal(c.state.view.task.id,'cut-first');
});
