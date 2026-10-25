import {DAY,dayNumber,toEgyptian,toGregorian,monthGrid,nativeNumber} from './calendar.js';
import {layoutForViewport,isKeyboardDrivenResize} from './responsive-layout.js';
import {LOCALES} from './locales.js';
import {WORDS} from './ui-words.js';
import {SEASONS,seasonForMonth,seasonName,gregorianText} from './calendar-presentation.mjs';
import {AMUN_SOURCE,loadFestivalCatalog,enabledSourceIds,festivalHitsForDay,festivalSourceName} from './festival-catalog.js';
import {loadScheduler,saveScheduler,createItem,upsertItem,removeItem,itemsForDay,hiddenItemsForDay,ensureSavedItemVisible,revealSavedCalendars,searchItems,createCalendar,updateCalendar,removeCalendar,toggleCompleted,occurrenceStartForDay,excludeOccurrence} from './scheduler.js';
import {openBackup} from './backup.js';
import {initKeyboard,syncKeyboard,closeKeyboard,primeEgyptianLexicon,primeCopticLexicon} from './keyboard.js';
import {timeEditorFields,openTimeEditor,updateTimeChoice,closeTimeEditor} from './time-editor.js';
import {inputClock,timeText,timeHtml,localMinutes,nowLineTop} from './clock.js';
import {startForegroundAlerts,requestAlertPermission} from './alerts.js';

// Single owner of #app. No observers, shadow views, patched DOM or legacy year board.
// Responsive UI is a CSS-only rearrangement of the SAME DOM and state.
// No user-agent checks, manual GUI setting, reload, or forced render on resize.
// A focused native keyboard's same-width height loss is not a GUI switch.
let lastStableLayoutViewport=null;
function syncResponsiveLayout(){
 if(typeof window==='undefined')return; // Node's DOM smoke fixture.
 const width=window.innerWidth,height=window.innerHeight;
 const active=document.activeElement;
 // Only touch-capable input can expose an on-screen keyboard. A desktop
 // window resized vertically while typing must still follow the breakpoints.
 const softKeyboardPossible=window.matchMedia?.('(any-pointer: coarse)').matches??false;
 const editing=softKeyboardPossible&&Boolean(active?.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable="true"]'));
 if(isKeyboardDrivenResize(lastStableLayoutViewport,width,height,editing))return;
 document.documentElement.dataset.renpetLayout=layoutForViewport(width,height);
 lastStableLayoutViewport={width,height};
}
if(typeof window!=='undefined'){
 syncResponsiveLayout();
 window.addEventListener('resize',syncResponsiveLayout,{passive:true});
 window.addEventListener('orientationchange',syncResponsiveLayout,{passive:true});
}


