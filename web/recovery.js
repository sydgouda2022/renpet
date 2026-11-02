import {writeRecord,StorageConflictError} from './storage.js';
import {emptyState} from './scheduler.js';

// Never replace unreadable personal data automatically. Keep it in IndexedDB
// until the owner explicitly exports the raw record and chooses a reset.
export function showSchedulerRecovery(root,rawScheduler){
 document.documentElement.lang='ar';
 document.documentElement.dir='rtl';
 root.innerHTML='<main class="renpet-startup-failed" id="main-content" tabindex="-1" role="alert" lang="ar">'+
  '<h1>بيانات المواعيد تحتاج استعادة</h1>'+
  '<p>لم يتمكن رنبت من قراءة المواعيد المحفوظة بصورة صحيحة. بياناتك ما زالت على هذا الجهاز ولم نحذف منها شيئًا.</p>'+
  '<p>احفظ نسخة من البيانات الحالية قبل بدء تقويم جديد. يمكنك استيراد نسخة احتياطية سليمة بعد ذلك.</p>'+
  '<button type="button" data-export-raw>حفظ البيانات الأصلية على الجهاز</button>'+
  '<button type="button" class="secondary" data-reset-calendar>بدء تقويم جديد بعد التأكيد</button>'+
  '<button type="button" class="secondary" data-retry-calendar>إعادة المحاولة</button>'+
  '<p data-recovery-error role="status" aria-live="polite"></p></main>';
 const message=text=>{root.querySelector('[data-recovery-error]').textContent=text;};
 root.querySelector('[data-export-raw]').addEventListener('click',()=>{
  try{
   const value=JSON.stringify({
    format:'renpet.unreadable-data',savedAt:new Date().toISOString(),scheduler:rawScheduler
   },null,2);
   if(!value)throw Error('Unable to serialize saved data');
   const url=URL.createObjectURL(new Blob([value],{type:'application/json;charset=utf-8'}));
   const link=document.createElement('a');
   link.href=url;link.download='renpet-original-data-'+new Date().toISOString().slice(0,10)+'.json';
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),10000);
   message('تم طلب تنزيل البيانات الأصلية. تأكد من وجود الملف على جهازك قبل إعادة الضبط.');
  }catch(error){message('تعذر تصدير البيانات الأصلية: '+error.message);}
 });
 root.querySelector('[data-reset-calendar]').addEventListener('click',async event=>{
  if(!confirm('سيُستبدل سجل المواعيد غير المقروء بتقويم خالٍ. هل حفظت نسخة من البيانات الأصلية؟'))return;
  const button=event.currentTarget;button.disabled=true;
  try{
   await writeRecord('scheduler',emptyState());
   location.reload();
  }catch(error){
   message(error instanceof StorageConflictError?
    'تغيرت البيانات في نافذة أخرى. أعد تحميل رنبت قبل المحاولة.':
    'تعذر إعادة الضبط. لم تُحذف البيانات: '+error.message);
   button.disabled=false;
  }
 });
 root.querySelector('[data-retry-calendar]').addEventListener('click',()=>location.reload());
 root.querySelector('main')?.focus({preventScroll:true});
 globalThis.RenpetBoot?.ready();
}
