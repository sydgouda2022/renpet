// The acceptance suite describes the current unified Renpet experience, not retired panes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language,saveEvent}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});

async function monthGeometry(page){
 return page.locator('.time-panel[data-stream-kind="month"]').nth(2).evaluate(panel=>{
  const box=panel.querySelector('.month-section');
  const bands=[...box.querySelectorAll('.week-band')];
  const rect=box.getBoundingClientRect();
  const dates=[...bands[0].querySelectorAll('.date')];
  const rows=bands.map(b=>b.getBoundingClientRect());
  return {
   week:Number(box.dataset.week),
   width:rect.width,height:rect.height,
   bands:bands.length,
   bandHeights:rows.map(r=>r.height),
   firstRowDates:dates.length,
   firstRowTops:dates.map(d=>Math.round(d.getBoundingClientRect().top)),
   gridBottom:Math.round(rows.at(-1).bottom),
   boxBottom:Math.round(rect.bottom),
   horizontalOverflow:box.scrollWidth-box.clientWidth
  };
 });
}
async function chooseWeek(page,days){
 await page.locator('header [data-open-panel="settings"]').click();
 await page.locator('.ux-panel [name="week"]').selectOption(String(days));
 await page.locator('.ux-panel-backdrop').click({position:{x:5,y:5}});
}
function verifyMonthPair(seven,ten,screen){
 assert.equal(seven.week,7,screen+' Arabic seven-day setting');
 assert.equal(ten.week,10,screen+' ten-day setting');
 assert.ok(Math.abs(seven.height-ten.height)<=2,screen+' outer month box must not shrink for ten-day weeks: '+JSON.stringify({seven,ten}));
 assert.ok(Math.abs(seven.width-ten.width)<=2,screen+' box width must remain identical');
 assert.equal(ten.bands,3,screen+' regular ten-day month must have three bands');
 assert.equal(ten.firstRowDates,10,screen+' ten dates per row');
 assert.equal(new Set(ten.firstRowTops).size,1,screen+' all ten dates must be on one line');
 for(const geometry of [seven,ten]){
  assert.ok(Math.max(...geometry.bandHeights)-Math.min(...geometry.bandHeights)<3,screen+' week bands must share available vertical space');
  assert.ok(geometry.horizontalOverflow<=2,screen+' month box must not overflow horizontally');
  assert.ok(Math.abs(geometry.boxBottom-geometry.gridBottom)<5,screen+' week bands must fill the writing surface');
 }
}

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
    // Week length changes only the internal grid, never the outer month size.
    const seven=await monthGeometry(page);
    await chooseWeek(page,10);
    const ten=await monthGeometry(page);
    verifyMonthPair(seven,ten,name);
    if(name==='ipad-landscape'){
     await page.screenshot({path:path.join(out,'month-ten-days-ipad.png'),fullPage:false});
    }
    await chooseWeek(page,7);
    await language(page,'cop');
    assert.equal((await monthGeometry(page)).week,10,'Coptic defaults to ten days');
    assert.ok(Math.abs((await monthGeometry(page)).height-seven.height)<=2,'Coptic and Arabic month boxes share geometry');
    await language(page,'ar');
    assert.equal((await monthGeometry(page)).week,7,'Arabic returns to seven days');
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
