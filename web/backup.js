import { createBackup, parseBackup, restoreBackup } from './backup-core.mjs';
import { exportICS } from './ics-core.mjs';
import { parseICS } from './ics-import.mjs';
import { dayNumber } from './calendar.js';
import { occursOn, loadScheduler, saveScheduler, createItem, upsertItem, ensureSavedItemVisible, schedulerRecoveryStatus, restoreSchedulerSnapshot } from './scheduler.js';

// Backup and restore work entirely on the user's device. No account or upload.
const words = {
  ar: { trigger:'النسخ الاحتياطي', title:'بيانات رنبت', info:'احتفظ بنسخة من مواعيدك وتقاويمك وإعداداتك على جهازك. لا تُرسل أي بيانات إلى الإنترنت.', export:'تصدير نسخة', ics:'تصدير إلى Apple / Google Calendar', importICS:'استيراد ملف ICS', import:'استعادة نسخة', close:'إغلاق', confirm:'استعادة النسخة ستستبدل البيانات الموجودة من نفس النوع. هل تريد المتابعة؟', done:'تمت استعادة البيانات. سيُعاد تحميل رنبت.', empty:'لا توجد بيانات محفوظة للتصدير.', recover:'استعادة آخر نسخة تلقائية للمواعيد' },
  cop: { trigger:'Ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ', title:'Ⲣⲉⲛⲡⲉⲧ · ⲇⲉⲇⲟⲙⲉⲛⲁ', info:'Ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ ⲉ̀ⲡⲉⲕⲥⲱⲙⲁ. Ⲙ̀ⲙⲟⲛ ⲟⲩⲱⲣⲡ ⲉ̀ⲡⲓⲓⲛⲧⲉⲣⲛⲉⲧ.', export:'Ⲥⲱⲧⲡ ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ', ics:'ICS · Apple / Google Calendar', importICS:'ICS ↑', import:'Ⲧⲁϩⲟ ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ', close:'Ϣⲧⲁⲙ', confirm:'Ⲧⲁϩⲟ ⲁⲛⲧⲓⲅⲣⲁⲫⲟⲛ?', done:'Ⲁⲩⲧⲁϩⲟ ⲛ̀ⲛⲓⲇⲉⲇⲟⲙⲉⲛⲁ.', empty:'Ⲙ̀ⲙⲟⲛ ⲇⲉⲇⲟⲙⲉⲛⲁ.', recover:'Ⲧⲁϩⲟ ⲙ̀ⲙⲉⲧⲥⲱⲛϩ' },
  egy: { trigger:'𓏞 𓂋𓏤', title:'𓆳𓏏𓏤 · 𓏞', info:'𓏞 · 𓂋𓏤𓈖𓆎𓏏𓊖', export:'𓏞 ↓', ics:'ICS ↓', importICS:'ICS ↑', import:'𓏞 ↑', close:'𓐍𓏏𓅓', confirm:'𓏞 ↑ ?', done:'𓏞 ✓', empty:'𓏞 —', recover:'𓏞 ↺' }
};
const lang = () => words[document.body.dataset.language] ? document.body.dataset.language : 'ar';
const tr = () => words[lang()];
let dialog = null;
let lastFocus = null;
function close() {
  if (!dialog) return;
  dialog.remove();
  dialog = null;
  if (lastFocus?.isConnected) lastFocus.focus();
}
function download(text, filename, mime='application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type:mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exportData() {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    download(createBackup(localStorage), 'renpet-backup-' + stamp + '.json');
  } catch (error) { window.alert(error.message || tr().empty); }
}
async function exportCalendar() {
  try {
    const response=await fetch('./data.json');
    if(!response.ok)throw Error('Calendar data unavailable');
    const data=await response.json();
    const {text,count}=exportICS(loadScheduler(localStorage),data.years,occursOn,{
      today:Math.floor(Date.now()/86400000)
    });
    if(!count){window.alert(tr().empty);return;}
    download(text,'renpet-calendar-'+new Date().toISOString().slice(0,10)+'.ics','text/calendar;charset=utf-8');
  } catch(error){window.alert(error.message||'ICS export failed');}
}
async function importCalendarICS(){
 const picker=document.createElement('input');picker.type='file';picker.accept='.ics,text/calendar';
 picker.addEventListener('change',async()=>{
  const file=picker.files?.[0];if(!file)return;
  try{
   if(file.size>5*1024*1024)throw Error('ICS file is too large');
   const result=await fetch('./data.json');if(!result.ok)throw Error('Calendar data unavailable');
   const calendar=await result.json(),sched=loadScheduler();
   const parsed=parseICS(await file.text(),{
    minDay:dayNumber(calendar.min_date),maxDay:dayNumber(calendar.max_date),
    knownUIDs:sched.items.map(i=>i.importUID).filter(Boolean)
   });
   const counts=''+parsed.imported+' '+(lang()==='ar'?'موعد صالح · ':'events ready · ')+
    parsed.unsupported+' '+(lang()==='ar'?'تكرارات/مناطق زمنية غير مدعومة · ':'unsupported · ')+
    parsed.invalid+' '+(lang()==='ar'?'غير صالح · ':'invalid · ')+parsed.duplicate+' '+(lang()==='ar'?'مكرر':'already imported');
   if(!parsed.imported){window.alert(counts);return;}
   if(!window.confirm((lang()==='ar'?'استيراد هذه المواعيد إلى رنبت؟':'Import these events into Renpet?')+'\n'+counts))return;
   try{download(createBackup(localStorage),'renpet-before-ics-import-'+new Date().toISOString().slice(0,10)+'.json');}catch{}
   for(const imported of parsed.items){
    const event={...createItem({...imported,kind:'event',calendarId:'personal'}),importUID:imported.importUID,
     excludedDays:imported.excludedDays};
    ensureSavedItemVisible(sched,event);upsertItem(sched,event);
   }
   if(!saveScheduler(sched))throw Error('Cannot save imported appointments on this device');
   window.alert((lang()==='ar'?'تم الاستيراد. ':'Imported. ')+counts);
   window.location.reload();
  }catch(e){window.alert(e.message||'ICS import failed');}
 },{once:true});
 picker.click();
}

