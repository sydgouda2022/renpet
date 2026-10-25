/** Standalone, accessible Coptic touch keyboard. No application imports.
 * The host owns the edited field, persistence and the surrounding UI.
 */
import {prepareKeyboardIndex, predictKeyboard} from './keyboard_search.mjs';
export const COPTIC_KEYS = Object.freeze([... 'ⲁⲃⲅⲇⲉⲋⲍⲏⲑⲓⲕⲗⲙⲛⲝⲟⲡⲣⲥⲧⲩⲫⲭⲯⲱϣϥϧϩϫϭϯ']);
const WORD = /[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+$/u;
const DIALECTS = new Set(['all', 'sahidic', 'bohairic']);

function checkTextTarget(target) {
  if (!target || typeof target.value !== 'string' ||
      typeof target.setRangeText !== 'function' ||
      typeof target.addEventListener !== 'function' ||
      typeof target.selectionStart !== 'number')
    throw new TypeError('target must be an editable input or textarea supporting setRangeText');
  if (target.readOnly || target.disabled ||
      (target.tagName === 'INPUT' && !['text','search'].includes(target.type)))
    throw new TypeError('target is not an editable text/search input or textarea');
}

function graphemeStart(text) {
  if (!text) return 0;
  if (typeof Intl.Segmenter === 'function') {
    let index = 0;
    for (const segment of new Intl.Segmenter('und', {granularity: 'grapheme'}).segment(text))
      index = segment.index;
    return index;
  }
  return text.length - [...text].at(-1).length;
}

function activeWord(target) {
  const end = target.selectionStart;
  if (end === null || end !== target.selectionEnd) return {start:end ?? 0, end:end ?? 0, raw:''};
  const startText = target.value.slice(0,end);
  const raw = startText.match(WORD)?.[0] ?? '';
  return {start:end-raw.length,end,raw};
}

function insertText(target, text, start = target.selectionStart, end = target.selectionEnd) {
  // setRangeText uses the host's selection and fires the same observable input
  // event contract as other typed text (without synthesizing keyboard events).
  target.setRangeText(text, start, end, 'end');
  target.dispatchEvent(new Event('input', {bubbles:true}));
  target.focus({preventScroll:true});
}

function button(doc, label, value, className) {
  const b=doc.createElement('button');
  b.type='button';b.textContent=label;b.dataset.value=value;b.className=className;
  b.setAttribute('aria-label',label);return b;
}

/**
 * @param {object} settings
 * @param {HTMLInputElement|HTMLTextAreaElement} settings.target
 * @param {HTMLElement} [settings.mount] DOM container (defaults to target parent)
 * @param {object} [settings.lexicon] Compiled Coptic lexicon (no fetch is performed)
 * @param {'all'|'sahidic'|'bohairic'} [settings.dialect]
 * @param {object} [settings.learned] Host-controlled personal usage counters
 * @param {function} [settings.onChange] Called after keyboard edits
 * @returns {object} controller with element, setLexicon, setDialect, refresh, destroy
 */
export function mountCopticKeyboard({
  target, mount = target?.parentElement, lexicon = {rows:[]},
  dialect = 'all', learned = {}, onChange = null
} = {}) {
  checkTextTarget(target);
  if (!mount || typeof mount.append !== 'function')
    throw new TypeError('mount must be an HTML element');
  if (!DIALECTS.has(dialect)) throw new RangeError('Unknown Coptic dialect');
  const doc = target.ownerDocument;
  const element = doc.createElement('section');
  element.className = 'coptic-keyboard';element.setAttribute('role','group');
  element.setAttribute('aria-label','Coptic keyboard');
  const controls=doc.createElement('div');controls.className='coptic-kb-controls';
  const dialectLabel=doc.createElement('label');dialectLabel.textContent='Dialect ';
  const select=doc.createElement('select');select.setAttribute('aria-label','Coptic dialect');
  for(const [value,label] of [['all','All'],['sahidic','Sahidic'],['bohairic','Bohairic']]){
    const option=doc.createElement('option');option.value=value;option.textContent=label;select.append(option);
  }
  select.value=dialect;dialectLabel.append(select);controls.append(dialectLabel);
  const suggestions=doc.createElement('div');
  suggestions.className='coptic-kb-suggestions';
  suggestions.setAttribute('aria-label','Word suggestions');
  const keys=doc.createElement('div');keys.className='coptic-kb-keys';
  for(const character of COPTIC_KEYS) keys.append(button(doc,character,character,'coptic-kb-key'));
  const editing=doc.createElement('div');editing.className='coptic-kb-edit';
  for(const [label,action] of [['Space','space'],['⌫','backspace'],['↵','enter']]){
    editing.append(button(doc,label,action,'coptic-kb-control'));
  }
  element.append(controls,suggestions,keys,editing);
  mount.append(element);
  let index=prepareKeyboardIndex('cop',lexicon), usage=learned, disposed=false;
  function refresh() {
    if (disposed) return;
    suggestions.replaceChildren();
    const {raw}=activeWord(target);
    if(!raw)return;
    const choices=predictKeyboard(index,raw,{dialect,learned:usage,limit:4});
    for (const candidate of choices.slice(1)) {
      const b=button(doc,candidate.text,candidate.text,'coptic-kb-suggestion');
      b.title=candidate.inLexicon?'Compiled source form':'Personal text (unverified)';
      b.dataset.suggestion='true';
      b.dataset.personal=String(candidate.personal);
      suggestions.append(b);
    }
  }
  function onClick(event) {
    const clicked=event.target.closest('button');
    if (!clicked || !element.contains(clicked)) return;
    const action=clicked.dataset.value;
    if(clicked.dataset.suggestion==='true') {
      const word=activeWord(target);
      if(word.raw) insertText(target,action,word.start,word.end);
    } else if(action==='backspace') {
      const start=target.selectionStart,end=target.selectionEnd;
      const from=start===end?graphemeStart(target.value.slice(0,start)):start;
      insertText(target,'',from,end);
    } else if(action==='space') insertText(target,' ');
    else if(action==='enter') {
      if(target.tagName==='TEXTAREA')insertText(target,'\n');
    } else if(COPTIC_KEYS.includes(action)) insertText(target,action);
    else return;
    refresh();
    if(typeof onChange==='function')onChange({value:target.value, target});
  }
  function onSelect(){refresh();}
  function onDialect(){dialect=select.value;refresh();}
  element.addEventListener('click',onClick);
  select.addEventListener('change',onDialect);
  target.addEventListener('input',onSelect);
  target.addEventListener('click',onSelect);
  target.addEventListener('keyup',onSelect);
  refresh();
  return {
    element,
    setLexicon(value){if(disposed)throw Error('Keyboard destroyed');index=prepareKeyboardIndex('cop',value);refresh();},
    setDialect(value){if(!DIALECTS.has(value))throw RangeError('Unknown Coptic dialect');dialect=value;select.value=value;refresh();},
    setLearned(value){usage=value||{};refresh();},
    refresh,
    destroy(){
      if(disposed)return;
      disposed=true;element.removeEventListener('click',onClick);
      select.removeEventListener('change',onDialect);
      for(const event of ['input','click','keyup'])target.removeEventListener(event,onSelect);
      element.remove();
    }
  };
}
