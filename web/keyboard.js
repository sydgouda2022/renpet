import {COPTIC_LETTERS,COP_NUMBERS,EGY_NUMBERS,wordRange,suggestions,deleteGrapheme} from './keyboard-core.js';
import {ensureLexicon} from './lexicon-install.mjs';
import {ensureCopticLexicon} from './coptic-install.mjs';

const STORAGE='renpet.keyboard.personal.v1';
const DIALECT_STORAGE='renpet.keyboard.coptic-dialect.v1';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalog={cop:null,egy:null};
let active=null,keyboard=null,locale=()=>document.body.dataset.language,tab='uni',upper=false,personal={};
let copticDialect='all';
try{const value=localStorage.getItem(DIALECT_STORAGE);if(['all','sahidic','bohairic'].includes(value))copticDialect=value;}catch{}
try{personal=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch{personal={};}

const eligible=el=>(el instanceof HTMLTextAreaElement)||(el instanceof HTMLInputElement&&['text','search'].includes(el.type));
const keyboardLanguage=()=>{const x=locale();return x==='cop'||x==='egy'?x:null;};
function persist(){
 try{localStorage.setItem(STORAGE,JSON.stringify(Object.fromEntries(Object.entries(personal).sort((a,b)=>b[1]-a[1]).slice(0,1500))));}catch{}
}
function contextPrevious(){
 const lang=keyboardLanguage();if(!active||!lang)return '';
 const before=active.value.slice(0,current().start).trimEnd();
 const word=before.match(lang==='cop'?/[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+$/u:/[\u{13000}-\u{1345f}\u{13460}-\u{143ff}]+$/u);
 return word?.[0]||'';
}
function remember(text){
 if(!text)return;
 const lang=keyboardLanguage();if(!lang)return;
 const previous=contextPrevious();
 const k=lang+':'+text;personal[k]=(personal[k]||0)+1;
 if(previous){
  const ctx='ctx:'+lang+':'+previous+':'+text;
  personal[ctx]=(personal[ctx]||0)+1;
 }
 persist();
}
async function load(lang){
 if(catalog[lang]?.lexiconReady)return;
 if(lang==='cop'){
  // Shared first-run installer. This releases Scriptorium/KELLIA-written forms
  // with original Sahidic/Bohairic masks; unknown dialect stays unassigned.
  try{
   const installed=await ensureCopticLexicon();
   catalog.cop={
    rows:installed.payload.rows,
    popularity:installed.payload.popularity,
    lexiconReady:true,complete:installed.complete,
    lexiconError:null,release:installed.manifest.release
   };
  }catch(err){
   catalog.cop={rows:[],popularity:{},lexiconReady:false,lexiconError:String(err?.message||err)};
   console.warn('Coptic lexicon unavailable:',err);
  }
 }else if(lang==='egy'){
  if(!catalog.egy?.pages){
   try{
    const res=await fetch('./assets/dictionaries/signs.json');
    if(!res.ok)throw Error('Hieroglyphic signs unavailable: '+res.status);
    catalog.egy=await res.json();
   }catch(err){
    console.warn('Hieroglyphic keyboard signs unavailable:',err);
    catalog.egy={rows:[],pages:{uni:[],bi:[],tri:[]}};
   }
  }
  try{
   const installed=await ensureLexicon();
   catalog.egy.entries=installed.payload.entries;
   catalog.egy.rows=installed.payload.entries.map(e=>[e.signs,e.attestations||1,e.lemma||e.ref,e.ref]);
   catalog.egy.source=installed.manifest.release;
   catalog.egy.complete=installed.complete;
   catalog.egy.lexiconReady=true;
   catalog.egy.lexiconError=null;
  }catch(err){
   catalog.egy.rows=[];
   catalog.egy.lexiconReady=false;
   catalog.egy.lexiconError=String(err?.message||err);
   console.warn('Late Egyptian lexicon unavailable:',err);
  }
 }
 if(active&&keyboardLanguage()===lang)draw();
}
function pageButtons(lang){
 if(lang!=='egy')return '';
 return '<div class="kb-tabs" role="tablist" aria-label="Hieroglyphic sign classes">'+[
  ['uni','𓄿','Uniliterals'],['bi','𓉐','Biliterals'],['tri','𓆣','Triliterals']
 ].map(([p,icon,label])=>'<button type="button" role="tab" aria-selected="'+(tab===p)+'" class="'+(p===tab?'selected':'')+'" data-kb-tab="'+p+'" aria-label="'+label+'"><span>'+icon+'</span><small>'+(p==='uni'?'𓏺':p==='bi'?'𓏺𓏺':'𓏺𓏺𓏺')+'</small></button>').join('')+'</div>';
}
function numberButtons(lang){
 const values=lang==='cop'?COP_NUMBERS:EGY_NUMBERS;
 return '<div class="kb-numbers" aria-label="Number signs">'+values.map(n=>'<button type="button" class="kb-num" data-kb-insert="'+escape(n.text)+'" title="'+n.value+'" aria-label="'+n.value+'">'+n.text+'</button>').join('')+'</div>';
}
function keys(lang){
 const options=lang==='cop'?COPTIC_LETTERS.map(ch=>[upper?ch.toLocaleUpperCase():ch,'']):(catalog.egy?.pages?.[tab]||[]);
 // Each sign key shows the actual Unicode sign. Gardiner IDs are available as tooltips,
 // not transliteration prompts or invented lexical equivalences.
 return '<div class="kb-signs '+(lang==='egy'?'kb-hiero':'kb-coptic')+'">'+options.map(([x,y])=>'<button type="button" class="kb-sign" data-kb-insert="'+escape(x)+'" aria-label="'+escape(y||x)+'" title="'+escape(y||x)+'">'+x+'</button>').join('')+'</div>';
}
function current(){
 if(!active||!active.isConnected)return {raw:'',start:0,end:0};
 return wordRange(active.value,active.selectionStart??active.value.length,keyboardLanguage());
}
function predictBar(lang){
 const raw=current().raw;
 const options=suggestions(raw,lang,catalog[lang],personal,4,{dialect:copticDialect,previous:contextPrevious()});
 if(!options.length)return '<div class="kb-suggestions kb-quiet" role="status"><span> '+(lang==='cop'?(catalog.cop?.lexiconError?'Coptic · connect to install':catalog.cop?.lexiconReady?'Ⲥⲁϩⲓⲇⲓⲕⲏ · Ⲃⲟϩⲁⲓⲣⲓⲕⲏ':'Coptic · loading'):catalog.egy?.lexiconError?'Late Egyptian · connect to install':catalog.egy?.lexiconReady?'Late Egyptian · corpus lexicon':'Late Egyptian · loading')+' </span></div>';
 return '<div class="kb-suggestions" role="listbox" aria-label="Prediction candidates">'+options.map((o,i)=>{
  const dialects=o.raw?'✓':o.personal?'★':o.dialects===3?'S+B':o.dialects===1?'S':o.dialects===2?'B':o.source==='RAMSES-CORPUS'?'RTC':o.source==='LATE'?'LE':o.source==='COP'?'Coptic':'';
  return '<button type="button" role="option" data-kb-pick="'+i+'" aria-selected="'+(i===0)+'"><span>'+escape(o.text)+'</span><small>'+dialects+'</small></button>';
 }).join('')+'</div>';
}
function draw(){
 if(!keyboard)return;
 const lang=keyboardLanguage();
 if(!active||!active.isConnected||!lang){hide();return;}
 keyboard.hidden=false;
 document.body.classList.add('keyboard-open');
 const title=lang==='cop'?'Ⲥⲁϩⲓⲇⲓⲕⲏ · Ⲃⲟϩⲁⲓⲣⲓⲕⲏ':'𓄿 · 𓉐 · 𓆣';
 keyboard.setAttribute('aria-label',title);
 keyboard.innerHTML='<div class="kb-top"><span class="kb-name">'+title+'</span><button type="button" data-kb-done aria-label="Close keyboard">✓</button></div>'
  +(lang==='cop'?'<div class="kb-dialects" role="group" aria-label="Coptic dialect">'+[['all','Both'],['sahidic','Sahidic'],['bohairic','Bohairic']].map(([id,label])=>'<button type="button" data-kb-dialect="'+id+'" aria-pressed="'+(copticDialect===id)+'" class="'+(copticDialect===id?'selected':'')+'">'+label+'</button>').join('')+'</div>':'')
  +predictBar(lang)+pageButtons(lang)+numberButtons(lang)+keys(lang)
  +'<div class="kb-controls">'+(lang==='cop'?'<button type="button" data-kb-shift aria-pressed="'+upper+'">⇧</button>':'')
  +'<button type="button" data-kb-insert="،">،</button><button type="button" class="kb-space" data-kb-space>Space</button>'
  +'<button type="button" data-kb-back aria-label="Backspace">⌫</button></div>';
 // Leave form controls above the dock rather than obscuring them.
 requestAnimationFrame(()=>{if(active?.isConnected)active.scrollIntoView({block:'nearest',behavior:'instant'});});
}
function hide(){
 if(!keyboard)return;keyboard.hidden=true;
 document.body.classList.remove('keyboard-open');active=null;
}
function edit(text,range=null){
 if(!active||!active.isConnected){hide();return;}
 const st=range?.start??active.selectionStart??active.value.length;
 const end=range?.end??active.selectionEnd??st;
 active.setRangeText(text,st,end,'end');
 active.dispatchEvent(new Event('input',{bubbles:true}));
 const old=active;
 queueMicrotask(()=>{
  if(!old.isConnected){
   const candidate=old.name?document.querySelector('[name="'+CSS.escape(old.name)+'"]'):null;
   if(eligible(candidate))active=candidate;
  }
  if(active?.isConnected){active.focus({preventScroll:true});draw();}else hide();
 });
}
function click(ev){
 const btn=ev.target.closest('button');if(!btn||!keyboard.contains(btn))return;
 const lang=keyboardLanguage();if(!lang)return;
 if(btn.hasAttribute('data-kb-done')){active?.blur();hide();return;}
 if(btn.hasAttribute('data-kb-tab')){tab=btn.dataset.kbTab;draw();return;}
 if(btn.hasAttribute('data-kb-dialect')){
  const next=btn.dataset.kbDialect;
  if(['all','sahidic','bohairic'].includes(next)){
   copticDialect=next;
   try{localStorage.setItem(DIALECT_STORAGE,next);}catch{}
   draw();
  }
  return;
 }
 if(btn.hasAttribute('data-kb-shift')){upper=!upper;draw();return;}
 if(btn.hasAttribute('data-kb-back')){edit('',deleteGrapheme(active.value,active.selectionStart,active.selectionEnd));return;}
 if(btn.hasAttribute('data-kb-space')){remember(current().raw);edit(' ');return;}
 if(btn.hasAttribute('data-kb-pick')){
  const list=suggestions(current().raw,lang,catalog[lang],personal,4,{dialect:copticDialect,previous:contextPrevious()}),pick=list[Number(btn.dataset.kbPick)];
  if(!pick)return;
  remember(pick.text);
  const range=current();
  edit(pick.text+' ',{start:range.start,end:range.end});
  return;
 }
 if(btn.hasAttribute('data-kb-insert')){edit(btn.dataset.kbInsert);return;}
}
export function initKeyboard(getLanguage){
 if(keyboard||typeof document.createElement!=='function')return;
 locale=getLanguage;
 keyboard=document.createElement('section');
 keyboard.id='renpet-keyboard';
 keyboard.className='renpet-keyboard';
 keyboard.hidden=true;
 keyboard.setAttribute('role','group');
 document.body.appendChild(keyboard);
 // Dock pointer events cannot take focus away from the field being edited.
 keyboard.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
 keyboard.addEventListener('click',click);
 document.addEventListener('pointerdown',e=>{
  if(keyboardLanguage()&&eligible(e.target))e.target.setAttribute('inputmode','none');
 },true);
 document.addEventListener('focusin',e=>{
  const lang=keyboardLanguage();if(!lang||!eligible(e.target))return;
  active=e.target;
  active.setAttribute('inputmode','none');
  void load(lang);
  draw();
 });
 document.addEventListener('input',e=>{
  if(e.target===active)draw();
 });
 // Clicking outside dismisses the keyboard without losing the text field.
 // On iOS a second tap on that still-focused field does not fire focusin;
 // explicitly reopen on pointerup to preserve a natural editing workflow.
 document.addEventListener('pointerup',e=>{
  if(keyboard.hidden&&keyboardLanguage()&&eligible(e.target)){
   active=e.target;void load(keyboardLanguage());draw();
  }
 });
 // Changing the viewport on pointerdown can move the Save button before
 // iOS dispatches click/submit, silently losing taps. Dismiss only after click.
 document.addEventListener('click',e=>{
  // The Add/Edit click creates and focuses a new editor before this event
  // bubbles to document. Never immediately hide that newly opened keyboard.
  if(e.target.closest('[data-new],[data-edit],[data-hour]'))return;
  // Key input immediately rebuilds keyboard.innerHTML. The original key
  // may already be detached by the time click reaches document; the event's
  // composed path still reliably identifies it as an inside-keyboard tap.
  const keyboardTap=e.composedPath?.().includes(keyboard)||keyboard.contains(e.target);
  if(!keyboard.hidden&&!keyboardTap&&e.target!==active&&!eligible(e.target))hide();
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!keyboard.hidden)hide();
 });
}
// Leave space for the appointment time sheet rather than covering it.
export function closeKeyboard(){hide();}
export function syncKeyboard(){
 if(!keyboard)return;
 if(keyboardLanguage()==='ar'){hide();return;}
 if(active?.isConnected)draw();else hide();
}

// Startup preflight runs after calendar rendering: calendar use never waits for the dictionary.
export async function primeEgyptianLexicon(){await load('egy');return catalog.egy?.lexiconReady===true;}

// Coptic and hieroglyphic installation are independent and do not block the calendar.
export async function primeCopticLexicon(){await load('cop');return catalog.cop?.lexiconReady===true;}