async function importData() {
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = '.json,application/json';
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Backup file is too large');
      const parsed = parseBackup(await file.text());
      if (!window.confirm(tr().confirm)) return;
      // Save the existing state first, so replacing it can be reversed.
      try { download(createBackup(localStorage), 'renpet-before-restore-' + new Date().toISOString().slice(0,10) + '.json'); }
      catch { /* A new installation may not yet have anything to preserve. */ }
      restoreBackup(localStorage, parsed);
      window.alert(tr().done);
      window.location.reload();
    } catch (error) { window.alert(error.message || 'Backup restore failed'); }
  }, { once:true });
  picker.click();
}
function open() {
  if (dialog) return;
  lastFocus = document.activeElement;
  const t = tr();
  dialog = document.createElement('div');
  dialog.className = 'renpet-backup-overlay';
  dialog.innerHTML = `<section class="renpet-backup-panel" role="dialog" aria-modal="true" aria-labelledby="renpet-backup-heading">
    <div class="renpet-backup-head"><h2 id="renpet-backup-heading"></h2></div>
    <p class="renpet-backup-info"></p>
    <button type="button" data-backup="export" class="renpet-backup-action"></button>
    <button type="button" data-backup="ics" class="renpet-backup-action secondary"></button>
    <button type="button" data-backup="import-ics" class="renpet-backup-action secondary"></button>
    <button type="button" data-backup="import" class="renpet-backup-action secondary"></button>
    <button type="button" data-backup="recover" class="renpet-backup-action secondary" hidden></button>
  </section>`;
  dialog.querySelector('h2').textContent = t.title;
  dialog.querySelector('.renpet-backup-info').textContent = t.info;
  dialog.querySelector('[data-backup="export"]').textContent = t.export;
  dialog.querySelector('[data-backup="import"]').textContent = t.import;
  dialog.querySelector('[data-backup="ics"]').textContent = t.ics;
  dialog.querySelector('[data-backup="import-ics"]').textContent = t.importICS;
  const recoveryButton=dialog.querySelector('[data-backup="recover"]');
  recoveryButton.textContent=t.recover;
  recoveryButton.hidden=!schedulerRecoveryStatus(localStorage).recoveryAvailable;
  dialog.dir = lang() === 'ar' ? 'rtl' : 'ltr';
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-backup]')?.dataset.backup;
    if (event.target === dialog) close();
    else if (action === 'export') exportData();
    else if (action === 'import') importData();
    else if (action === 'ics') exportCalendar();
    else if (action === 'import-ics') importCalendarICS();
    else if (action === 'recover' && window.confirm(t.confirm)) {
      const outcome=restoreSchedulerSnapshot(localStorage);
      if(outcome.restored)window.location.reload();
      else window.alert(lang()==='ar'?'لم يتم العثور على نسخة صالحة':'No valid recovery snapshot');
    }
  });
  document.body.append(dialog);
  dialog.querySelector('[data-backup="export"]')?.focus();
}
document.addEventListener('keydown', event => { if (event.key === 'Escape' && dialog) close(); });
export function openBackup(){open();}
