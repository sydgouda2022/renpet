import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutForViewport,isKeyboardDrivenResize,LAYOUT_LIMITS} from '../web/responsive-layout.js';

test('device-agnostic available CSS viewport policy',()=>{
 assert.deepEqual(LAYOUT_LIMITS,{tabletWidth:700,splitWidth:1024,minHeight:560});
 for(const [w,h,expected] of [
  [390,844,'phone'],[844,390,'phone'],[699,900,'phone'],
  [700,559,'phone'],[700,560,'tablet-stacked'],
  [744,1133,'tablet-stacked'],[1023,768,'tablet-stacked'],
  [1024,559,'phone'],[1024,560,'tablet-split'],
  [1024,768,'tablet-split'],[1440,900,'tablet-split'],
  [1200,500,'phone'],[820,400,'phone'],
  [0,900,'phone'],[NaN,800,'phone']
 ])assert.equal(layoutForViewport(w,h),expected,w+'×'+h);
});
test('soft-keyboard guard ignores height-only loss, never a rotation or width change',()=>{
 const previous={width:1024,height:768};
 assert.equal(isKeyboardDrivenResize(previous,1024,400,true),true);
 assert.equal(isKeyboardDrivenResize(previous,744,1133,true),false);
 assert.equal(isKeyboardDrivenResize(previous,844,390,true),false);
 assert.equal(isKeyboardDrivenResize(previous,1024,400,false),false);
 assert.equal(isKeyboardDrivenResize(previous,1024,768,true),false);
 assert.equal(isKeyboardDrivenResize(null,1024,400,true),false);
});
