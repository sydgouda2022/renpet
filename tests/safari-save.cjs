const {webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const dir='renpet-mobile-evidence';fs.mkdirSync(dir,{recursive:true});
const trace=[],issues=[];
async function run(){
 const browser=await webkit.launch({headless:true});
 try {
 for(const [width,height] of [[375,667],[390,844],[768,1024],[1194,834]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'en-US',timezoneId:'Africa/Cairo',serviceWorkers:'block'});
  const page=await ctx.newPage();page.setDefaultTimeout(6500);
  const report=(type,detail)=>trace.push({width,type,detail:String(detail).slice(0,600)});
  page.on('pageerror',e=>report('error',e.stack||e));
  page.on('console',m=>{if(m.type()==='error')report('console',m.text())});
  page.on('dialog',d=>d.accept());
  const snap=async(id)=>{await page.screenshot({path:path.join(dir,'safari-'+width+'-'+id+'.png'),fullPage:true});};
  for(const lang of ['ar','cop','egy']){
   const title={ar:'تجربة حفظ عربية',cop:'ⲣⲉⲛⲡⲉⲧ ⲁ',egy:'𓆓𓏏𓇳'}[lang]+' '+width;
   try{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('.month-section').waitFor();
    await page.locator('[data-open-panel=settings]').click();
    await page.locator('select[name=language]').selectOption(lang);
    await page.locator('.ux-panel-backdrop').click({position:{x:9,y:9}});
    const selectedDay=await page.locator('.month-section .date').nth(6).getAttribute('data-date');
    await page.locator('[data-date="'+selectedDay+'"]').tap();
    await page.locator('.day-page').waitFor();
    if(await page.locator('.timeline-hour').count()!==24)throw Error('Day tap did not open the timeline');
    await page.locator('[data-back]').tap();
    if(await page.locator('.date.chosen').getAttribute('data-date')!==selectedDay)throw Error('Back lost the selected day');
    await page.locator('[data-date="'+selectedDay+'"]').tap();
    await page.locator('.day-page').waitFor();
    report(lang+'-day-navigation','Single tap opens Day and Back preserves the selected date');
    await page.locator('header [data-new]').click();
    const form=page.locator('#event-editor'),input=form.locator('[name=title]');
    await input.fill(title);
    if(lang!=='ar'){
     await input.focus();
     await page.locator('.renpet-keyboard:not([hidden])').waitFor();
     await snap(lang+'-keyboard');
    }
    const pre=await form.evaluate(f=>({checkValidity:f.checkValidity(),title:f.elements.title.value,date:f.elements.egyYear.value+'-'+f.elements.egyMonth.value+'-'+f.elements.egyDay.value,
      start:f.elements.start.value,end:f.elements.end.value,kb:getComputedStyle(document.getElementById('renpet-keyboard')).display,
      save:(()=>{const b=f.querySelector('.save-button').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()}));
    report(lang+'-before',JSON.stringify(pre));
    const save=form.locator('.save-button');
    const rect=await save.boundingBox();
    await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
    await page.waitForTimeout(200);
    const after=await page.evaluate((title)=>({editor:!!document.querySelector('#event-editor'),
      err:document.querySelector('.event-error')?.textContent,view:document.querySelector('.day-page')?.className,
      scheduler:JSON.parse(localStorage.getItem('renpet.scheduler.v1')||'null')?.items?.filter(x=>x.title===title),
      notice:document.querySelector('.save-confirmation')?.textContent,
      reveal:(()=>{
       const item=[...document.querySelectorAll('.timeline-event[data-edit]')].find(e=>e.innerText.includes(title));
       if(!item)return null;
       const r=item.getBoundingClientRect(),main=document.querySelector('.main-scroll')?.getBoundingClientRect();
       return {top:r.top,bottom:r.bottom,inView:!!main&&r.top>=main.top&&r.top<main.bottom};
      })(),
      btn:document.querySelector('.save-button')?.outerHTML}),title);
    report(lang+'-after',JSON.stringify(after));
    await snap(lang+'-postsave');
    if(after.editor||!after.scheduler?.length)throw Error('Save did not persist and dismiss in '+lang+': '+JSON.stringify(after));
    if(!after.notice||!after.reveal?.inView)throw Error(lang+' saved but confirmation or event is invisible: '+JSON.stringify(after));
    await page.reload();
    const persists=await page.evaluate(title=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')||'null')?.items?.some(i=>i.title===title),title);
    if(!persists)throw Error('Lost saved '+lang+' appointment on WebKit reload');
    // Save from the header while the localized time picker remains open.
    // The first tap must commit its selection and persist the appointment.
    const pickerTitle=title+' time';
    await page.locator('header [data-new]').click();
    const form2=page.locator('#event-editor');
    await form2.locator('[name=title]').fill(pickerTitle);
    await form2.locator('[data-time-open=start]').click();
    await page.locator('.time-picker-host:not([hidden])').waitFor();
    const startVal=await form2.locator('[name=start]').inputValue();
    const endVal=await form2.locator('[name=end]').inputValue();
    report(lang+'-picker-before',startVal+' / '+endVal);
    await form2.locator('.save-button').click();
    const savedPicker=await page.evaluate(name=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')||'null')?.items?.find(i=>i.title===name),pickerTitle);
    if(await form2.count()||!savedPicker)throw Error(lang+' first Save tap from open picker did not persist');

   }catch(e){issues.push({width,lang,error:String(e.stack||e).slice(0,900)});await snap(lang+'-failed').catch(()=>{});}
  }

  // Reproduce the exact screenshot: an appointment for 26 Baba 6282
  // (5 Nov 2026) in a calendar hidden by a previous app iteration.
  const specific=await ctx.newPage();
  specific.setDefaultTimeout(6500);
  specific.on('dialog',d=>d.accept());
  await specific.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await specific.locator('.month-section').waitFor();
  await specific.evaluate(()=>{
    const key='renpet.scheduler.v1';
    const current=JSON.parse(localStorage.getItem(key)||'null')||{version:1,calendars:[
      {id:'personal',name:{ar:'شخصي'},color:'#187568',visible:true},
      {id:'work',name:{ar:'العمل'},color:'#C8A24A',visible:true}
    ],items:[]};
    for(const c of current.calendars)c.visible=false;
    localStorage.setItem(key,JSON.stringify(current));
  });
  await specific.reload();
  await specific.locator('header [data-new]').click();
  const form=specific.locator('#event-editor');
  await form.locator('[name=title]').fill('ميعاد السعادة');
  await form.locator('[name=egyYear]').selectOption('6282');
  await form.locator('[name=egyMonth]').selectOption('2');
  await form.locator('[name=egyDay]').selectOption('26');
  await form.locator('.save-button').click();
  await specific.locator('.save-confirmation').waitFor();
  await specific.locator('.timeline-event:has-text("ميعاد السعادة")').waitFor();
  const restored=await specific.evaluate(()=>{
    const s=JSON.parse(localStorage.getItem('renpet.scheduler.v1'));
    const e=s.items.find(x=>x.title==='ميعاد السعادة');
    return {calendarVisible:s.calendars.find(c=>c.id===e?.calendarId)?.visible,
      startDay:e?.startDay,day:document.querySelector('.day-heading')?.textContent,
      visible:!!document.querySelector('.timeline-event[data-edit="'+e?.id+'"]')};
  });
  report('screen-reproduction',JSON.stringify(restored));
  if(!restored.calendarVisible||!restored.visible)throw Error('Nov 5 event is stored but hidden: '+JSON.stringify(restored));
  await specific.locator('[data-primary-view=list]').click();
  await specific.locator('.event-row:has-text("ميعاد السعادة")').waitFor();
  await specific.reload();
  await specific.locator('.month-section').waitFor();
  await specific.locator('[data-primary-view=list]').click();
  await specific.locator('.event-row:has-text("ميعاد السعادة")').waitFor();
  await specific.screenshot({path:path.join(dir,'webkit-'+width+'-nov5-recovered.png'),fullPage:true});

  // Recover an appointment saved *before* the fix into another hidden
  // calendar, without requiring the user to create a replacement.
  await specific.evaluate(()=>{
    const key='renpet.scheduler.v1',s=JSON.parse(localStorage.getItem(key));
    const personal=s.calendars.find(c=>c.id==='personal');if(personal)personal.visible=false;
    localStorage.setItem(key,JSON.stringify(s));
  });
  await specific.reload();
  await specific.locator('[data-primary-view=list]').click();
  await specific.locator('[data-show-all-calendars]').waitFor();
  await specific.locator('[data-show-all-calendars]').click();
  await specific.locator('.event-row:has-text("ميعاد السعادة")').waitFor();
  report('recovery-old-hidden','show-all reveals saved legacy appointment');
  await specific.close();

  await ctx.close();
 }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(dir,'safari-save-report.json'),JSON.stringify({trace,issues},null,2));
 console.log('SAFARI_SAVE_RESULTS',JSON.stringify({trace,issues}).slice(0,12000));
 if(issues.length)process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1;});

