/** Independent script-scoped public predictive keyboard.
 * Generic Unicode comparison is vendored locally as a private implementation.
 */
import {keyboardKey as key,prepareKeyboardIndex as prepare,predictKeyboard as predict}
  from './_generic_search.mjs';
const LANGUAGE='egy';
export function keyboardKey(value,language=LANGUAGE){
  if(language!==LANGUAGE)throw new RangeError('Wrong keyboard language package');
  return key(value,LANGUAGE);
}
export function prepareKeyboardIndex(language,pack){
  if(language!==LANGUAGE)throw new RangeError('Wrong keyboard language package');
  return prepare(language,pack);
}
export function predictKeyboard(index,raw,options={}){
  if(index?.language!==LANGUAGE)throw new RangeError('Wrong keyboard language package');
  return predict(index,raw,options);
}
