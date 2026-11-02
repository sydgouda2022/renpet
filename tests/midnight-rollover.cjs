const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {ROOT}=require('./browser-tools.cjs');
const dateNumber=iso=>Date.parse(iso+'T00:00:00Z')/86400000;
const YESTERDAY=dateNumber('2026-11-01');
const BEFORE=dateNumber('2026-11-02');
const AFTER=dateNumber('2026-11-03');

async function testClock(browser,caseName,exercise){
 const context=await browser.newContext({
  serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'Africa/Cairo'
 });
 const page=await context.newPage();
 try{
  await page.clock.install({time:new Date('2026-11-02T21:59:40Z')});
  await page.goto(ROOT,{waitUntil:'domcontentloaded'});
  await page.locator('.time-rail').waitFor();
  await exercise(page,caseName);
 }finally{await context.close();}
}
async function assertSelected(page,day){
 const selected=await page.locator('.date.chosen').first().getAttribute('data-date');
 assert.equal(Number(selected),day);
}
async function verify(engine,name){
 const browser=await engine.launch({headless:true,args:name==='chromium'?['--no-sandbox']:[]});
 try{
  await testClock(browser,'active today',async page=>{
   await assertSelected(page,BEFORE);
   await page.clock.fastForward(90000);
   await assertSelected(page,AFTER);
   assert.equal(await page.locator('.date.is-today').first().getAttribute('data-date'),String(AFTER));
  });
  await testClock(browser,'unfinished editor',async page=>{
   await page.locator('header [data-open-panel=settings]').click();
   await page.locator('[data-open-panel=calendars]').click();
   await page.locator('#new-calendar [name=name]').fill('Draft to keep at midnight');
   await page.clock.fastForward(90000);
   assert.equal(await page.locator('#new-calendar [name=name]').inputValue(),'Draft to keep at midnight');
   await page.locator('.ux-panel-backdrop').click({position:{x:8,y:8}});
   await assertSelected(page,AFTER);
  });
  await testClock(browser,'historical browsing',async page=>{
   await page.locator('.date[data-date="'+YESTERDAY+'"]').first().click();
   assert.equal(await page.locator('body').getAttribute('data-view'),'day');
   await page.clock.fastForward(90000);
   await page.locator('header [data-up-level]').click();
   await assertSelected(page,YESTERDAY);
   assert.equal(await page.locator('.date.is-today').first().getAttribute('data-date'),String(AFTER));
  });
  console.log('RENPET_MIDNIGHT',JSON.stringify({engine:name,checked:['today rolls forward','unfinished drafts preserved','browsing stays selected']}));
 }finally{await browser.close();}
}
(async()=>{await verify(chromium,'chromium');await verify(webkit,'webkit');})().catch(error=>{
 console.error(error);process.exitCode=1;
});
