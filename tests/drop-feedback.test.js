import test from 'node:test';
import assert from 'node:assert/strict';
import {zoneFromPoints,containsClientPoint,cueStyle} from '../src/drop-feedback.js';
const rect={left:100,top:50,width:800,height:500};
const pts=(x,y,w=1,h=1)=>[{x,y,z:.5},{x:x+w,y:y+h,z:.5}];
test('small projected geometry gets a 44 CSS pixel padded usable zone',()=>{
 const z=zoneFromPoints(pts(200,100),rect);assert.equal(z.width,44);assert.equal(z.height,44);assert.equal(z.left,178.5);
});
test('physical visible vertex bounds plus 10px margin define inclusive border',()=>{
 const z=zoneFromPoints(pts(200,100,180,70),rect);assert.deepEqual(z,{left:190,right:390,top:90,bottom:180,width:200,height:90});
 for(const p of [{x:190,y:90},{x:390,y:180},{x:250,y:120}])assert.equal(containsClientPoint(z,p),true);
 for(const p of [{x:189.99,y:90},{x:390.01,y:180},{x:NaN,y:120}])assert.equal(containsClientPoint(z,p),false);
});
test('offscreen, behind-camera, invalid and empty geometry reject',()=>{
 for(const p of [[],pts(-100,-100),[{x:200,y:100,z:2}],[{x:200,y:100,z:-2}],[{x:NaN,y:100,z:.5}]])assert.equal(zoneFromPoints(p,rect),null);
 assert.equal(zoneFromPoints(pts(200,100),{...rect,width:0}),null);assert.equal(containsClientPoint(null,{x:200,y:100}),false);
});
test('partially visible target clamps to canvas client coordinates',()=>{
 const z=zoneFromPoints(pts(80,30,100,100),rect);assert.equal(z.left,100);assert.equal(z.top,50);assert.equal(z.right,190);assert.equal(z.bottom,140);
});
test('wall-time amber opacity breathes without affecting immutable boundary',()=>{
 const z=zoneFromPoints(pts(200,100),rect),saved={...z};const a=cueStyle({now:0}),b=cueStyle({now:600});assert.equal(a.color,'#ffb52e');assert.notEqual(a.opacity,b.opacity);assert.deepEqual(z,saved);
});
test('green and reduced-motion amber opacity remain steady',()=>{
 for(const mode of [{inside:true},{reducedMotion:true}])assert.deepEqual(cueStyle({...mode,now:0}),cueStyle({...mode,now:600}));
});
