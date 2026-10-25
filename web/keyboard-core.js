import {prepareKeyboardIndex,predictKeyboard} from './keyboard-search.mjs';
import {nativeNumber} from './calendar.js';

export const COPTIC_LETTERS=[...'ⲁⲃⲅⲇⲉⲋⲍⲏⲑⲓⲕⲗⲙⲛⲝⲟⲡⲣⲥⲧⲩⲫⲭⲯⲱϣϥϧϩϫϭϯ'];
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
 return {start:caret-(matched?.[0].length||0),end:caret,raw:matched?.[0]||''};
}
// A single prepared index is reused across keystrokes. All ranking and dialect
// filtering is delegated to the shared Egyptian/Coptic prediction engine.
const indexCache=new WeakMap();
export function suggestions(raw,language,lexicon,learned={},limit=4,options={}){
 if(!raw)return [];
 const pack=lexicon&&typeof lexicon==='object'?lexicon:null;
 let index=pack&&indexCache.get(pack);
 if(!index||index.language!==language){
  index=prepareKeyboardIndex(language,pack||(language==='cop'?{rows:[]}:{entries:[]}));
  if(pack)indexCache.set(pack,index);
 }
 return predictKeyboard(index,raw,{limit,learned,dialect:options.dialect||'all',previous:options.previous||''});
}
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
