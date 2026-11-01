const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language,saveEvent}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});

async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const evidence=[];
 try{
  for(const [device,width,height] of [
   ['iphone-compact',320,640],['iphone',390,844],['iphone-large',430,932],
   ['ipad-portrait',768,1024],['ipad-landscape',1194,834],['desktop',1440,900]
  ]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<700,
    hasTouch:true,timezoneId:'Africa/Cairo',serviceWorkers:'block'});
   const page=await context.newPage();page.setDefaultTimeout(15000);
   page.on('dialog',dialog=>dialog.accept());
   try{
    await boot(page);
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    const structure=await page.evaluate(()=>{
     const main=document.querySelector('#main-content');
     const stream=main.querySelector('.month-continuum');
     const navigation=document.querySelector('.ux-bottom');
     return {months:stream?.querySelectorAll('.flow-month').length,
      seasons:stream?.querySelectorAll('.flow-season').length,
      agenda:stream?.querySelectorAll('.month-agenda').length,
      mode:stream&&getComputedStyle(stream).display,
      nav:getComputedStyle(navigation).flexDirection,
      rail:navigation.getBoundingClientRect().width,
      actions:[...navigation.querySelectorAll('button')].map(b=>{
       const r=b.getBoundingClientRect();return {width:r.width,height:r.height};
      })};
    });
    assert.ok(structure.months>=8,'Continuous Month must render a recyclable runway');
    assert.ok(structure.seasons>=3,'Adjacent seasons are continuous, not separate screens');
    assert.equal(structure.agenda,1,'Exactly one selected-day agenda');
    assert.equal(structure.mode,'block');
    assert.equal(structure.nav,'row','Same bottom navigation on both devices');
    assert.ok(structure.actions.every(b=>b.width>=44&&b.height>=44));
    assert.equal(await page.locator('.month-continuum .year-month').count(),0);

    // Year is opened by tapping the year itself; no redundant Month tab.
    assert.equal(await page.locator('[data-primary-view=month]').count(),0);
    await page.locator('header [data-open-year]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'year');
    assert.equal(await page.locator('.year-season').count(),3);
    assert.equal(await page.locator('.year-month').count(),12);
    assert.equal(await page.locator('.year-mini-day').count(),366);
    assert.equal(await page.locator('.year-mini-epagomenal .year-mini-day').count(),6);
    const columns=await page.locator('.year-months').first().evaluate(el=>
      getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,width<700?2:width<1024?3:4);
    await page.locator('[data-open-month="7"]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    assert.ok(await page.locator('.flow-month .month-section').count()>2);

    // A single ordinary scroll can pass multiple months; the header/season
    // follows the month in view and the runway remains bounded.
    const monthStream=await page.locator('#main-content').evaluate(async main=>{
     const months=[...main.querySelectorAll('.flow-month')];
     const current=months.find(el=>el.querySelector('.date.chosen'));
     const at=months.indexOf(current);
     const future=months[Math.min(months.length-2,at+3)];
     const start=Number(future.dataset.monthAnchor);
     main.scrollTop+=future.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop-main.scrollTop;
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     return {start,months:main.querySelectorAll('.flow-month').length,
      active:document.body.dataset.season,year:document.querySelector('.year-shortcut-value')?.textContent};
    });
    assert.ok(monthStream.months>=8&&monthStream.months<=15,'Finite recycling window');
    assert.ok(monthStream.active,'Season follows visible date');
    await page.locator('[data-primary-view=today]').click();
    const center=page.locator('.flow-month').filter({has:page.locator('.date.chosen')});
    assert.equal(await center.count(),1,'A single selected date');
    const tapped=center.locator('.date.chosen');
    await tapped.click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    assert.equal(await page.locator('.timeline-hour').count(),24);
    assert.equal(await page.locator('.month-scroll').count(),0,'Day replaces Month, including on iPad');
    await page.locator('[data-back]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');

    for(const script of ['ar','cop','egy']){
     await language(page,script);
     assert.equal(await page.locator('body').getAttribute('data-language'),script);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
     assert.equal(await page.locator('.flow-month .month-agenda').count(),1);
     const title='Navigation '+script+' '+device;
     const saved=await saveEvent(page,title);
     assert.equal(await page.locator('body').getAttribute('data-view'),'day');
     assert.equal(await page.locator('.timeline-event[data-edit="'+saved.id+'"]').count(),1);
     await page.reload();await page.locator('.month-agenda').waitFor();
     assert.ok((await record(page,'scheduler')).items.some(item=>item.id===saved.id));
     await page.locator('[data-primary-view=today]').click();
     const row=page.locator('.month-agenda .event-row[data-edit="'+saved.id+'"]');
     await row.waitFor();
     await row.click();
     assert.equal(await page.locator('#event-editor [name=title]').inputValue(),title);
     await page.locator('.sheet-overlay').click({position:{x:6,y:6}});
     // Returning to the grid and then the day is consistent across scripts.
     await page.locator('.date.chosen').click();
     await page.locator('[data-back]').click();
     assert.equal(await page.locator('.month-continuum').count(),1);
    }

    // Today's selected day continues working while Gregorian labels are off.
    await page.locator('header [data-open-panel=settings]').click();
    await page.locator('[name=gregorian]').uncheck();
    await page.locator('.ux-panel-backdrop').click({position:{x:7,y:7}});
    assert.equal(await page.locator('.flow-month .greg-day').count(),0);
    assert.ok(await page.locator('.flow-month .date').count()>100);
    await page.locator('[data-primary-view=list]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'list');
    await page.locator('[data-primary-view=today]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    await page.screenshot({path:path.join(out,device+'-continuum.png')});
    evidence.push({device,width,height,months:structure.months,yearMonths:12,scripts:3,
     savedLocally:true,sharedNavigation:true,continuousScroll:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'mobile-ux.json'),JSON.stringify(evidence,null,2));
 console.log('RENPET_MOBILE_UX',JSON.stringify(evidence));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
