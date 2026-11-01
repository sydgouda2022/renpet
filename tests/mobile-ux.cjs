// The acceptance suite describes the current unified Renpet experience, not retired panes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language,saveEvent}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const [name,width,height] of [
   ['iphone-compact',320,640],['iphone',390,844],['iphone-large',430,932],
   ['ipad-portrait',768,1024],['ipad-landscape',1194,834]
  ]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:true,timezoneId:'Africa/Cairo',serviceWorkers:'block'});
   const page=await context.newPage();page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());
   try{
    await boot(page);
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    assert.equal(await page.locator('.ux-toolbar-actions button').count(),3,'Search, Add, Settings share a toolbar');
    assert.equal(await page.locator('.ux-bottom .ux-nav-item').count(),2,'Only Appointments and Today remain fixed');
    assert.equal(await page.locator('.time-panel[data-stream-kind=month]').count(),5);
    assert.ok((await page.locator('.time-rail').count())===1,'Only one active timeline');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),'No horizontal overflow at '+width);
    const main=page.locator('#main-content');
    const initial=await main.evaluate(el=>({height:el.scrollHeight,top:el.scrollTop,main:el.clientHeight}));
    await main.evaluate(el=>{el.scrollTop+=Math.max(650,el.clientHeight);el.dispatchEvent(new Event('scroll',{bubbles:true}));});
    await page.waitForTimeout(120);
    const moved=await main.evaluate(el=>({height:el.scrollHeight,top:el.scrollTop,main:el.clientHeight}));
    assert.ok(moved.top>initial.top+100,'Vertical scrolling advances the period without pagination');
    assert.equal(await page.locator('.time-rail').count(),1,'Scroll never creates a second navigator');
    await page.locator('[data-primary-view=today]').click();
    await page.locator('header [data-up-level]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'year');
    assert.equal(await page.locator('.time-panel[data-stream-kind=year]').count(),3);
    const currentYear=page.locator('.time-panel[data-stream-kind=year]').nth(1);
    assert.equal(await currentYear.locator('.year-month').count(),12);
    const columns=await currentYear.locator('.year-months').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,width<700?2:width<1024?3:4,'Responsive full year mini-calendars');
    assert.equal(await currentYear.locator('.year-mini-day.year-mini-today').count(),1);
    await currentYear.locator('[data-open-month="3"]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    const focused=page.locator('.time-panel[data-stream-kind=month]').nth(2);
    await focused.locator('.date[data-date]').nth(9).click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    assert.equal(await page.locator('.month-scroll').count(),0,'Day is full-width, not a split month');
    const timelines=await page.locator('.time-panel[data-stream-kind=day]').count();
    assert.ok(timelines>=3,'Day uses the same continuous timeline');
    await page.locator('header [data-up-level]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    await page.locator('[data-appointments]').click();
    assert.ok(await page.locator('.ux-panel[data-panel=appointments]').isVisible());
    await page.locator('.ux-panel-backdrop').click({position:{x:5,y:5}});
    await language(page,'cop');
    assert.equal(await page.locator('body').getAttribute('data-language'),'cop');
    await page.locator('[data-primary-view=today]').click();
    const item=await saveEvent(page,'Unified '+name);
    assert.ok((await record(page,'scheduler')).items.some(i=>i.id===item.id),'Appointment saved locally');
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    const detail=page.locator('.timeline-event[data-edit="'+item.id+'"]');
    assert.ok(await detail.count(),'Saved appointment visible in Day');
    await page.screenshot({path:path.join(out,name+'-unified.png'),fullPage:false});
    results.push({name,width,height,columns,continuous:true,appointmentsSaved:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'unified-navigation.json'),JSON.stringify(results,null,2));
 console.log('RENPET_UNIFIED_NAV',JSON.stringify(results));
}
main().catch(e=>{console.error(e);process.exitCode=1});
