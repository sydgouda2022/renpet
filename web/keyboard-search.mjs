/** Sole adapter: prediction and attestations belong to each upstream keyboard. */
import * as cop from './keyboards/cop/keyboard_search.mjs';
import * as egy from './keyboards/egy/keyboard_search.mjs';
function own(lang) {
  if (lang === 'cop') return cop;
  if (lang === 'egy') return egy;
  throw new RangeError('Unsupported keyboard language');
}
export function keyboardKey(input, lang) { return own(lang).keyboardKey(input, lang); }
export function prepareKeyboardIndex(lang, pack) { return own(lang).prepareKeyboardIndex(lang, pack); }
export function predictKeyboard(index, input, options={}) {
  return own(index?.language).predictKeyboard(index, input, options);
}
