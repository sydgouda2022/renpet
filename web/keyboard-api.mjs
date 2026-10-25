/** Host integration only: two pinned standalone APIs own signs and suggestions. */
import {createCopticKeyboard} from './keyboards/cop/core.mjs';
import {createKeyboardFromData} from './keyboards/egy/keyboard_api.mjs';
const compiled=new WeakMap(),signOnly=createKeyboardFromData();
export function egyptianSignPages(){
 return Object.fromEntries(['uni','bi','tri'].map(group=>
  [group,signOnly.getSigns(group).map(s=>[s.glyph,s.code])]));
}
export function suggestions(raw,language,pack,learned={},limit=4,{dialect='all',previous=''}={}){
 if(!raw)return [];
 if(language==='cop'){
  const source=pack?.payload||pack;
  if(!source)return [{text:raw,raw:true,personal:false,attested:false,dialects:0}];
  let engine=compiled.get(source);
  if(!engine){engine=createCopticKeyboard(source);compiled.set(source,engine);}
  return engine.suggest(raw,{limit,learned,dialect,previous});
 }
 if(language==='egy'){
  const source=pack?.payload||pack;
  if(!source?.entries)return signOnly.predict(raw,{limit,learned,previous});
  let engine=compiled.get(source);
  if(!engine){engine=createKeyboardFromData({lexicon:source,manifest:pack?.manifest||null});compiled.set(source,engine);}
  return engine.predict(raw,{limit,learned,previous});
 }
 throw new RangeError('Unsupported keyboard language');
}