const root=document.querySelector('#app'), SETTINGS='renpet.settings.v1';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return dayNumber([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'));};
let schedule=loadScheduler();
let previousRenderKey=null;
let currentTimeTicker=null;
let data=null,festivalCatalog={sources:[]},prefs={language:'ar',gregorian:true,festivalSources:null,weeks:{}},state={view:'month',focus:today(),panel:null,search:false,query:'',dialog:null,festivalDetail:null,revealItemId:null,saveNotice:false};
try{const x=JSON.parse(localStorage.getItem(SETTINGS)||'null');if(x){if(LOCALES[x.language])prefs.language=x.language;if(typeof x.gregorian==='boolean')prefs.gregorian=x.gregorian;if(Array.isArray(x.festivalSources))prefs.festivalSources=x.festivalSources;else if(typeof x.festivals==='boolean')prefs.festivalSources=x.festivals?[AMUN_SOURCE]:[];if(x.weeks&&typeof x.weeks==='object')prefs.weeks=x.weeks;}}catch{}
// Month is always the opening screen; legacy saved view preference is ignored.
const lang=()=>prefs.language,T=()=>WORDS[lang()],N=n=>nativeNumber(n,lang());
const spoken=key=>lang()==='egy'?WORDS.ar[key]:T()[key];
const week=()=>[7,10].includes(prefs.weeks[lang()])?prefs.weeks[lang()]:(lang()==='ar'?7:10);
const min=()=>dayNumber(data.min_date),max=()=>dayNumber(data.max_date),clamp=d=>Math.min(max(),Math.max(min(),d));
const savePrefs=()=>{try{localStorage.setItem(SETTINGS,JSON.stringify(prefs));}catch{}};
const selectedFestivalIds=()=>enabledSourceIds(prefs.festivalSources,festivalCatalog);
const festivalsOn=day=>festivalHitsForDay(day,data.years,festivalCatalog,prefs.festivalSources);

const egy=d=>toEgyptian(d,data.years);
const monthName=m=>m===13?LOCALES[lang()].epagomenal:lang()==='egy'?('𓇹 '+N(m)):data.months[lang()][m-1];
// Use full-size native signs for short calendar numbers; numeral SVG assets
// compose large years and longer numbers into readable grouped signs.
const numHtml=n=>lang()==='egy'&&n>30&&(n<=333||(data?.years?.some(y=>y.year===n)))?'<img class="glyph" src="assets/numerals/'+n+'.svg" alt="'+safe(N(n))+'">':safe(N(n));
const greg=(d,opts={day:'numeric',month:'short'})=>gregorianText(d,lang(),opts);
const monthDays=e=>e.month===13?data.years.find(y=>y.year===e.year).days-360:30;
const monthStart=e=>toGregorian({year:e.year,month:e.month,day:1},data.years);
const yearStart=y=>dayNumber(data.years.find(v=>v.year===y).start);
const adjacent=(e,delta)=>{let m=e.month+delta,y=e.year;while(m>13){m-=13;y++;}while(m<1){m+=13;y--;}return data.years.some(v=>v.year===y)?{year:y,month:m,day:1}:null;};
const calName=c=>c.name?.[lang()]||c.name?.ar||c.id;
const items=d=>itemsForDay(schedule,d,data.years);
const icon=name=>{const p={back:'<path d="m15 5-7 7 7 7"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',settings:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',star:'<path d="m12 2 3 7 7 .5-5.5 5 1.5 7L12 18l-6 3.5 1.5-7L2 9.5 9 9Z"/>',check:'<path d="m4 12 5 5L20 6"/>'};return '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p[name]+'</svg>';};
function quickDeleteButton(item,extraClass=''){
 return '<button type="button" class="event-delete-action '+extraClass+'" data-quick-delete="'+safe(item.id)+'" aria-label="'+safe(T().delete)+' · '+safe(item.title)+'" title="'+safe(T().delete)+'">'+
 '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"/></svg></button>';
}
function eventRow(i,day=state.focus){
 const cal=schedule.calendars.find(c=>c.id===i.calendarId),color=/^#[0-9a-f]{6}$/i.test(cal?.color)?cal.color:'#187568';
 const clock=i.allDay?safe(T().allDay):timeHtml(i.startMinutes,lang());
 return '<div class="event-row-shell"><button class="event-row" data-edit="'+safe(i.id)+'" data-occurrence="'+day+'" style="--event:'+color+'"><span class="event-clock">'+clock+'</span><span class="event-copy"><strong>'+safe(i.title)+'</strong>'+(i.location?'<small>'+safe(i.location)+'</small>':'')+'</span>'+(i.kind==='reminder'?'<span class="reminder-box" data-complete="'+safe(i.id)+'">'+icon('check')+'</span>':'')+'</button>'+quickDeleteButton(i)+'</div>';
}
// Existing appointments in hidden calendars are never silently represented
// as "no events". Offer one action to show them all without losing data.
function hiddenCalendarNotice(day){
 const hidden=hiddenItemsForDay(schedule,day,data.years);
 if(!hidden.length)return '';
 const prefix=lang()==='ar'?'مواعيد محفوظة في تقاويم مخفية':lang()==='cop'?'Ⲛⲓⲉⲣⲅⲟⲛ':'𓏞';
 return '<div class="hidden-calendar-notice" role="status"><span>'+safe(prefix)+' · '+safe(N(hidden.length))+'</span><button type="button" data-show-all-calendars>'+safe(T().manage)+'</button></div>';
}
// Festival names, notes and interface controls follow the *active script*.
// Coptic and hieroglyphic fields are editorial language/script renderings;
// modern dates are never represented as ancient textual attestations.
const festivalText=(f,field)=>lang()==='ar'?(field==='title'?f.ar:f.description_ar||''):
 (field==='title'?f[lang()]||'':f['description_'+lang()]||'');
const FESTIVAL_UI={
 ar:{details:'تفاصيل العيد',close:'إغلاق',sources:'المصادر',ancient:'إسقاط سكندري حديث لتاريخ مصري قديم',dated:'تاريخ معتمد للسنة المذكورة فقط',annual:'مناسبة سنوية حديثة',orthodox:'تاريخ محسوب من الفصح القبطي',notice:'قائمة جزئية، والتواريخ القديمة ليست ثابتة ميلادياً عبر جميع العصور.',translation:'',sourceIntro:'اختر قوائم الأعياد التي تريد عرضها. يمكن اختيار أكثر من قائمة.',personalIntro:'مواعيدك وأعياد الميلاد التي تضيفها بنفسك تظل مستقلة عن هذه القوائم.'},
 cop:{details:'Ⲡⲓϣⲁⲓ',close:'Ϣⲑⲁⲙ',sources:'Ⲛⲓⲡⲏⲅⲏ',ancient:'Ⲟⲩⲙⲉⲧⲉⲣⲙⲏⲛⲓⲁ ⲛ̀ⲁⲗⲉⲝⲁⲛⲇⲣⲓⲛⲏ ⲛ̀ⲃⲉⲣⲓ',dated:'Ⲡⲓⲉϩⲟⲟⲩ ⲛ̀ⲧⲉ ⲡⲓⲣⲟⲙⲡⲓ ⲛ̀ⲟⲩⲱⲧ',annual:'Ⲡⲓⲙⲉⲩⲓ ⲛ̀ⲣⲟⲙⲡⲓ ⲛ̀ⲃⲉⲣⲓ',orthodox:'Ⲡⲓⲉϩⲟⲟⲩ ⲙ̀ⲫⲟⲣⲙⲏ ⲛ̀ⲧⲉ ⲡⲓⲡⲁⲥⲭⲁ',notice:'Ⲡⲓⲕⲁⲧⲁⲗⲟⲅⲟⲥ ⲙ̀ⲡⲉϥϫⲱⲕ ⲉ̀ⲃⲟⲗ. Ⲛⲓⲉϩⲟⲟⲩ ⲛ̀ⲁⲣⲭⲁⲓⲟⲥ ⲙ̀ⲡⲟⲩⲥⲙⲟⲛⲧ ⲉ̀ⲡⲓⲣⲟⲙⲡⲓ ⲛ̀ⲃⲉⲣⲓ.',translation:'Ⲡⲓⲉⲣⲙⲏⲛⲓⲁ ⲛ̀ⲃⲉⲣⲓ',sourceIntro:'Ⲥⲱⲧⲡ ⲛ̀ⲛⲓⲕⲁⲧⲁⲗⲟⲅⲟⲥ ⲛ̀ⲛⲓϣⲁⲓ. Ⲥⲱⲧⲡ ⲛ̀ⲟⲩⲙⲏϣ.',personalIntro:'Ⲛⲓⲉⲣⲅⲟⲛ ⲛ̀ⲧⲁⲕ ⲥⲉⲟⲩⲟⲛϧ ⲥⲁⲃⲟⲗ ⲛ̀ⲛⲓϣⲁⲓ.'},
 egy:{details:'𓎛𓃀𓎱',close:'𓐍𓏏𓅓',sources:'𓏞𓏤',ancient:'𓆳𓏺 𓏞𓏤 𓎛𓃀𓎱',dated:'𓆳𓏺 𓏺',annual:'𓎛𓃀𓎱 𓆳𓏺',orthodox:'𓆳𓏺 𓋹𓏤',notice:'𓏞𓏤 · 𓆳𓏺 · 𓎛𓃀𓎱',translation:'𓏞𓏤',sourceIntro:'𓎛𓃀𓎱 𓏞𓏤 𓏥',personalIntro:'𓏞𓏤 𓉐𓏤 𓎛𓃀𓎱'}
};
function festivalMarkup(events,day=state.focus){
 return events.map(f=>{
  const label=festivalText(f,'title');
  return '<button type="button" class="festival-in-agenda" data-festival-source="'+safe(f.sourceId)+'" data-festival-open="'+safe(f.id)+'" data-festival-day="'+day+'" aria-label="'+safe(label)+'"><span aria-hidden="true">✦</span><span class="festival-title"><strong lang="'+lang()+'">'+safe(label)+'</strong><small>'+safe(festivalSourceName({name:f.sourceName},lang()))+(f.duration>1?' · '+safe(N(f.duration))+' '+safe(T().day):'')+'</small></span><span aria-hidden="true">›</span></button>';
 }).join('');
}
function festivalDetails(){
 if(!state.festivalDetail)return '';
 const day=state.festivalDetail.day,f=festivalsOn(day).find(x=>x.id===state.festivalDetail.id);
 if(!f)return '';
 const ui=FESTIVAL_UI[lang()],title=festivalText(f,'title');
 const src=festivalCatalog.sources.find(x=>x.id===f.sourceId);
 const original=f.description_ar||'',scriptNote=festivalText(f,'description');
 // A historical Arabic research note often contains bare external URLs.
 // Present those only as safe, short links; never dump them inside prose.
 const note=lang()==='ar'?scriptNote.replace(/(^|\n)\s*المراجع\s*:[^\n]*/g,'').trim():scriptNote;
 const rule=f.calendarRule,type=rule==='dated'?ui.dated:rule==='egyptian-fixed'?ui.ancient:rule==='orthodox-easter'?ui.orthodox:ui.annual;
 const sources=[...new Set([f.sourceUrl,...(original.match(/https:\/\/[^\s|]+/g)||[])].filter(url=>{
  try{const u=new URL(url);return u.protocol==='https:'&&url.length<2048;}catch{return false;}
 }))].slice(0,8);
 return '<div class="festival-detail-overlay" data-close-festival-overlay><section class="festival-detail-sheet" role="dialog" aria-modal="true" aria-label="'+safe(ui.details)+'"><header><h2 lang="'+lang()+'">'+safe(title)+'</h2><button type="button" data-close-festival aria-label="'+safe(ui.close)+'">×</button></header><p class="festival-type" lang="'+lang()+'">'+safe(type)+'</p><p class="festival-when">'+safe(N(egy(day).day))+' '+safe(monthName(egy(day).month))+(prefs.gregorian?' · '+safe(greg(day,{day:'numeric',month:'long',year:'numeric'})):'')+'</p>'+(note?'<p class="festival-evidence" lang="'+lang()+'" dir="'+(lang()==='ar'?'rtl':'ltr')+'">'+safe(note)+'</p>':'<p>'+safe(ui.notice)+'</p>')+(ui.translation?'<p class="festival-translation-note" lang="'+lang()+'">'+safe(ui.translation)+'</p>':'')+'<h3 lang="'+lang()+'">'+safe(ui.sources)+' · '+safe(festivalSourceName(src||{name:f.sourceName},lang()))+'</h3>'+(sources.length?'<div class="festival-sources-links">'+sources.map((url,i)=>'<a href="'+safe(url)+'" target="_blank" rel="noopener noreferrer" lang="'+lang()+'" aria-label="'+safe(ui.sources)+' '+N(i+1)+'">'+safe(ui.sources)+' '+safe(N(i+1))+' ↗</a>').join('')+'</div>':'<p>'+safe(ui.notice)+'</p>')+'</section></div>';
}
function agenda(d){
 const a=items(d),festivals=festivalsOn(d);
 const festivalCards=festivalMarkup(festivals,d);
 return '<section class="agenda"><div class="agenda-heading"><h3>'+numHtml(egy(d).day)+' '+safe(monthName(egy(d).month))+'</h3>'+(prefs.gregorian?'<span class="subtle">'+safe(greg(d,{weekday:'short',day:'numeric',month:'short'}))+'</span>':'')+'</div>'+hiddenCalendarNotice(d)+festivalCards+(a.length?a.map(i=>eventRow(i,d)).join(''):festivals.length?'':hiddenItemsForDay(schedule,d,data.years).length?'':'<div class="agenda-empty"><p>'+safe(T().noEvents)+'</p>'+'</div>')+'</section>';
}
// A compact, genuine hieroglyphic date group: ten-signs above units arranged
// in at most three columns, never a wrapped string or Latin replacement.
function monthNumber(n){
 if(lang()!=='egy')return numHtml(n);
 const tens=Math.floor(n/10),units=n%10;
 return '<span class="egy-day-ink" aria-hidden="true">'+
  (tens?'<span class="egy-date-tens">'+ '𓎆'.repeat(tens)+'</span>':'')+
  (units?'<span class="egy-date-ones">'+Array.from({length:units},()=>'<span>𓏺</span>').join('')+'</span>':'')+'</span>';
}
function dateButton(c){
 if(!c)return '<span class="blank" aria-hidden="true"></span>';
 const d=c.gregorian,ev=items(d),hits=festivalsOn(d);
 // Festival dates are always mapped to the underlying absolute day. Turning
 // off the Gregorian *labels* must never remove selected festival
 // festival markers, accessible names, or continued multi-day observances.
 const festivalNames=hits.map(f=>festivalText(f,'title'));
 const festivalSources=[...new Set(hits.map(f=>f.sourceId))].join(',');
 const dots=ev.slice(0,3).map(i=>{
  const col=schedule.calendars.find(x=>x.id===i.calendarId)?.color||'#176C59';
  return '<i style="background:'+( /^#[0-9a-f]{6}$/i.test(col)?col:'#176C59')+'"></i>';
 }).join('');
 return '<button class="date '+(d===state.focus?'chosen ':'')+(d===today()?'is-today ':'')+(hits.length?'has-festival':'')+'" data-date="'+d+'" data-festival-sources="'+safe(festivalSources)+'" data-festival-count="'+hits.length+'" title="'+safe(festivalNames.join(' · '))+'" aria-label="'+safe(monthName(egy(d).month))+' '+safe(N(c.day))+(ev.length?' · '+safe(N(ev.length))+' '+safe(T().event):'')+(festivalNames.length?' · '+safe(festivalNames.join(' · ')):'')+'" aria-pressed="'+(d===state.focus)+'"><span class="day-number">'+monthNumber(c.day)+'</span>'+(prefs.gregorian?'<small class="greg-day" lang="en">'+safe(greg(d,{day:'numeric'}))+'</small>':'')+'<span class="dots">'+dots+'</span>'+(ev.length>3?'<span class="date-more-count">+'+safe(N(ev.length-3))+'</span>':'')+(hits.length?'<em class="fest-mark" aria-label="'+safe(T().festivals)+'">✦</em>':'')+'</button>';
}
function monthSection(e){
 const w=week(),start=monthStart(e),length=monthDays(e);
 const secondary=prefs.gregorian?'<p class="subtle date-range">'+safe(greg(start,{day:'numeric',month:'short'}))+' – '+safe(greg(start+length-1,{day:'numeric',month:'short'}))+'</p>':'';
 if(w===10){
  const bands=Array.from({length:Math.ceil(length/10)},(_,i)=>{
   const offset=i*10,size=Math.min(10,length-offset);
   const dates=Array.from({length:size},(_,k)=>dateButton({day:offset+k+1,gregorian:start+offset+k})).join('');
   return '<div class="week-band renpet-decade" data-band="'+(i+1)+'"><div class="decade-days" style="--cols:10">'+dates+'</div></div>';
  }).join('');
  return '<section class="month-section ten-day" data-week="10">'+secondary+'<div class="decades week-bands">'+bands+'</div></section>';
 }
 const cells=monthGrid(e.year,e.month,7,data.years);
 const headers=Array.from({length:7},(_,i)=>LOCALES[lang()].shortWeekdays?.[i]||N(i+1));
 const bands=Array.from({length:cells.length/7},(_,i)=>'<div class="week-band" data-band="'+(i+1)+'"><div class="week-days" style="--cols:7">'+cells.slice(i*7,i*7+7).map(dateButton).join('')+'</div></div>').join('');
 return '<section class="month-section seven-day" data-week="7">'+secondary+'<div class="week-headers">'+headers.map(h=>'<span>'+safe(h)+'</span>').join('')+'</div><div class="week-bands">'+bands+'</div></section>';
}
function monthView(){
 const e=egy(state.focus);
 return '<div class="month-scroll">'+monthSection(e)+'<div class="month-agenda">'+agenda(state.focus)+'</div></div>';
}

function yearView(){
 const e=egy(state.focus),yr=e.year,w=week(),current=today();
 const currentDate=egy(current),currentSeason=seasonForMonth(currentDate.month);
 const monthCard=m=>{
  const start=monthStart({year:yr,month:m});
  const cells=monthGrid(yr,m,w,data.years);
  const body=cells.map(c=>{
   if(!c)return '<span class="year-mini-blank" aria-hidden="true"></span>';
   const isToday=c.gregorian===current,isSelected=c.gregorian===state.focus;
   const appointmentCount=items(c.gregorian).length,festivalCount=festivalsOn(c.gregorian).length;
    return '<span class="year-mini-day'+(isToday?' year-mini-today':'')+(isSelected&&!isToday?' year-mini-selected':'')+(appointmentCount?' has-appointments':'')+(festivalCount?' has-festivals':'')+'"'+(isToday?' aria-label="'+safe(T().today)+'"':'')+'>'+numHtml(c.day)+(appointmentCount?'<i class="year-mini-dot" aria-hidden="true"></i>':'')+(festivalCount?'<i class="year-mini-festival" aria-hidden="true"></i>':'')+'</span>';
  }).join('');
  return '<button class="year-month'+(m===e.month?' active-month':'')+'" data-open-month="'+m+'" aria-label="'+safe(monthName(m))+'"><span class="year-mini-title"><span class="year-month-name">'+safe(monthName(m))+'</span><span class="year-month-index">'+numHtml(m)+'</span></span><span class="year-mini-grid" data-week="'+w+'" aria-hidden="true">'+body+'</span></button>';
 };
 const groups=SEASONS.map((season,index)=>{
  const isCurrent=yr===currentDate.year&&season.id===currentSeason.id;
  return '<section class="year-season" data-season="'+season.id+'" data-current-season="'+isCurrent+'"><h2 class="season-heading"><span class="season-plant" aria-hidden="true"></span><span>'+safe(seasonName(season,lang()))+'</span>'+(isCurrent?'<small class="season-current"><i aria-hidden="true"></i>'+safe(T().today)+'</small>':'')+'</h2><div class="year-months">'+Array.from({length:4},(_,i)=>monthCard(index*4+i+1)).join('')+'</div></section>';
 }).join('');
 const days=monthDays({year:yr,month:13});
 const epStart=monthStart({year:yr,month:13});
 const mini=Array.from({length:days},(_,i)=>'<span class="year-mini-day'+(epStart+i===current?' year-mini-today':'')+'">'+numHtml(i+1)+'</span>').join('');
 return '<div class="year-overview">'+groups+'<button class="epagomenal-tile" data-open-month="13"><span>✦</span><strong>'+safe(LOCALES[lang()].epagomenal)+'</strong><span class="year-mini-epagomenal">'+mini+'</span></button></div>';
}
function dayView(){
 const daily=items(state.focus),all=daily.filter(i=>i.allDay);
 // A spanning event displays only the portion belonging to the selected day.
 // For repeated multi-day events, calculate the actual occurrence anchor first.
 const timed=daily.filter(i=>!i.allDay).map(i=>{
  const anchor=i.repeat==='none'?i.startDay:occurrenceStartForDay(i,state.focus,data.years)??i.startDay;
  const last=anchor+Math.max(0,(i.endDay??i.startDay)-i.startDay);
  return {...i,_dayStart:state.focus>anchor?0:i.startMinutes,_dayEnd:state.focus<last?1440:i.endMinutes};
 });
 const ordered=[...timed].sort((a,b)=>a._dayStart-b._dayStart||a._dayEnd-b._dayEnd);
 const clusters=[];let current=[],end=-1;
 for(const item of ordered){
  if(current.length&&item._dayStart>=end){clusters.push(current);current=[];end=-1;}
  current.push(item);end=Math.max(end,item.endMinutes||item.startMinutes+60);
 }
 if(current.length)clusters.push(current);
 const layout=new Map();
 for(const cluster of clusters){
  const ends=[];
  for(const item of cluster){
   let col=ends.findIndex(v=>v<=item._dayStart);
   if(col<0){col=ends.length;ends.push(-1);}
   ends[col]=Math.max(item._dayEnd||item._dayStart+60,item._dayStart+15);
   layout.set(item.id,{col,cols:0});
  }
  for(const item of cluster)layout.get(item.id).cols=ends.length;
 }
 const blocks=timed.map(i=>{
  const start=Math.max(0,Math.min(1439,i._dayStart||0)),end=Math.max(start+15,Math.min(1440,i._dayEnd??start+60));
  const cal=schedule.calendars.find(c=>c.id===i.calendarId);
  const color=/^#[0-9a-f]{6}$/i.test(cal?.color)?cal.color:'#187568';
  const pos=layout.get(i.id)||{col:0,cols:1},width=100/pos.cols;
  const resizable=i.repeat==='none'&&i.startDay===i.endDay;
  return '<div class="timeline-event" role="group" data-occurrence="'+state.focus+'" style="--event:'+color+';top:'+(start/60*64)+'px;height:'+Math.max(46,(end-start)/60*64-3)+'px;left:calc('+width*pos.col+'% + 1px);width:calc('+width+'% - 3px)" data-edit="'+safe(i.id)+'"><span class="event-drag" role="button" tabindex="0" aria-label="'+safe(i.title)+'"><strong>'+safe(i.title)+'</strong><small>'+timeHtml(start,lang())+' – '+timeHtml(end,lang())+'</small></span>'+quickDeleteButton(i,'event-delete-timeline')+(resizable?'<button type="button" class="event-resize" aria-label="'+safe(T().end)+' · '+safe(i.title)+'" title="'+safe(T().end)+'"><span aria-hidden="true"></span></button>':'')+'</div>';
 }).join('');
 const hours=Array.from({length:24},(_,h)=>'<div class="timeline-hour"><span>'+timeHtml(h*60,lang())+'</span><button class="timeline-slot" data-hour="'+h+'" aria-label="'+safe(T().add)+' '+safe(timeText(h*60,lang()))+'"></button></div>').join('');
 return '<div class="day-page"><div class="day-heading">'+numHtml(egy(state.focus).day)+' '+safe(monthName(egy(state.focus).month))+(prefs.gregorian?'<small>'+safe(greg(state.focus,{weekday:'long',day:'numeric',month:'long'}))+'</small>':'')+'</div>'+hiddenCalendarNotice(state.focus)+(festivalsOn(state.focus).length?'<section class="day-festivals" aria-label="'+safe(T().festivals)+'">'+festivalMarkup(festivalsOn(state.focus),state.focus)+'</section>':'')+(all.length?'<div class="all-day">'+all.map(i=>eventRow(i)).join('')+'</div>':'')+'<div class="timeline"><div class="timeline-hours">'+hours+'</div><div class="timeline-events">'+blocks+'</div>'+(state.focus===today()?nowLineMarkup():'')+'</div></div>';
}

function listView(){
 const groups=[];
 for(let d=state.focus;d<=Math.min(max(),state.focus+59);d++)if(items(d).length||festivalsOn(d).length)groups.push(agenda(d));
 const hiddenStart=state.focus,hiddenEnd=Math.min(max(),state.focus+59);
 const hiddenDays=[];
 if(!groups.length){
  for(let d=hiddenStart;d<=hiddenEnd;d++)if(hiddenItemsForDay(schedule,d,data.years).length){hiddenDays.push(d);break;}
 }
 return '<div class="list-page">'+(groups.length ? groups.join('') : hiddenDays.length
  ?hiddenCalendarNotice(hiddenDays[0])
  :'<div class="schedule-empty"><div class="empty-art" aria-hidden="true">▤</div><h2>'+safe(T().noUpcoming)+'</h2><p>'+safe(T().noEvents)+'</p><button class="primary" data-new>'+safe(T().addFirst)+'</button></div>')+'</div>';
}

function settingsView(){
 return '<section class="page preferences-page"><div class="settings-group"><label>'+safe(T().language)+'<select name="language">'+Object.entries(LOCALES).map(([id,v])=>'<option value="'+id+'" '+(id===lang()?'selected':'')+'>'+safe(v.name)+'</option>').join('')+'</select></label><label>'+safe(T().gregorian)+'<input type="checkbox" name="gregorian" '+(prefs.gregorian?'checked':'')+'></label><label>'+safe(T().weekLength)+'<select name="week">'+[7,10].map(n=>'<option value="'+n+'" '+(n===week()?'selected':'')+'>'+N(n)+'</option>').join('')+'</select></label></div><div class="settings-actions"><button data-open-panel="festivals">'+safe(T().festivals)+' <span>'+safe(N(selectedFestivalIds().length))+' / '+safe(N(festivalCatalog.sources.length))+' ›</span></button><button data-open-panel="calendars">'+safe(T().manage)+' <span>›</span></button><button data-backup>'+safe(T().dataAndBackup)+' <span>›</span></button></div><p class="build-label">'+safe(T().version)+' '+safe(data.version)+'</p></section>';
}
function festivalsView(){
 const options=festivalCatalog.sources.map(source=>{
  const checked=selectedFestivalIds().includes(source.id);
  const name=festivalSourceName(source,lang());
  const description=source.description?.[lang()]||source.description?.ar||'';
  return '<label class="festival-source-row"><input type="checkbox" data-festival-source-id="'+safe(source.id)+'" '+(checked?'checked':'')+'><span class="festival-source-info"><strong>'+safe(name)+'</strong><small>'+safe(N(source.events.length))+' · '+safe(T().festivals)+'</small>'+(description?'<small>'+safe(description)+'</small>':'')+'</span></label>';
 }).join('');
 return '<section class="page festival-source-page"><p class="festival-source-intro">'+safe(FESTIVAL_UI[lang()].sourceIntro)+'</p><div class="festival-source-options">'+options+'</div><p class="festival-source-personal">'+safe(FESTIVAL_UI[lang()].personalIntro)+'</p></section>';
}
function managerView(){
 const a=schedule;
 return '<section class="page"><h1>'+safe(T().calendars)+'</h1><div class="settings-group">'+a.calendars.map(c=>'<div class="cal-row"><input type="checkbox" data-visible="'+safe(c.id)+'" '+(c.visible!==false?'checked':'')+'><span class="color-dot" style="background:'+safe(c.color)+'"></span><span>'+safe(calName(c))+'</span>'+(c.custom?'<button data-remove-cal="'+safe(c.id)+'" aria-label="'+safe(spoken('delete'))+'">×</button>':'')+'</div>').join('')+'</div><form id="new-calendar" class="settings-group"><label>'+safe(T().newCalendar)+'<input name="name" required maxlength="80" placeholder="'+safe(T().name)+'"></label><label>'+safe(T().color)+'<input type="color" name="color" value="#187568"></label><button class="primary" type="submit">'+safe(T().add)+'</button></form></section>';
}

function nav(){
 // Month is the permanent default. Keep only meaningful shortcuts.
 const labels=[['today',T().today],['list',T().list]];
 const glyphs={today:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',list:'<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h1M3 12h1M3 18h1"/>'};
 return '<nav class="ux-bottom" aria-label="'+safe(T().view)+'">'+labels.map(([v,label])=>{
  const active=v==='list'&&state.view==='list';
  return '<button type="button" data-primary-view="'+v+'" class="ux-nav-item'+(active?' active':'')+'" aria-current="'+(active?'page':'false')+'"><svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+glyphs[v]+'</svg><span>'+safe(label)+'</span></button>';
 }).join('')+'</nav>';
}
function toolbar(){
 const e=egy(state.focus),year=state.view==='year',month=state.view==='month',isList=state.view==='list';
 const heading=year?numHtml(e.year):month?safe(monthName(e.month)):isList?safe(T().list):numHtml(e.day)+' '+safe(monthName(e.month));
 const yearButton=year?'<span class="year-brand">'+safe(LOCALES[lang()].brand)+'</span>':'<button class="year-shortcut" data-open-year aria-label="'+safe(LOCALES[lang()].year)+' '+safe(N(e.year))+'"><span class="year-shortcut-label">'+safe(LOCALES[lang()].year)+'</span><span class="year-shortcut-value">'+numHtml(e.year)+'</span></button>';
 const season=e.month===13?LOCALES[lang()].epagomenal:seasonName(seasonForMonth(e.month),lang());
 return '<header class="toolbar ux-toolbar"><div class="ux-toolbar-top"><div class="ux-back">'+(state.view==='day'?'<button data-back aria-label="'+safe(spoken('month'))+'">'+icon('back')+'<span>'+safe(T().month)+'</span></button>':yearButton)+'</div><div class="ux-toolbar-actions"><button data-search aria-label="'+safe(spoken('search'))+'" aria-expanded="'+state.search+'">'+icon('search')+'</button><button data-new aria-label="'+safe(spoken('add'))+'">'+icon('plus')+'</button><button data-open-panel="settings" aria-label="'+safe(spoken('settings'))+'">'+icon('settings')+'</button></div></div><div class="ux-toolbar-head"><div class="ux-heading"><h1>'+heading+'</h1>'+(year?'':'<p>'+safe(season)+'</p>')+'</div><div class="ux-heading-actions"><div class="ux-period-controls"><button data-prev aria-label="'+safe(spoken('previous'))+'">‹</button><button data-next aria-label="'+safe(spoken('next'))+'">›</button></div></div></div>'+(state.search?'<div class="search-panel"><input type="search" name="query" value="'+safe(state.query)+'" placeholder="'+safe(T().search)+'" autocomplete="off"><div class="search-results">'+searchResults()+'</div></div>':'')+'</header>';
}

function searchResults(){return searchItems(schedule,state.query).slice(0,60).map(i=>'<button data-result="'+i.startDay+'"><strong>'+safe(i.title)+'</strong><small>'+safe(greg(i.startDay))+'</small></button>').join('')||'<p class="empty">'+safe(T().noEvents)+'</p>';}
function dateFields(d,prefix=''){
 const e=egy(d);
 const names=prefix?{year:'endEgyYear',month:'endEgyMonth',day:'endEgyDay'}:{year:'egyYear',month:'egyMonth',day:'egyDay'};
 const permitted=y=>{const start=dayNumber(y.start);return start<=max()&&start+y.days-1>=min();};
 return '<div class="date-fields" data-date-prefix="'+prefix+'"><select name="'+names.year+'" aria-label="'+safe(LOCALES[lang()].year)+'" required>'+
 data.years.filter(permitted).map(y=>'<option value="'+y.year+'" '+(y.year===e.year?'selected':'')+'>'+safe(N(y.year))+'</option>').join('')+
 '</select><select name="'+names.month+'">'+Array.from({length:13},(_,i)=>'<option value="'+(i+1)+'" '+(e.month===i+1?'selected':'')+'>'+safe(monthName(i+1))+'</option>').join('')+
 '</select><select name="'+names.day+'">'+Array.from({length:monthDays(e)},(_,i)=>'<option value="'+(i+1)+'" '+(e.day===i+1?'selected':'')+'>'+safe(N(i+1))+'</option>').join('')+
 '</select></div><small class="date-preview" data-date-prefix="'+prefix+'">'+safe(greg(d,{day:'numeric',month:'long',year:'numeric'}))+'</small>';
}
function fillEditorDate(form,prefix,day){
 const date=egy(clamp(day)),ending=prefix==='end';
 const ys=form.elements.namedItem(ending?'endEgyYear':'egyYear');
 const ms=form.elements.namedItem(ending?'endEgyMonth':'egyMonth');
 const ds=form.elements.namedItem(ending?'endEgyDay':'egyDay');
 if(!ys||!ms||!ds)return;
 ys.value=String(date.year);ms.value=String(date.month);
 ds.innerHTML=Array.from({length:monthDays(date)},(_,i)=>'<option value="'+(i+1)+'">'+safe(N(i+1))+'</option>').join('');
 ds.value=String(date.day);
 const preview=form.querySelector('.date-preview[data-date-prefix="'+prefix+'"]');
 if(preview)preview.textContent=greg(clamp(day),{day:'numeric',month:'long',year:'numeric'});
}
function nowLineMarkup(date=new Date()){
 const minute=Math.floor(localMinutes(date));
 return '<div class="timeline-now" data-now-line style="top:'+nowLineTop(date)+'px" role="img" aria-label="'+safe(timeText(minute,lang()))+'"><span class="timeline-now-clock" data-now-clock>'+timeHtml(minute,lang())+'</span><span class="timeline-now-rule" aria-hidden="true"></span></div>';
}
function syncCurrentTimeLine(){
 const line=root.querySelector('[data-now-line]');
 if(!line)return;
 if(state.view!=='day'||state.focus!==today()){line.remove();if(currentTimeTicker!==null){clearInterval(currentTimeTicker);currentTimeTicker=null;}return;}
 const now=new Date(),minute=Math.floor(localMinutes(now));
 line.style.top=nowLineTop(now)+'px';
 const label=line.querySelector('[data-now-clock]');
 if(label&&line.dataset.minute!==String(minute)){
  label.innerHTML=timeHtml(minute,lang());
  line.setAttribute('aria-label',timeText(minute,lang()));
  line.dataset.minute=String(minute);
 }
}
function maintainCurrentTimeLine(){
 if(currentTimeTicker!==null){clearInterval(currentTimeTicker);currentTimeTicker=null;}
 if(state.view==='day'&&state.focus===today()){
  syncCurrentTimeLine();
  currentTimeTicker=setInterval(syncCurrentTimeLine,10000);
 }
}
function editor(){
 const item=state.dialog?.id?schedule.items.find(i=>i.id===state.dialog.id):null,d=item?.startDay??state.focus,kind=item?.kind||state.dialog?.kind||'event';
 const sched=schedule;
 // Start near the user's current time; the old 9 AM default made an
 // afternoon appointment appear to vanish when Day auto-scrolled to now.
 const nowMinutes=localMinutes(new Date());
 const recommended=state.focus===today()?Math.min(1380,Math.ceil(nowMinutes/30)*30):540;
 const initialStart=item?.startMinutes??(state.dialog?.hour!==undefined?Number(state.dialog.hour)*60:recommended);
 const initialEnd=item?.endMinutes??Math.min(1440,initialStart+60);
 return '<div class="sheet-overlay"><form id="event-editor" class="sheet" role="dialog" aria-modal="true" data-original-start="'+d+'" data-original-end="'+(item?.endDay??d)+'" novalidate><div class="sheet-head"><button type="button" data-close>'+safe(T().cancel)+'</button><strong>'+safe(item?T().event:T().add)+'</strong><button class="save-button" type="submit">'+safe(T().save)+'</button></div><div class="sheet-body"><div class="kind-toggle"><label><input type="radio" name="kind" value="event" '+(kind==='event'?'checked':'')+'>'+safe(T().event)+'</label><label><input type="radio" name="kind" value="reminder" '+(kind==='reminder'?'checked':'')+'>'+safe(T().reminder)+'</label></div><label>'+safe(T().title)+'<input name="title" required maxlength="200" value="'+safe(item?.title||'')+'"></label><label>'+safe(T().date)+dateFields(d)+'</label><label>'+safe(T().end)+' · '+safe(T().date)+dateFields(item?.repeat!=='none'&&state.dialog?.occurrenceDay!==undefined?Math.min(max(),d+(item.endDay-item.startDay)):item?.endDay??d,'end')+'</label><label class="check-row">'+safe(T().allDay)+'<input type="checkbox" name="allDay" '+(item?.allDay?'checked':'')+'></label>'+timeEditorFields(lang(),initialStart,initialEnd,T().start,T().end)+(item&&item.repeat!=='none'?'<label class="repeat-scope">'+safe(lang()==='ar'?'نطاق تعديل التكرار':lang()==='cop'?'Ⲟⲩⲱⲧ ϩⲟⲟⲩ / ⲧⲏⲣⲟⲩ':'𓏺 / 𓏥')+'<select name="repeatScope"><option value="series">'+safe(lang()==='ar'?'السلسلة كاملة':'Entire series')+'</option><option value="one">'+safe(lang()==='ar'?'هذا الموعد فقط':'This occurrence only')+'</option></select></label>':'')+'<details class="advanced-fields" '+(item&&(item.location||item.notes||item.repeat!=='none'||item.alert!=='none'||item.calendarId!==sched.calendars[0].id)?'open':'')+'><summary>'+safe(T().moreOptions)+'</summary><label>'+safe(T().location)+'<input name="location" maxlength="300" value="'+safe(item?.location||'')+'"></label><label>'+safe(T().notes)+'<textarea name="notes" rows="3">'+safe(item?.notes||'')+'</textarea></label><label>'+safe(T().calendars)+'<select name="calendarId">'+sched.calendars.map(c=>'<option value="'+safe(c.id)+'" '+(c.id===(item?.calendarId||sched.calendars[0].id)?'selected':'')+'>'+safe(calName(c))+'</option>').join('')+'</select></label><label>'+safe(T().repeat)+'<select name="repeat">'+[['none',T().none],['daily',T().daily],['weekly',T().weekly],['egy10',T().decan],['egyMonthly',T().monthly],['egyYearly',T().yearly]].map(([v,n])=>'<option value="'+v+'" '+((item?.repeat||'none')===v?'selected':'')+'>'+safe(n)+'</option>').join('')+'</select></label><label>'+safe(T().alert)+'<select name="alert">'+[['none',T().none],['atTime','0'],['5min','5'],['15min','15'],['1hour','60'],['1day','1440']].map(([v,n])=>'<option value="'+v+'" '+((item?.alert||'none')===v?'selected':'')+'>'+safe(n)+'</option>').join('')+'</select><small class="alert-limit">'+safe(lang()==='ar'?'تعمل التنبيهات عند فتح رنبت؛ لا يمكن ضمان إشعارات بعد إغلاق التطبيق.':'Alerts work while Renpet is open; background notifications are not guaranteed.')+'</small></label></details>'+(item?'<button type="button" class="delete" data-delete="'+safe(item.id)+'">'+safe(T().delete)+'</button>':'')+'</div></form></div>';
}

function panelContent(){
 if(!state.panel)return '';
 const panels={settings:settingsView,calendars:managerView,festivals:festivalsView};
 const title={settings:T().settings,calendars:T().calendars,festivals:T().festivals};
 const body=panels[state.panel]?.();
 if(!body)return '';
 return '<div class="ux-panel-backdrop" data-dismiss-panel></div><section class="ux-panel" role="dialog" aria-modal="true" aria-label="'+safe(title[state.panel])+'"><div class="ux-panel-head"><strong>'+safe(title[state.panel])+'</strong></div><div class="ux-panel-body">'+body+'</div></section>';
}
function render(){
 if(!data)return;
 const viewKey=state.view;
 const oldMain=root.querySelector('#main-content');
 const keepScroll=viewKey===previousRenderKey?oldMain?.scrollTop:0;
 schedule=loadScheduler();
 document.documentElement.lang=LOCALES[lang()].html;
 document.documentElement.dir=lang()==='ar'?'rtl':'ltr';
 document.body.dataset.language=lang();
 document.body.dataset.season=seasonForMonth(egy(state.focus).month).id;
 document.body.dataset.view=state.view;
 const content=state.view==='year'?yearView():state.view==='day'?dayView():state.view==='list'?listView():monthView();
 const savedText=lang()==='ar'?'تم حفظ الموعد':lang()==='cop'?'Ⲁϥⲥⲱⲛϩ':'𓏞 ✓';
 root.innerHTML='<div class="app-shell"><div class="season-art" aria-hidden="true"><div class="season-frieze"></div><div class="season-edge season-edge-start"></div><div class="season-edge season-edge-end"></div><div class="season-garden"></div></div>'+toolbar()+'<main class="main-scroll" id="main-content">'+content+'</main>'+nav()+'</div>'
   +(state.saveNotice?'<div class="save-confirmation" role="status" aria-live="polite">✓ '+savedText+'</div>':'')
   +panelContent()+(state.dialog?editor():'')+festivalDetails();
 if(['cop','egy'].includes(lang())&&typeof document.createElement==='function'){
  root.querySelectorAll('input[type="text"],input[type="search"],textarea').forEach(el=>el.setAttribute('inputmode','none'));
 }
 const main=root.querySelector('#main-content');
 if(main&&keepScroll)main.scrollTop=keepScroll;
 if(state.view==='month'&&lang()==='egy'){
  const region=root.querySelector('.month-section'),selected=region?.querySelector('.date.chosen');
  if(region&&selected){
   const outer=region.getBoundingClientRect(),inner=selected.getBoundingClientRect();
   if(inner.top<outer.top||inner.bottom>outer.bottom){
    region.scrollTop+=inner.top-outer.top-(region.clientHeight-selected.clientHeight)/2;
   }
  }
 }
 if(main&&state.view==='day'&&state.revealItemId){
  // Explicitly reveal the event just saved; never let auto-scroll to
  // the current-time line hide a 09:00 appointment.
  const matching=[...root.querySelectorAll('.timeline-event[data-edit],.all-day .event-row[data-edit]')]
   .find(el=>el.dataset.edit===state.revealItemId);
  if(matching){
   const mainBounds=main.getBoundingClientRect(),itemBounds=matching.getBoundingClientRect();
   main.scrollTop+=itemBounds.top-mainBounds.top-Math.min(90,main.clientHeight*.2);
  }
  state.revealItemId=null;
 }else if(main&&viewKey!==previousRenderKey&&state.view==='day'&&state.focus===today()){
  const marker=root.querySelector('[data-now-line]');
  if(marker){const relativeY=marker.getBoundingClientRect().top-main.getBoundingClientRect().top;main.scrollTop+=Math.max(0,relativeY-main.clientHeight*.35);}
 }
 previousRenderKey=viewKey;
 maintainCurrentTimeLine();
}

function navigate(step){
 if(state.view==='year'){const y=egy(state.focus).year+step;if(data.years.some(v=>v.year===y))state.focus=yearStart(y);}
 else if(state.view==='day')state.focus+=step;
 else if(state.view==='list')state.focus+=step*30;
 else{const e=egy(state.focus),next=adjacent(e,step);if(next)state.focus=monthStart(next)+Math.min(e.day,monthDays(next))-1;}
 state.focus=clamp(state.focus);render();
}
function showEditorError(form,message){
 let el=form.querySelector('.event-error');
 if(!el){el=document.createElement('p');el.className='event-error';el.setAttribute('role','alert');form.querySelector('.sheet-head')?.after(el);}
 el.textContent=message;
}
function submitEvent(form){
 const f=new FormData(form),y=Number(f.get('egyYear')),m=Number(f.get('egyMonth')),d=Number(f.get('egyDay'));
 if(!data.years.some(x=>x.year===y)||m<1||m>13||d<1||d>monthDays({year:y,month:m})){showEditorError(form,lang()==='ar'?'التاريخ غير صحيح':lang()==='cop'?'Ⲡⲓⲉϩⲟⲟⲩ':'𓆳');return;}
 const startDay=toGregorian({year:y,month:m,day:d},data.years);
 const ey=Number(f.get('endEgyYear')),em=Number(f.get('endEgyMonth')),ed=Number(f.get('endEgyDay'));
 if(!data.years.some(x=>x.year===ey)||em<1||em>13||ed<1||ed>monthDays({year:ey,month:em})){
  showEditorError(form,lang()==='ar'?'تاريخ النهاية غير صحيح':lang()==='cop'?'Ⲑⲁⲏ':'𓆳');return;
 }
 const endDay=toGregorian({year:ey,month:em,day:ed},data.years);
 if(startDay<min()||endDay>max()||endDay<startDay){
  showEditorError(form,lang()==='ar'?'تاريخ النهاية يجب ألا يسبق البداية، ويجب أن يكون داخل نطاق التقويم':'Invalid end date');return;
 }
 const time=v=>{const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v));return v==='24:00'?1440:match?Number(match[1])*60+Number(match[2]):NaN;};
 const startMinutes=time(f.get('start')),endMinutes=time(f.get('end'));
 if(!Number.isFinite(startMinutes)||!Number.isFinite(endMinutes)||startMinutes>=1440||
   (!f.has('allDay')&&endDay===startDay&&endMinutes<=startMinutes)){
  showEditorError(form,lang()==='ar'?'وقت النهاية يجب أن يكون بعد البداية':lang()==='cop'?'Ⲁⲣⲭⲏ · Ⲑⲁⲏ':'𓄂 · 𓏏');return;
 }
 const title=String(f.get('title')||'').trim();
 if(!title){showEditorError(form,lang()==='ar'?'أدخل عنوان الموعد':lang()==='cop'?'Ⲣⲁⲛ':'𓂋𓈖');form.elements.namedItem('title')?.focus();return;}
 const vals={kind:f.get('kind'),title,startDay,endDay,startMinutes,endMinutes,allDay:f.has('allDay'),location:f.get('location'),notes:f.get('notes'),calendarId:f.get('calendarId'),repeat:f.get('repeat'),alert:f.get('alert')};
 const sched=loadScheduler(),existing=state.dialog?.id?sched.items.find(i=>i.id===state.dialog.id):null;
 let item;
 if(existing&&existing.repeat!=='none'&&f.get('repeatScope')==='one'){
  const occurrence=occurrenceStartForDay(existing,state.dialog?.occurrenceDay??existing.startDay,data.years);
  if(occurrence===null){showEditorError(form,'Occurrence is outside the series');return;}
  excludeOccurrence(existing,occurrence);
  item=createItem({...vals,repeat:'none'});
 }else item=existing?{...existing,...vals,updatedAt:new Date().toISOString()}:createItem(vals);
 ensureSavedItemVisible(sched,item);
 upsertItem(sched,item);
 if(!saveScheduler(sched)){
  showEditorError(form,lang()==='ar'?'تعذر حفظ الموعد على هذا الجهاز':lang()==='cop'?'Ⲥⲱⲛϩ: Ⲡⲁⲛⲥ':'𓏞: !');return;
 }
 // Read-after-write verification prevents false success on storage failures,
 // Safari private/ephemeral storage, or malformed preexisting data.
 const saved=loadScheduler();
 if(!saved.items.some(v=>v.id===item.id&&v.title===item.title) || !itemsForDay(saved,startDay,data.years).some(v=>v.id===item.id)){
  showEditorError(form,lang()==='ar'?'لم يتم تأكيد تخزين الموعد':lang()==='cop'?'Ⲥⲱⲛϩ: !':'𓏞: !');return;
 }
 closeKeyboard();state.dialog=null;state.focus=clamp(startDay);
 state.view='day';state.revealItemId=item.id;state.saveNotice=true;render();
}

root.addEventListener('click',ev=>{
 if(ev.target.closest('[data-close-festival]')||ev.target.matches?.('[data-close-festival-overlay]')){state.festivalDetail=null;render();return;}
 const festival=ev.target.closest('[data-festival-open]');
 if(festival){state.festivalDetail={id:festival.dataset.festivalOpen,day:Number(festival.dataset.festivalDay)};render();return;}
 if(ev.target.closest('[data-dismiss-panel]')){state.panel=null;render();return;}
 if(ev.target.classList?.contains('sheet-overlay')){
  const picker=root.querySelector('.time-picker-host:not([hidden])');
  if(picker){closeTimeEditor(root.querySelector('#event-editor'),false,lang());return;}
  closeKeyboard();state.dialog=null;render();return;
 }
 // Save from the header is always a one-tap action, even if the time
 // picker is currently open. Commit its selected hour/minute first.
 const saveButton=ev.target.closest('#event-editor .save-button');
 if(saveButton){
  ev.preventDefault();
  const form=saveButton.form;
  const pendingPicker=form?.querySelector('.time-picker-host:not([hidden])');
  if(pendingPicker)closeTimeEditor(form,true,lang());
  try{submitEvent(form);}catch(error){
   console.error('Renpet save exception',error);
   showEditorError(form,lang()==='ar'?'حدث خطأ أثناء حفظ الموعد':lang()==='cop'?'Ⲥⲱⲛϩ: !':'𓏞: !');
  }
  return;
 }
 // Time picker is an overlay within the event form. Touching its backdrop
 // cancels the picker and never accidentally commits a hidden selection.
 const openPicker=root.querySelector('.time-picker-host:not([hidden])');
 if(openPicker&&!openPicker.contains(ev.target)&&!ev.target.closest('[data-time-open]')){
  closeTimeEditor(root.querySelector('#event-editor'),false,lang());return;
 }
 const show=ev.target.closest('[data-show-all-calendars]');
 if(show){const sched=loadScheduler();revealSavedCalendars(sched);
  saveScheduler(sched);render();return;}
 const quickDelete=ev.target.closest('[data-quick-delete]');
 if(quickDelete){
  ev.preventDefault();
  const sched=loadScheduler(),item=sched.items.find(x=>x.id===quickDelete.dataset.quickDelete);
  if(!item)return;
  if(!confirm(item.repeat!=='none'?
   (lang()==='ar'?'حذف سلسلة المواعيد المتكررة كاملة؟':'Delete every occurrence in this series?'):
   T().confirm))return;
  removeItem(sched,item.id);
  if(!saveScheduler(sched)||loadScheduler().items.some(x=>x.id===item.id)){
   alert(lang()==='ar'?'تعذر حذف الموعد':lang()==='cop'?'Ⲃⲱⲗ: !':'𓏞: !');return;
  }
  state.saveNotice=false;state.dialog=null;render();return;
 }
 const complete=ev.target.closest('[data-complete]');
 if(complete){const sched=loadScheduler(),item=sched.items.find(i=>i.id===complete.dataset.complete);if(item){toggleCompleted(item,state.focus);saveScheduler(sched);render();}return;}
 // Timeline events are accessible divs, not buttons. Open them directly.
 const timelineEvent=ev.target.closest('.timeline-event[data-edit]');
 if(timelineEvent&&!ev.target.closest('.event-resize')){
  state.dialog={id:timelineEvent.dataset.edit,occurrenceDay:Number(timelineEvent.dataset.occurrence??state.focus)};
  render();return;
 }
 const b=ev.target.closest('button');if(!b||b.disabled)return;
 if(b.hasAttribute('data-time-open')){
  closeKeyboard();
  openTimeEditor(root.querySelector('#event-editor'),b.dataset.timeOpen,lang(),T().start,T().end);
  return;
 }
 if(b.hasAttribute('data-time-hour')||b.hasAttribute('data-time-minute')){
  const kind=b.hasAttribute('data-time-hour')?'hour':'minute';
  updateTimeChoice(root.querySelector('#event-editor'),kind,Number(b.getAttribute('data-time-'+kind)),lang());
  return;
 }
 if(b.hasAttribute('data-time-confirm')||b.hasAttribute('data-time-dismiss')){
  closeTimeEditor(root.querySelector('#event-editor'),b.hasAttribute('data-time-confirm'),lang());
  return;
 }
 if(b.hasAttribute('data-close-panel')){state.panel=null;render();return;}
 if(b.hasAttribute('data-close')){state.dialog=null;render();return;}
 if(b.hasAttribute('data-hour')){state.saveNotice=false;state.dialog={kind:'event',hour:Number(b.dataset.hour)};render();return;}
 if(b.hasAttribute('data-new')){state.saveNotice=false;state.dialog={kind:'event'};render();root.querySelector('[name="title"]')?.focus();return;}
 if(b.hasAttribute('data-edit')){state.dialog={id:b.dataset.edit,occurrenceDay:Number(b.dataset.occurrence??state.focus)};render();return;}
 if(b.hasAttribute('data-delete')){
  const v=loadScheduler(),item=v.items.find(x=>x.id===b.dataset.delete);
  if(!item)return;
  const one=item.repeat!=='none'&&root.querySelector('[name="repeatScope"]')?.value==='one';
  if(!confirm(one?(lang()==='ar'?'حذف هذا التكرار فقط؟':'Delete this occurrence only?'):(item.repeat!=='none'?
   (lang()==='ar'?'حذف سلسلة المواعيد المتكررة كاملة؟':'Delete the entire recurring series?'):
   T().confirm)))return;
  if(one){const anchor=occurrenceStartForDay(item,state.dialog?.occurrenceDay??item.startDay,data.years);
   if(anchor===null)return;excludeOccurrence(item,anchor);
  }else removeItem(v,item.id);
  if(!saveScheduler(v)){alert(lang()==='ar'?'تعذر حذف الموعد':'Could not delete appointment');return;}
  state.dialog=null;render();return;
 }
 if(b.hasAttribute('data-search')){state.search=!state.search;state.query='';render();if(state.search)root.querySelector('[name="query"]')?.focus();return;}
 if(b.hasAttribute('data-date')){
  state.saveNotice=false;
  // A day tap opens its timeline on every screen size.
  state.focus=clamp(Number(b.dataset.date));
  state.view='day';
  render();return;
 }
 if(b.hasAttribute('data-open-month')){
  const y=egy(state.focus).year,m=Number(b.dataset.openMonth);
  state.focus=clamp(monthStart({year:y,month:m})+Math.min(egy(state.focus).day,monthDays({year:y,month:m}))-1);
  state.view='month';render();return;
 }
 if(b.hasAttribute('data-open-year')){state.view='year';render();return;}
 if(b.hasAttribute('data-result')){state.focus=clamp(Number(b.dataset.result));state.view='day';state.search=false;render();return;}
 if(b.hasAttribute('data-prev')){navigate(-1);return;}
 if(b.hasAttribute('data-next')){navigate(1);return;}
 if(b.hasAttribute('data-back')){state.saveNotice=false;state.view='month';render();return;}
 if(b.hasAttribute('data-primary-view')){
  const v=b.dataset.primaryView;
  state.panel=null;state.search=false;
  if(v==='today'){state.focus=clamp(today());state.view='month';}
  else if(v==='list')state.view='list';
  render();return;
 }
 if(b.hasAttribute('data-open-panel')){
  if(['settings','calendars','festivals'].includes(b.dataset.openPanel)){state.panel=b.dataset.openPanel;render();}
  return;
 }
 if(b.hasAttribute('data-backup')){state.panel=null;render();openBackup();return;}
 if(b.hasAttribute('data-remove-cal')){const v=loadScheduler();removeCalendar(v,b.dataset.removeCal);saveScheduler(v);render();return;}
});

root.addEventListener('change',ev=>{
 const el=ev.target;
 if(el.name==='repeatScope'&&state.dialog?.id){
  const form=el.form,item=schedule.items.find(i=>i.id===state.dialog.id);
  if(item&&item.repeat!=='none'){
   const occurrence=occurrenceStartForDay(item,state.dialog?.occurrenceDay??item.startDay,data.years)??item.startDay;
   const anchor=el.value==='one'?occurrence:item.startDay;
   fillEditorDate(form,'',anchor);
   fillEditorDate(form,'end',anchor+Math.max(0,item.endDay-item.startDay));
   form.dataset.originalStart=String(anchor);form.dataset.originalEnd=String(anchor+Math.max(0,item.endDay-item.startDay));
   form.dataset.endDateTouched='';
  }
  return;
 }
 if(el.name==='alert'&&el.value!=='none'){requestAlertPermission();return;}
 if(el.name==='language'&&LOCALES[el.value])prefs.language=el.value;
 else if(el.name==='gregorian')prefs.gregorian=el.checked;
 else if(el.hasAttribute('data-festival-source-id')){
  const sourceId=el.dataset.festivalSourceId;
  const enabled=new Set(selectedFestivalIds());
  if(el.checked)enabled.add(sourceId);else enabled.delete(sourceId);
  prefs.festivalSources=[...enabled];savePrefs();render();return;
 }
 else if(el.name==='week')prefs.weeks[lang()]=Number(el.value);
 else if(el.hasAttribute('data-visible')){const s=loadScheduler();updateCalendar(s,el.dataset.visible,{visible:el.checked});saveScheduler(s);render();return;}
 else if(el.closest('#event-editor')&&['egyYear','egyMonth','egyDay','endEgyYear','endEgyMonth','endEgyDay'].includes(el.name)){
  const form=el.form,ending=el.name.startsWith('endEgy'),prefix=ending?'end':'';
  const ys=ending?'endEgyYear':'egyYear',ms=ending?'endEgyMonth':'egyMonth',ds=ending?'endEgyDay':'egyDay';
  const y=Number(form.elements.namedItem(ys).value),m=Number(form.elements.namedItem(ms).value),d=Number(form.elements.namedItem(ds).value);
  if(data.years.some(x=>x.year===y)&&m>=1&&m<=13&&el.name!==ds){
   const count=monthDays({year:y,month:m}),dayField=form.elements.namedItem(ds);
   const chosen=Math.min(Math.max(1,d),count);
   dayField.innerHTML=Array.from({length:count},(_,i)=>'<option value="'+(i+1)+'">'+safe(N(i+1))+'</option>').join('');
   dayField.value=String(chosen);
  }
  const preview=form.querySelector('.date-preview[data-date-prefix="'+prefix+'"]');
  if(preview){
   try{const day=Number(form.elements.namedItem(ds).value),value=toGregorian({year:y,month:m,day},data.years);
    preview.textContent=value>=min()&&value<=max()?greg(value,{day:'numeric',month:'long',year:'numeric'}):'—';
   }catch{preview.textContent='—';}
  }
  if(ending)form.dataset.endDateTouched='1';
  else if(form.dataset.endDateTouched!=='1'){
   // Default end date follows the chosen start, preserving an existing span
   // unless the user independently chooses an end date.
   try{
    const start=toGregorian({year:y,month:m,day:Number(form.elements.namedItem(ds).value)},data.years);
    const duration=Math.max(0,Number(form.dataset.originalEnd)-Number(form.dataset.originalStart));
    const next=egy(clamp(start+duration));
    const endYear=form.elements.namedItem('endEgyYear'),endMonth=form.elements.namedItem('endEgyMonth');
    const endDay=form.elements.namedItem('endEgyDay');
    endYear.value=String(next.year);endMonth.value=String(next.month);
    endDay.innerHTML=Array.from({length:monthDays(next)},(_,i)=>'<option value="'+(i+1)+'">'+safe(N(i+1))+'</option>').join('');
    endDay.value=String(next.day);
    const endPreview=form.querySelector('.date-preview[data-date-prefix="end"]');
    if(endPreview)endPreview.textContent=greg(clamp(start+duration),{day:'numeric',month:'long',year:'numeric'});
   }catch{}
  }
  return;
 }else return;
 savePrefs();render();syncKeyboard();
});
root.addEventListener('input',ev=>{if(ev.target.name==='query'){state.query=ev.target.value;const r=root.querySelector('.search-results');if(r)r.innerHTML=searchResults();}});
root.addEventListener('invalid',ev=>{
 if(ev.target.closest('#event-editor'))showEditorError(ev.target.form,lang()==='ar'?'أدخل عنوان الموعد':lang()==='cop'?'Ⲣⲁⲛ':'𓂋𓈖');
},true);
root.addEventListener('submit',ev=>{
 if(ev.target.id==='event-editor'){ev.preventDefault();try{submitEvent(ev.target);}catch(e){console.error('Renpet submit error',e);showEditorError(ev.target,lang()==='ar'?'تعذر حفظ الموعد':lang()==='cop'?'Ⲥⲱⲛϩ':'𓏞');}}
 if(ev.target.id==='new-calendar'){ev.preventDefault();const f=new FormData(ev.target),s=loadScheduler();if(createCalendar(s,f.get('name'),f.get('color'))){saveScheduler(s);render();}}
});
// One gesture owner: drag from event body to move; stretch bottom grip to
// resize in 15-minute increments. iOS pointer capture prevents the page swipe
// handler from stealing the gesture; regular scroll works outside events.
let activeDrag=null,suppressEditUntil=0;
const snap=n=>Math.round(n/15)*15;
root.addEventListener('pointerdown',ev=>{
 const block=ev.target.closest('.timeline-event[data-edit]');
 if(!block||ev.button!==0||ev.target.closest('.event-delete-action'))return;
 const item=loadScheduler().items.find(i=>i.id===block.dataset.edit);
 if(!item||item.allDay||item.repeat!=='none'||item.startDay!==item.endDay)return;
 const mode=ev.target.closest('.event-resize')?'resize':'move';
 const main=root.querySelector('#main-content');
 activeDrag={id:item.id,pointerId:ev.pointerId,mode,y:ev.clientY,scrollAtStart:main?.scrollTop||0,start:item.startMinutes,
  end:item.endMinutes||item.startMinutes+60,block,moved:false};
 try{block.setPointerCapture?.(ev.pointerId);}catch{}
});
root.addEventListener('pointermove',ev=>{
 const drag=activeDrag;if(!drag||ev.pointerId!==drag.pointerId)return;
 const main=root.querySelector('#main-content');
 if(main&&drag.moved){
  const bounds=main.getBoundingClientRect();
  if(ev.clientY>bounds.bottom-42)main.scrollTop+=16;
  else if(ev.clientY<bounds.top+42)main.scrollTop-=16;
 }
 const pixels=ev.clientY-drag.y+(main?.scrollTop||0)-drag.scrollAtStart;
 if(Math.abs(pixels)>6)drag.moved=true;
 if(!drag.moved)return;
 ev.preventDefault();
 const delta=snap(pixels/64*60);
 const duration=Math.max(15,drag.end-drag.start);
 const start=drag.mode==='move'?Math.max(0,Math.min(1440-duration,drag.start+delta)):drag.start;
 const end=drag.mode==='resize'?Math.max(start+15,Math.min(1440,drag.end+delta)):start+duration;
 drag.next={start,end};
 drag.block.style.top=(start/60*64)+'px';
 drag.block.style.height=Math.max(46,(end-start)/60*64-3)+'px';
 const label=drag.block.querySelector('.event-drag small');
 if(label)label.innerHTML=timeHtml(start,lang())+' – '+timeHtml(end,lang());
});
function finishDrag(ev,cancel=false){
 const drag=activeDrag;if(!drag||ev.pointerId!==drag.pointerId)return;
 activeDrag=null;
 if(!drag.moved||cancel){if(drag.moved)render();return;}
 suppressEditUntil=Date.now()+550;
 if(!drag.next){render();return;}
 const sched=loadScheduler(),item=sched.items.find(i=>i.id===drag.id);
 if(item){
  const previous={start:item.startMinutes,end:item.endMinutes};
  item.startMinutes=drag.next.start;item.endMinutes=drag.next.end;
  item.updatedAt=new Date().toISOString();
  if(!saveScheduler(sched)){
   item.startMinutes=previous.start;item.endMinutes=previous.end;
   alert(lang()==='ar'?'تعذر تعديل مدة الموعد':lang()==='cop'?'Ⲑⲁⲏ: !':'𓏞: !');
  }
 }
 render();
}
root.addEventListener('pointerup',ev=>finishDrag(ev));
root.addEventListener('pointercancel',ev=>finishDrag(ev,true));
root.addEventListener('lostpointercapture',ev=>finishDrag(ev,true),true);
root.addEventListener('click',ev=>{
 if(Date.now()<suppressEditUntil&&ev.target.closest('[data-edit]')){
  ev.stopImmediatePropagation();ev.preventDefault();
 }
},true);
root.addEventListener('keydown',ev=>{
 const edit=ev.target.closest('.event-drag[role=button]');
 if(edit&&(ev.key==='Enter'||ev.key===' ')){
  ev.preventDefault();state.dialog={id:edit.closest('[data-edit]').dataset.edit};render();
 }
});
document.addEventListener('click',ev=>{
 // Single click-away convention for inline search; dialogs and keyboard
 // have their own backdrops and should not conflict with this handler.
 if(state.search&&!ev.target.closest('.search-panel')&&!ev.target.closest('[data-search]')&&!ev.target.closest('.renpet-keyboard')){
  state.search=false;state.query='';render();
 }
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCurrentTimeLine();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if(state.festivalDetail)state.festivalDetail=null;else if(state.dialog)state.dialog=null;else if(state.panel)state.panel=null;else if(state.search)state.search=false;render();}});
let gesture=null;
root.addEventListener('touchstart',ev=>{
 if(ev.touches.length!==1||state.dialog||state.panel)return;
 gesture={x:ev.touches[0].clientX,y:ev.touches[0].clientY};
},{passive:true});
root.addEventListener('touchend',ev=>{
 if(!gesture||!ev.changedTouches.length)return;
 const dx=ev.changedTouches[0].clientX-gesture.x,dy=ev.changedTouches[0].clientY-gesture.y;
 gesture=null;
 if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5){
  navigate((document.documentElement.dir==='rtl'?1:-1)*(dx>0?1:-1));
 }
},{passive:true});
async function init(){
 try{const r=await fetch('./data.json');if(!r.ok)throw Error('Calendar data unavailable');data=await r.json();festivalCatalog=await loadFestivalCatalog(data);
 // Migrate retired festival source IDs out of stored preferences. This never
 // changes the user's appointments or any still-supported festival choices.
 const previousFestivalSources=prefs.festivalSources;
 prefs.festivalSources=selectedFestivalIds();
 if(Array.isArray(previousFestivalSources)&&
    (previousFestivalSources.length!==prefs.festivalSources.length||
     previousFestivalSources.some((id,i)=>id!==prefs.festivalSources[i])))savePrefs();
 state.focus=clamp(state.focus);render();globalThis.RenpetBoot?.ready();if(typeof document.createElement==='function')initKeyboard(()=>lang());startForegroundAlerts(()=>loadScheduler(),()=>data?.years);void Promise.allSettled([primeEgyptianLexicon(),primeCopticLexicon()]);
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(console.warn);}
 }catch(e){root.textContent='Renpet: '+e.message;console.error(e);globalThis.RenpetBoot?.fail(e.message);}
}
init();

