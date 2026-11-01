// Calendar, storage and recurrence invariants under the unified Day/Month/Year UI.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {boot,record}=require('./browser-tools.cjs');
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());
  await boot(page);
  await page.locator('header [data-new]').click();
  let form=page.locator('#event-editor');
  await form.locator('[name=title]').fill('Three-day preservation test');
  await form.locator('[name=egyYear]').selectOption('6268');
  await form.locator('[name=egyMonth]').selectOption('2');
  await form.locator('[name=egyDay]').selectOption('26');
  assert.equal(await form.locator('[name=endEgyDay]').inputValue(),'26');
  await form.locator('.end-date-details summary').click();
  await form.locator('[name=endEgyDay]').selectOption('28');
  await form.locator('.save-button').click();
  await page.locator('.save-confirmation').waitFor();
  const saved=(await record(page,'scheduler')).items.find(i=>i.title==='Three-day preservation test');
  assert.ok(saved);assert.equal(saved.endDay-saved.startDay,2);
  assert.equal(await page.locator('body').getAttribute('data-view'),'day');
  const savedBlock=page.locator('.time-panel[data-focus-day="'+saved.startDay+'"] .timeline-event[data-edit="'+saved.id+'"]');
  await savedBlock.waitFor();
  await savedBlock.click();
  assert.equal(await page.locator('#event-editor [name=egyDay]').inputValue(),'26');
  assert.notEqual(await page.locator('#event-editor .end-date-details').getAttribute('open'),null);
  await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
  await page.reload();await page.locator('.time-rail').waitFor();
  assert.equal((await record(page,'scheduler')).items.find(i=>i.id===saved.id)?.endDay,saved.endDay);

  // The only way to commit a draft is Save, regardless of platform.
  await page.locator('header [data-new]').click();
  form=page.locator('#event-editor');
  assert.equal(await form.locator('[data-close]').count(),0);
  await form.locator('[name=title]').fill('Not saved on outside tap');
  await form.locator('.sheet-overlay').count().catch(()=>{});
  await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
  assert.equal(await page.locator('#event-editor').count(),0);
  assert.ok(!(await record(page,'scheduler')).items.some(i=>i.title==='Not saved on outside tap'));
  await page.locator('header [data-new]').click();
  await page.locator('#event-editor [name=title]').fill('Escape must not save');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#event-editor').count(),0);

  // An Egyptian 10-day cycle is one local series.
  await page.locator('header [data-new]').click();
  form=page.locator('#event-editor');
  await form.locator('[name=title]').fill('Egyptian ten-day recurrence');
  const choices=await form.locator('[name=repeat] option').evaluateAll(a=>a.map(x=>x.value));
  assert.deepEqual(choices,['none','daily','egy10','egyMonthly','egyYearly','custom']);
  await form.locator('[name=repeat]').selectOption('egy10');
  await form.locator('.save-button').click();
  await page.locator('.save-confirmation').waitFor();
  const repeat=(await record(page,'scheduler')).items.find(i=>i.title==='Egyptian ten-day recurrence');
  assert.ok(repeat);assert.equal(repeat.repeat,'egy10');
  const everyTen=await page.evaluate(async id=>{
   const scheduler=await import('./scheduler.js');
   const data=await(await import('./storage.js')).readRecord('scheduler');
   const item=data.items.find(i=>i.id===id);
   return Array.from({length:22},(_,n)=>scheduler.occursOn(item,item.startDay+n));
  },repeat.id);
  assert.deepEqual(everyTen.map((v,n)=>v?n:null).filter(v=>v!==null),[0,10,20]);

  // Custom repeat every six Egyptian days remains independently editable.
  await page.locator('header [data-new]').click();
  form=page.locator('#event-editor');
  await form.locator('[name=title]').fill('Buy food for the shift');
  await form.locator('[name=repeat]').selectOption('custom');
  assert.equal(await form.locator('.custom-repeat').isVisible(),true);
  await form.locator('[data-repeat-preset="6"]').click();
  assert.equal(await form.locator('[name=repeatEvery]').inputValue(),'6');
  await form.locator('[name=repeatUnit]').selectOption('day');
  await form.locator('.save-button').click();
  await page.locator('.save-confirmation').waitFor();
  const custom=(await record(page,'scheduler')).items.find(i=>i.title==='Buy food for the shift');
  assert.ok(custom);
  assert.deepEqual([custom.repeat,custom.repeatEvery,custom.repeatUnit],['custom',6,'day']);
  const pattern=await page.evaluate(async id=>{
   const scheduler=await import('./scheduler.js');
   const state=await(await import('./storage.js')).readRecord('scheduler');
   const event=state.items.find(i=>i.id===id);
   return Array.from({length:15},(_,offset)=>scheduler.occursOn(event,event.startDay+offset));
  },custom.id);
  assert.deepEqual(pattern,[true,false,false,false,false,false,true,false,false,false,false,false,true,false,false]);
  await page.reload();await page.locator('.time-rail').waitFor();
  assert.equal((await record(page,'scheduler')).items.find(i=>i.id===custom.id)?.repeatEvery,6);

  // Reminders have separate completion controls in the scoped appointments sheet.
  await page.locator('header [data-new]').click();
  form=page.locator('#event-editor');
  await form.locator('[name=title]').fill('Independent reminder control');
  await form.locator('[name=kind][value=reminder]').check();
  await form.locator('.save-button').click();
  await page.locator('.save-confirmation').waitFor();
  const reminder=(await record(page,'scheduler')).items.find(i=>i.title==='Independent reminder control');
  assert.ok(reminder);
  await page.locator('[data-appointments]').click();
  const done=page.locator('.ux-panel .reminder-box[data-complete="'+reminder.id+'"]');
  await done.waitFor();
  assert.equal(await done.getAttribute('aria-pressed'),'false');
  await done.click();
  assert.equal((await record(page,'scheduler')).items.find(i=>i.id===reminder.id).completed,true);
  await context.close();
  console.log('Renpet unified UI preserves date editor, recurrence, reminders and local persistence');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
