import {suggestions} from './keyboard-api.mjs';
import {nativeNumber} from './calendar.js';

export {COPTIC_KEYS as COPTIC_LETTERS} from './keyboards/cop/core.mjs';
export const EGY_NUMBERS=[
 ...Array.from({length:9},(_,i)=>({value:i+1,text:'𓏺'.repeat(i+1)})),
 ...[[10,'𓎆'],[100,'𓍢'],[1000,'𓆼'],[10000,'𓂭'],[100000,'𓆐'],[1000000,'𓁨']].map(([value,text])=>({value,text}))
];
export const COP_NUMBERS=[...Array.from({length:9},(_,i)=>i+1),10,100,1000].map(value=>({value,text:nativeNumber(value,'cop')}));
const cop=/[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+$/u;
const egy=/[\u{13000}-\u{1345f}\u{13460}-\u{143ff}]+$/u;
export function wordRange(input, caret, lang){
 const left=input.slice(0,caret);
 const matched=left.match(lang==='cop'?cop:egy);
 // Replace the complete word, not only the characters left of the caret.
  const right=input.slice(caret).match(lang==='cop'?/^[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+/u:/^[\u{13000}-\u{1345f}\u{13460}-\u{143ff}]+/u)?.[0]||'';
  return {start:caret-(matched?.[0].length||0),end:caret+right.length,raw:(matched?.[0]||'')+right};
}
// The independent keyboard APIs own prediction and linguistic evidence.
export {suggestions};
export function deleteGrapheme(value,start,end){
 if(start!==end)return {start,end,text:''};
 if(start===0)return {start:0,end:0,text:''};
 const s=value.slice(0,start);
 if(typeof Intl!=='undefined'&&Intl.Segmenter){
  let last=0;for(const t of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s))last=t.index;
  return {start:last,end:start,text:''};
 }
 return {start:start-[...s].at(-1).length,end:start,text:''};
}
