/** Renpet UI adapter. Lexical ranking, sign inventories and editing belong to the two independent APIs. */
import {COPTIC_KEYS,createCopticKeyboard} from './keyboards/cop/core.mjs';
import {wordBeforeCaret,backspaceRange} from './keyboards/cop/editor.mjs';
import {createKeyboardFromData} from './keyboards/egy/keyboard_api.mjs';
import {nativeNumber} from './calendar.js';

export const COPTIC_LETTERS=COPTIC_KEYS;
export const EGY_NUMBERS=[
 ...Array.from({length:9},(_,i)=>({value:i+1,text:'𓏺'.repeat(i+1)})),
 ...[[10,'𓎆'],[100,'𓍢'],[1000,'𓆼'],[10000,'𓂭'],[100000,'𓆐'],[1000000,'𓁨']].map(([value,text])=>({value,text}))
];
export const COP_NUMBERS=[...Array.from({length:9},(_,i)=>i+1),10,100,1000].map(value=>({value,text:nativeNumber(value,'cop')}));
const signs=createKeyboardFromData();
export function egyptianSignKeys(group='uni'){
 return signs.getSigns(group).map(s=>[s.glyph,s.code]);
}
// Prefix completion replaces the entire word, including a suffix to the right of the caret.
const beforeEgyptian=/[\u{13000}-\u{1345f}\u{13460}-\u{143ff}]+$/u;
const afterEgyptian=/^[\u{13000}-\u{1345f}\u{13460}-\u{143ff}]+/u;
const afterCoptic=/^[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+/u;
export function wordRange(value,caret,lang){
 if(typeof value!=='string'||!Number.isInteger(caret)||caret<0||caret>value.length)throw new RangeError('Invalid cursor');
 const before=lang==='cop'?wordBeforeCaret(value,caret):(()=>{
   const match=value.slice(0,caret).match(beforeEgyptian);
   return {start:caret-(match?.[0].length||0),end:caret,raw:match?.[0]||''};
 })();
 const suffix=value.slice(caret).match(lang==='cop'?afterCoptic:afterEgyptian);
 return {...before,end:caret+(suffix?.[0].length||0)};
}
const engineCache=new WeakMap();
export function suggestions(raw,language,pack,learned={},limit=4,options={}){
 if(!raw)return [];
 if(language!=='cop'&&language!=='egy')throw new RangeError('Unsupported keyboard language');
 const input=pack&&typeof pack==='object'?pack:null;
 let engine=input&&engineCache.get(input);
 if(!engine){
  engine=language==='cop'
   ?createCopticKeyboard(input||{rows:[]})
   :createKeyboardFromData({lexicon:input?.entries?input:{entries:[]}});
  if(input)engineCache.set(input,engine);
 }
 const args={learned,limit,previous:options.previous||''};
 return language==='cop'?
  engine.suggest(raw,{...args,dialect:options.dialect||'all'}):
  engine.predict(raw,args);
}
export function deleteGrapheme(value,start,end){return backspaceRange(value,start,end);}
