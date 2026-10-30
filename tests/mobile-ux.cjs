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
   ['iphone-small',375,667],['iphone',390,844],
   ['ipad-portrait',768,1024],['ipad-landscape',1194,834],['desktop',1440,900]
  ]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:true,timezoneId:'Africa/Cairo',serviceWorkers:'block'});
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());
   try{
    await boot(page);
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Horizontal overflow at '+width);
    await page.locator('header [data-open-year]').click();
    assert.equal(await page.locator('.year-season').count(),3);
    assert.equal(await page.locator('.year-month').count(),12);
    assert.equal(await page.locator('.year-mini-day').count(),366);
    await page.locator('[data-open-month="2"]').click();
    assert.equal(await page.locator('.month-section .date').count(),30);
    await page.locator('.month-section .date').nth(10).click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    assert.equal(await page.locator('.timeline-hour').count(),24);
    await page.locator('[data-back]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    for(const lang of ['ar','cop','egy']){
     await language(page,lang);
     const title=lang+' local '+width;
     await saveEvent(page,title);
     await page.reload();await page.locator('.month-agenda').waitFor();
     const state=await record(page,'scheduler');
     assert.ok(state.items.some(i=>i.title===title),'Lost '+lang+' appointment after restart');
     const prefs=await record(page,'preferences');
     assert.equal(prefs.language,lang);
     await page.locator('[data-primary-view=today]').click();
    }
    // One-day appointments keep an uncluttered editor in all three scripts.
    await page.locator('header [data-new]').click();
    const compact=page.locator('#event-editor');
    assert.equal(await compact.locator('.end-date-details').getAttribute('open'),null);
    assert.equal(await compact.locator('.end-date-details [name=endEgyDay]').isVisible(),false);
    assert.equal(await compact.locator('.local-time-fields').isVisible(),true);
    await compact.locator('[name=allDay]').check();
    assert.equal(await compact.locator('.local-time-fields').isVisible(),false,'All-day hides time controls');
    await compact.locator('[name=allDay]').uncheck();
    assert.equal(await compact.locator('.local-time-fields').isVisible(),true);
    await compact.locator('.end-date-details summary').click();
    assert.equal(await compact.locator('[name=endEgyDay]').isVisible(),true);
    await page.locator('.sheet-overlay').click({position:{x:7,y:7}});
    assert.equal(await page.locator('#event-editor').count(),0);

    // On phones the month has an intentional scroll region with readable
    // hieroglyphic unit signs; the selected-day agenda remains visible.
    if(width<700){
     const metrics=await page.evaluate(()=>{
      const grid=document.querySelector('.month-section');
      const sign=grid?.querySelector('.egy-date-ones>span');
      const agenda=document.querySelector('.month-agenda');
      return {scrollable:grid?.scrollHeight>grid?.clientHeight,unit:sign?.getBoundingClientRect().width||0,
       agendaVisible:!!agenda&&agenda.getBoundingClientRect().top<innerHeight};
     });
     assert.ok(metrics.scrollable,'Long Egyptian month can scroll at '+width);
     assert.ok(metrics.unit>=11,'Egyptian date signs need legible width at '+width);
     assert.ok(metrics.agendaVisible,'Month agenda must remain visible at '+width);
    }
    // A future appointment appears in the iPad's preview pane, without
    // occupying the phone calendar or duplicating appointment records.
    const future=await page.evaluate(async()=>{
      const storage=await import('./storage.js'),domain=await import('./scheduler.js'),cal=await import('./calendar.js');
      const sched=await storage.readRecord('scheduler');
      const now=new Date();
      const start=cal.dayNumber([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'))+3;
      const event=domain.createItem({title:'Upcoming tablet preview',startDay:start,startMinutes:720,endMinutes:780,calendarId:'personal'});
      domain.upsertItem(sched,event);await storage.writeRecord('scheduler',sched);
      return {id:event.id,start};
    });
    await page.reload();await page.locator('.month-agenda').waitFor();
    const upcoming=page.locator('.upcoming-section');
    assert.equal(await upcoming.isVisible(),width>=1024&&height>=560,'Upcoming previews belong only in the tablet split layout');
    if(width>=1024&&height>=560){
      const next=upcoming.locator('.upcoming-day[data-date="'+future.start+'"]');
      await next.waitFor();
      assert.ok((await next.innerText()).includes('Upcoming tablet preview'));
      await next.click();
    }else{
      await page.locator('.date[data-date="'+future.start+'"]').click();
    }
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    const openedScroll=await page.locator('#main-content').evaluate(el=>el.scrollTop);
    assert.ok(openedScroll>240,'Day should open near the first appointment rather than at midnight');
    await page.locator('[data-primary-view=today]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day','Today preserves the current Day view');
    await page.locator('[data-back]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    const preferences=await record(page,'preferences');
    assert.equal(preferences.reminders,false);
    // Outside-tap dismissal is the only close gesture for Settings and sub-panels.
    await page.locator('header [data-open-panel=settings]').click();
    assert.equal(await page.locator('[data-close-panel]').count(),0);
    await page.locator('.ux-panel-backdrop').click({position:{x:9,y:9}});
    assert.equal(await page.locator('.ux-panel').count(),0);
    await page.locator('header [data-open-panel=settings]').click();
    await page.locator('[data-open-panel=festivals]').click();
    await page.locator('.ux-panel-backdrop').click({position:{x:9,y:9}});
    assert.equal(await page.locator('.ux-panel').count(),0);
    await page.locator('header [data-open-panel=settings]').click();
    await page.locator('[data-open-panel=calendars]').click();
    await page.locator('.ux-panel-backdrop').click({position:{x:9,y:9}});
    assert.equal(await page.locator('.ux-panel').count(),0);
    await page.locator('header [data-open-panel=settings]').click();
    await page.locator('[data-backup]').click();
    assert.equal(await page.locator('.renpet-backup-panel').count(),1);
    assert.equal(await page.locator('[data-backup=close]').count(),0);
    await page.locator('.renpet-backup-overlay').click({position:{x:9,y:9}});
    assert.equal(await page.locator('.renpet-backup-panel').count(),0);
    await page.locator('header [data-open-panel=settings]').click();
    await page.locator('[name=gregorian]').uncheck();
    await page.locator('.ux-panel-backdrop').click({position:{x:9,y:9}});
    await page.locator('header [data-new]').click();
    assert.equal(await page.locator('#event-editor .date-preview').count(),0,'Hidden Gregorian date must not appear');
    await page.locator('#event-editor [name=title]').fill('Unsaved event '+width);
    await page.locator('.sheet-overlay').click({position:{x:9,y:9}});
    assert.equal(await page.locator('#event-editor').count(),0);
    assert.ok(!(await record(page,'scheduler')).items.some(i=>i.title==='Unsaved event '+width));
    await page.locator('header [data-new]').click();
    await page.locator('#event-editor [name=kind][value=reminder]').check();
    await page.locator('#event-editor [name=title]').fill('Unsaved reminder '+width);
    await page.locator('.sheet-overlay').click({position:{x:9,y:9}});
    assert.equal(await page.locator('#event-editor').count(),0);
    assert.ok(!(await record(page,'scheduler')).items.some(i=>i.title==='Unsaved reminder '+width));
    await page.screenshot({path:path.join(out,name+'-indexeddb.png'),fullPage:true});
    results.push({name,width,height,languageChecks:3,yearMonths:12,offlineData:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'mobile-ux.json'),JSON.stringify(results,null,2));
 console.log('RENPET_MOBILE_UX',JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
