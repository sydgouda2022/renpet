import {createBackup,parseBackup} from './backup-core.mjs';
import {readRecord,writeRecords,writeRecord} from './storage.js';
import {emptyState,validateSchedulerData,createItem,upsertItem,removeItem,ensureSavedItemVisible,occursOn} from './scheduler.js';
import {exportICS,eventUID} from './ics-core.mjs';
import {parseICS} from './ics-import.mjs';
import {dayNumber} from './calendar.js';
import {syncModalFocus} from './dialog-focus.mjs';

const WORDS={
 ar:{title:'بيانات رنبت',info:'كل المواعيد والإعدادات محفوظة على جهازك فقط.',export:'تصدير نسخة محلية',restore:'استعادة نسخة',ics:'تصدير تقويم ICS',importICS:'استيراد ICS',close:'إغلاق',confirm:'استعادة النسخة ستستبدل المواعيد والإعدادات الحالية. هل تريد المتابعة؟',done:'تم حفظ البيانات. سيعاد تشغيل رنبت.'},
 cop:{title:'Ⲣⲉⲛⲡⲉⲧ · ⲇⲉⲇⲟⲙⲉⲛⲁ',info:'Ⲛⲓⲇⲉⲇⲟⲙⲉⲛⲁ ϧⲉⲛ ⲡⲉⲕⲥⲱⲙⲁ.',export:'Ⲥⲱⲧⲡ ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ',restore:'Ⲧⲁϩⲟ ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ',ics:'ICS ↓',importICS:'ICS ↑',close:'Ϣⲧⲁⲙ',confirm:'Ⲧⲁϩⲟ ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ?',done:'Ⲁⲩⲧⲁϩⲟ ⲛ̀ⲛⲓⲇⲉⲇⲟⲙⲉⲛⲁ.'},
 egy:{title:'𓆳𓏏𓏤 · 𓏞',info:'𓏞 𓆳𓏏 𓉐𓏤',export:'𓏞 ↓',restore:'𓏞 ↑',ics:'ICS ↓',importICS:'ICS ↑',close:'𓐍𓏏𓅓',confirm:'𓏞 ↑ ?',done:'𓏞 ✓'}
};
let overlay=null,previousFocus=null;
const language=()=>WORDS[document.body.dataset.language]||WORDS.ar;
const stamp=()=>new Date().toISOString().slice(0,10);
function download(text,filename,mime='application/json;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([text],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=filename;
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function close(){
 if(!overlay)return;
 overlay.remove();overlay=null;
 if(previousFocus?.isConnected)previousFocus.focus();
 syncModalFocus();
}
async function records(){
 const [scheduler,preferences]=await Promise.all([readRecord('scheduler'),readRecord('preferences')]);
 return {scheduler:scheduler??emptyState(),preferences:preferences??{language:'ar',gregorian:true,festivalSources:null,weeks:{},reminders:false}};
}
async function backup(){
 download(createBackup(await records()),'renpet-'+stamp()+'.json');
}
async function restore(){
 const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';
 picker.addEventListener('change',async()=>{
  const file=picker.files?.[0];if(!file)return;
  try{
   if(file.size>5*1024*1024)throw Error('File is too large');
   const parsed=parseBackup(await file.text());
   if(!confirm(language().confirm))return;
   await writeRecords(parsed);
   alert(language().done);location.reload();
  }catch(error){alert(error.message);}
 },{once:true});
 picker.click();
}
async function exportCalendar(){
 const state=(await records()).scheduler;
 const result=exportICS(state,occursOn);
 if(!result.count)throw Error('No events to export');
 download(result.text,'renpet-'+stamp()+'.ics','text/calendar;charset=utf-8');
}
async function importCalendar(){
 const picker=document.createElement('input');picker.type='file';picker.accept='.ics,text/calendar';
 picker.addEventListener('change',async()=>{
  const file=picker.files?.[0];if(!file)return;
  try{
   if(file.size>5*1024*1024)throw Error('File is too large');
   const r=await fetch('./data.json');if(!r.ok)throw Error('Calendar boundaries unavailable');
   const limits=await r.json(),state=(await records()).scheduler;
   const result=parseICS(await file.text(),{
    minDay:dayNumber(limits.min_date),maxDay:dayNumber(limits.max_date),
    knownUIDs:state.items.flatMap(item=>[item.importUID,eventUID(item)]).filter(Boolean),
    knownSeriesIds:state.items.map(item=>item.id)
   });
   const cancellations=result.cancellations.filter(uid=>state.items.some(item=>item.importUID===uid));
   if(!result.imported&&!cancellations.length){alert('No supported events found');return;}
   if(!confirm(language().confirm))return;
   for(const uid of cancellations)for(const item of state.items.filter(item=>item.importUID===uid))removeItem(state,item.id);
   for(const source of result.items){
    const item={...createItem({...source,kind:'event',calendarId:'personal'}),importUID:source.importUID,excludedDays:source.excludedDays??[]};
    ensureSavedItemVisible(state,item);upsertItem(state,item);
   }
   if(!validateSchedulerData(state))throw Error('Calendar import includes unsupported events');
   await writeRecord('scheduler',state);
   alert(language().done);location.reload();
  }catch(error){alert(error.message);}
 },{once:true});
 picker.click();
}
export function openBackup(){
 if(overlay)return;
 previousFocus=document.activeElement;
 const t=language();
 overlay=document.createElement('div');overlay.className='renpet-backup-overlay';overlay.dir=document.documentElement.dir;
 overlay.innerHTML='<section class="renpet-backup-panel" role="dialog" aria-modal="true" aria-labelledby="renpet-backup-heading">'+
 '<div class="renpet-backup-head"><h2 id="renpet-backup-heading"></h2><button type="button" class="renpet-backup-close" data-backup="close">×</button></div>'+
 '<p class="renpet-backup-info"></p>'+
 '<button type="button" class="renpet-backup-action" data-backup="export"></button>'+
 '<button type="button" class="renpet-backup-action secondary" data-backup="ics"></button>'+
 '<button type="button" class="renpet-backup-action secondary" data-backup="import-ics"></button>'+
 '<button type="button" class="renpet-backup-action secondary" data-backup="import"></button></section>';
 overlay.querySelector('h2').textContent=t.title;
 overlay.querySelector('.renpet-backup-info').textContent=t.info;
 for(const [id,key] of [['close','close'],['export','export'],['ics','ics'],['import-ics','importICS'],['import','restore']])
  overlay.querySelector('[data-backup="'+id+'"]').textContent=id==='close'?'×':t[key];
 overlay.querySelector('[data-backup="close"]').setAttribute('aria-label',t.close);
 overlay.addEventListener('click',async event=>{
  if(event.target===overlay){close();return;}
  const action=event.target.closest('[data-backup]')?.dataset.backup;
  if(action==='close'){close();return;}
  try{
   if(action==='export')await backup();
   if(action==='import')await restore();
   if(action==='ics')await exportCalendar();
   if(action==='import-ics')await importCalendar();
  }catch(error){alert(error.message);}
 });
 document.body.append(overlay);
 syncModalFocus();
}
document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
