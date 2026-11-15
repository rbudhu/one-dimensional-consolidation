import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as carry from '../src/carry.js';
test('actual support rectangle and circle acquire edges but reject off-support and invalid points',()=>{
  assert.equal(typeof carry.containsSupportPoint,'function');
  const rect={shape:'rectangle',min:[-.0875,-.0515],max:[.0875,.0515]};
  const circle={shape:'circle',center:[0,0],radius:.035};
  for(const point of [[0,0],[.0875,.0515],[.0025,0]])assert.equal(carry.containsSupportPoint(rect,point),true);
  for(const point of [[0,.08],[.0876,0],[NaN,0],[0,Infinity]])assert.equal(carry.containsSupportPoint(rect,point),false);
  assert.equal(carry.containsSupportPoint(circle,[.035,0]),true);
  assert.equal(carry.containsSupportPoint(circle,[.025,.025]),false);
  assert.equal(carry.containsSupportPoint({...circle,radius:NaN},[0,0]),false);
  assert.equal(carry.containsSupportPoint({...circle,radius:-1},[0,0]),false);
  assert.equal(carry.containsSupportPoint({...rect,max:[Infinity,1]},[0,0]),false);
  assert.equal(carry.containsSupportPoint({...rect,min:[1,1]},[0,0]),false);
});
