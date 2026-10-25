const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT='http://127.0.0.1:8765/';
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
const results=[];

async function setLanguage(page,language){
 await page.locator('header [data-open-panel="settings"]').click();
 await page.locator('select[name="language"]').selectOption(language);
 await page.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
}
async function openMonth(page,month){
 await page.locator('[data-open-year]').click();
 await page.locator('[data-open-month="'+month+'"]').click();
}
async function geometry(page){
 return page.evaluate(()=>{
  const rect=selector=>document.querySelector(selector).getBoundingClientRect();
  const agenda=rect('.month-agenda'),nav=rect('.ux-bottom');
  const controls=[...document.querySelectorAll('header button')].map(el=>{
   const r=el.getBoundingClientRect();return {width:r.width,height:r.height};
  });
  const date=document.querySelector('.date[aria-pressed="true"]');
  const box=date?.getBoundingClientRect();
  const hit=box&&document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
   layout:document.documentElement.dataset.renpetLayout,
   agenda:{top:agenda.top,bottom:agenda.bottom,height:agenda.height},
   nav:{top:nav.top,bottom:nav.bottom},controls,
   dateHit:!!hit&&hit.closest('.date')===date,
   decorative:getComputedStyle(document.querySelector('.season-art')).pointerEvents};
 });
}

