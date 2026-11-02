const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {ROOT,boot,record}=require('./browser-tools.cjs');

async function verify(engine,name){
 const browser=await engine.launch({headless:true,args:name==='chromium'?['--no-sandbox']:[]});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 const page=await context.newPage();
 let confirms=[],alerts=[];
 page.on('dialog',async dialog=>{
  if(dialog.type()==='confirm'){confirms.push(dialog.message());await dialog.accept();}
  else {alerts.push(dialog.message());await dialog.accept();}
 });
 try{
  await boot(page);
  const ics=await page.evaluate(async()=>{
   const [{createItem,emptyState,occursOn},{dayNumber},{exportICS}]=await Promise.all([
    import('./scheduler.js'),import('./calendar.js'),import('./ics-core.mjs')
   ]);
   const birthday=createItem({title:'Roundtrip anniversary',kind:'event',startDay:dayNumber('2024-02-29'),
    allDay:true,startMinutes:0,endMinutes:1440,occasionType:'anniversary',
    occasionCalendar:'gregorian',repeat:'gregYearly'});
   const reminder=createItem({title:'Roundtrip reminder',kind:'reminder',
    startDay:dayNumber('2026-11-02'),startMinutes:540,endMinutes:600,notes:'Exact note'});
   const state=emptyState();state.items.push(birthday,reminder);
   const source=exportICS(state,occursOn,{today:dayNumber('2026-11-02')}).text;
   const bad=['BEGIN:VEVENT','UID:unsupported-external-rule',
    'DTSTART;VALUE=DATE:20261104','DTEND;VALUE=DATE:20261105',
    'SUMMARY:Unsupported complex rule','RRULE:FREQ=MONTHLY;BYDAY=MO',
    'END:VEVENT',''].join('\r\n');
   return source.replace('END:VCALENDAR',bad+'END:VCALENDAR');
  });
  await page.locator('[data-open-panel=settings]').click();
  await page.locator('[data-backup]').click();
  const choice=page.waitForEvent('filechooser');
  await page.locator('[data-backup="import-ics"]').click();
  const navigation=page.waitForNavigation({waitUntil:'domcontentloaded'});
  await (await choice).setFiles({name:'renpet-test.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)});
  await navigation;
  await page.locator('.time-rail').waitFor();
  assert.equal(confirms.length,1);
  assert.match(confirms[0],/مواعيد جاهزة للإضافة: 2/);
  assert.match(confirms[0],/مواعيد غير مدعومة: 1/);
  assert.match(confirms[0],/دون حذف المواعيد الموجودة/);
  const stored=await record(page,'scheduler');
  assert.equal(stored.items.length,2);
  const anniversary=stored.items.find(item=>item.title==='Roundtrip anniversary');
  assert.ok(anniversary);
  assert.equal(anniversary.repeat,'gregYearly');
  assert.equal(anniversary.occasionType,'anniversary');
  assert.equal(anniversary.occasionCalendar,'gregorian');
  const reminder=stored.items.find(item=>item.title==='Roundtrip reminder');
  assert.equal(reminder?.kind,'reminder');
  assert.equal(reminder?.notes,'Exact note');
  assert.equal(alerts.length,1);
  assert.match(alerts[0],/مواعيد غير مدعومة: 1/);

  // A second import should explain duplicate + unsupported records and
  // never replace existing items or present a misleading success dialog.
  await page.locator('[data-open-panel=settings]').click();
  await page.locator('[data-backup]').click();
  const chooser2=page.waitForEvent('filechooser');
  await page.locator('[data-backup="import-ics"]').click();
  await (await chooser2).setFiles({name:'again.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)});
  await page.waitForFunction(()=>document.querySelector('.renpet-backup-overlay')!==null);
  assert.equal((await record(page,'scheduler')).items.length,2);
  assert.equal(confirms.length,1,'No write confirmation on duplicate-only reimport');
  assert.match(alerts.at(-1),/مواعيد مكررة: 2/);
  assert.match(alerts.at(-1),/مواعيد غير مدعومة: 1/);
  console.log('RENPET_ICS_ROUNDTRIP',JSON.stringify({engine:name,imported:2,unsupported:1,duplicateReimport:2,correctTypes:true}));
 }finally{await context.close();await browser.close();}
}
(async()=>{await verify(chromium,'chromium');await verify(webkit,'webkit');})().catch(e=>{
 console.error(e);process.exitCode=1;
});