async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 try{
  for(const [name,width,height] of [
   ['iphone-small',375,667],['iphone',390,844],['ipad-portrait',768,1024],
   ['ipad-classic',1024,768],['ipad-landscape',1194,834],['desktop',1440,900]
  ]){
   const ctx=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:true,
    serviceWorkers:'block',timezoneId:'Africa/Cairo'});
   const page=await ctx.newPage();page.setDefaultTimeout(12000);
   await page.clock.install({time:new Date('2026-10-25T09:00:00Z')});
   try{
    await page.goto(ROOT,{waitUntil:'domcontentloaded'});
    await page.locator('.month-section').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('body').getAttribute('data-season'),'akhet');
    const artwork=await page.evaluate(async()=>Promise.all(['akhet','peret','shemu'].map(async id=>{
     const response=await fetch('./assets/seasons/'+id+'.webp');
     return {id,ok:response.ok,type:response.headers.get('content-type'),size:(await response.arrayBuffer()).byteLength};
    })));
    assert.ok(artwork.every(a=>a.ok&&a.type.includes('image/webp')&&a.size>20000));
    await setLanguage(page,'cop');
    const month=await geometry(page);
    assert.ok(month.scrollWidth<=width+1,'No horizontal overflow');
    assert.ok(month.controls.every(c=>c.width>=40&&c.height>=40),'Keep the existing touch targets');
    assert.ok(month.agenda.height>=110&&month.agenda.bottom<=height+1,'The phone agenda stays visible');
    assert.ok(month.dateHit,'Painted artwork must never intercept a day tap');
    assert.equal(month.decorative,'none');
    assert.ok(!/[A-Za-z\u0600-\u06ff]/u.test(await page.locator('.date-range').innerText()),'Coptic Gregorian overlay stays numeric');
    await page.screenshot({path:path.join(out,'season-'+name+'-month.png')});

    await page.locator('[data-open-year]').click();
    assert.equal(await page.locator('.year-season').count(),3);
    assert.equal(await page.locator('.year-month').count(),12);
    assert.equal(await page.locator('.year-mini-day').count(),366);
    assert.equal(await page.locator('.year-season[data-current-season="true"]').getAttribute('data-season'),'akhet');
    assert.equal(await page.locator('.year-mini-today').count(),1);
    assert.equal(await page.locator('.year-mini-epagomenal .year-mini-day').count(),6);
    const year=await page.evaluate(()=>{
     const main=document.querySelector('.main-scroll').getBoundingClientRect();
     const end=document.querySelector('.epagomenal-tile').getBoundingClientRect();
     const columns=getComputedStyle(document.querySelector('.year-months')).gridTemplateColumns.split(' ').length;
     return {mainBottom:main.bottom,lastBottom:end.bottom,columns};
    });
    if(width>=700){
     assert.equal(year.columns,4,'An iPad shows four months in each season row');
     assert.ok(year.lastBottom<=year.mainBottom+1,'Complete Coptic year must fit on the iPad');
    }else{
     assert.equal(year.columns,2,'Phone mini-calendars remain readable');
     await page.locator('.epagomenal-tile').scrollIntoViewIfNeeded();
     assert.ok(await page.locator('.epagomenal-tile').isVisible());
     await page.locator('.year-season').first().scrollIntoViewIfNeeded();
    }
    await page.screenshot({path:path.join(out,'season-'+name+'-year.png')});
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('.year-season[data-current-season="true"]').count(),0,'Do not label another year as today');
    await page.locator('[data-prev]').click();
    assert.equal(await page.locator('.year-season[data-current-season="true"]').count(),1);

    await page.locator('[data-open-month="4"]').click();
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('body').getAttribute('data-season'),'peret');
    assert.ok((await page.locator('.season-frieze').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('peret.webp'));
    await page.screenshot({path:path.join(out,'season-'+name+'-peret.png')});
    await openMonth(page,8);await page.locator('[data-next]').click();
    assert.equal(await page.locator('body').getAttribute('data-season'),'shemu');
    await page.screenshot({path:path.join(out,'season-'+name+'-shemu.png')});
    await openMonth(page,12);await page.locator('[data-next]').click();
    assert.equal(await page.locator('body').getAttribute('data-season'),'shemu','Year-end days keep the final-season setting');
    assert.equal(await page.locator('.date').count(),6);
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('body').getAttribute('data-season'),'akhet','The next new year returns to Akhet');

    await page.locator('header [data-new]').click();
    await page.locator('#event-editor [name="title"]').fill('Seasonal design appointment');
    await page.locator('#event-editor .save-button').click();
    await page.locator('.save-confirmation').waitFor();
    assert.equal(await page.locator('.timeline-event:has-text("Seasonal design appointment")').count(),1);
    await page.locator('[data-primary-view="today"]').click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items);
    assert.equal(saved.filter(i=>i.title==='Seasonal design appointment').length,1);
    // All three scripts share the artwork and existing controls; the season
    // caption must no longer repeat the Coptic month name.
    for(const language of ['ar','egy','cop']){
     await setLanguage(page,language);
     assert.equal(await page.locator('body').getAttribute('data-season'),'akhet');
     const caption=await page.locator('.ux-heading p').innerText();
     if(language==='cop')assert.equal(caption,'Ⲁⲭⲉⲧ');
     if(language==='egy')assert.ok(!/[\u0600-\u06ffA-Za-z]/u.test(caption));
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     const selectedDay=Number(await page.locator('.month-section .date').nth(6).getAttribute('data-date'));
     await page.locator('[data-date="'+selectedDay+'"]').click();
     await page.locator('.day-page').waitFor();
     assert.equal(await page.locator('body').getAttribute('data-view'),'day','A day click opens Day at every viewport size');
     assert.equal(await page.locator('.timeline-hour').count(),24);
     assert.equal(await page.locator('.month-scroll').count(),0,'Day replaces the month and agenda');
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Day fits the available width');
     if(language==='cop')await page.screenshot({path:path.join(out,'season-'+name+'-day.png')});
     await page.locator('[data-next]').click();
     await page.locator('[data-back]').click();
     assert.equal(await page.locator('.date.chosen').getAttribute('data-date'),String(selectedDay+1),'Next advances one day, rather than one month');
     await page.locator('.date.chosen').click();
     await page.locator('[data-prev]').click();
     await page.locator('[data-back]').click();
     assert.equal(await page.locator('.date.chosen').getAttribute('data-date'),String(selectedDay),'Back retains the selected day');
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    }
    results.push({name,width,height,month,year,artwork,appointmentSaved:true,allScripts:true,seasonTransitions:true,dayNavigation:true});
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'seasonal-design-report.json'),JSON.stringify(results,null,2));
 console.log('RENPET_SEASONAL_DESIGN',JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
