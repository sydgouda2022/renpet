// Real-person journeys through Renpet, rather than isolated DOM smoke tests.
// Intended to reveal usability regressions on phone and tablet screens.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language,saveEvent}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
const issues=[],checks=[];
async function step(device,name,callback){
 try{const detail=await callback();checks.push({device,name,ok:true,detail:detail??null});}
 catch(error){const issue={device,name,error:String(error.stack||error)};issues.push(issue);checks.push({device,name,ok:false});console.error('USER_JOURNEY_ISSUE',JSON.stringify(issue));}
}
function pageErrors(page){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;
}
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 try{
  for(const [device,width,height] of [['iphone-compact',320,640],['iphone',390,844],['ipad-landscape',1194,834]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:true,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());
   const errors=pageErrors(page);
   try{
    await step(device,'open default calendar',async()=>{
     await boot(page);
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
     assert.equal(await page.locator('.time-rail').count(),1);
     const now=await page.locator('.time-panel[data-stream-kind=month]').nth(2).getAttribute('data-focus-day');
     assert.ok(now,'Month should have a selected date');
    });
    await step(device,'month to day and back via top-right month name',async()=>{
     await page.locator('.time-panel[data-stream-kind=month]').nth(2).locator('button.date[data-date]').nth(12).click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'day');
     const month=page.locator('header [data-up-level] .ux-month-value');
     assert.ok((await month.innerText()).trim().length>2,'Month name missing');
     await page.locator('header [data-up-level]').click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    });
    await step(device,'full year is reachable and all month tiles tappable',async()=>{
     await page.locator('header [data-up-level]').click();
     const current=page.locator('.time-panel[data-stream-kind=year]').nth(1);
     assert.equal(await current.locator('.year-month').count(),12);
     assert.equal(await current.locator('.year-season').count(),3);
     const seasonGeometry=await current.evaluate(p=>({
      panelHeight:p.getBoundingClientRect().height,
      clientHeight:document.querySelector('#main-content').clientHeight,
      months:[...p.querySelectorAll('.year-month')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),
      season:[...p.querySelectorAll('.year-season')].map(e=>({width:e.getBoundingClientRect().width,skin:getComputedStyle(e).backgroundImage}))
     }));
     for(const item of seasonGeometry.season)assert.ok(item.skin.includes('.webp'), 'Season artwork must be visible');
     await page.screenshot({path:path.join(out,'real-'+device+'-year.png')});
     await current.locator('[data-open-month="7"]').click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
     return seasonGeometry;
    });
    await step(device,'settings show full options without opening language submenu',async()=>{
     await page.locator('header [data-open-panel=settings]').click();
     assert.ok(await page.locator('.ux-panel[data-panel=settings]').isVisible());
     assert.ok(await page.locator('.ux-panel [name=language]').isVisible());
     assert.ok(await page.locator('.ux-panel [name=week]').isVisible());
     assert.ok(await page.locator('.ux-panel [name=gregorian]').count());
     await page.locator('.ux-panel-backdrop').click({position:{x:5,y:5}});
     assert.equal(await page.locator('.ux-panel').count(),0);
    });
    await step(device,'language switch and week defaults survive refresh',async()=>{
     await language(page,'cop');
     assert.equal(await page.locator('.month-section').nth(2).getAttribute('data-week'),'10');
     await page.reload();await page.locator('.time-rail').waitFor();
     assert.equal(await page.locator('body').getAttribute('data-language'),'cop');
     assert.equal(await page.locator('.month-section').nth(2).getAttribute('data-week'),'10');
     await language(page,'egy');
     assert.equal(await page.locator('.month-section').nth(2).getAttribute('data-week'),'10');
     await language(page,'ar');
     assert.equal(await page.locator('.month-section').nth(2).getAttribute('data-week'),'7');
    });
    await step(device,'add appointment save, see it immediately and after reload',async()=>{
     await page.locator('[data-primary-view=today]').click();
     const item=await saveEvent(page,'User journey '+device);
     assert.equal(await page.locator('body').getAttribute('data-view'),'day');
     const matches=await page.locator('.timeline-event[data-edit="'+item.id+'"]').count();
     assert.ok(matches,'Saved appointment should be visible on its own day');
     await page.reload();await page.locator('.time-rail').waitFor();
     assert.ok((await record(page,'scheduler')).items.some(i=>i.id===item.id),'Saved item must survive reload');
     return {id:item.id,day:item.startDay};
    });
    await step(device,'search for saved appointment and navigate to result',async()=>{
     await page.locator('header [data-search]').click();
     const input=page.locator('.search-panel [name=query]');
     await input.fill('User journey '+device);
     const results=page.locator('.search-results [data-result]');
     assert.ok(await results.count(),'Search should find the event');
     await results.first().click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'day');
     assert.equal(await page.locator('.search-panel').count(),0);
    });
    await step(device,'edit appointment then dismiss without saving',async()=>{
     const event=(await record(page,'scheduler')).items.find(x=>x.title==='User journey '+device);
     const eventBlock=page.locator('.timeline-event[data-edit="'+event.id+'"]');
     await eventBlock.locator('.event-drag').click();
     const editor=page.locator('#event-editor');
     await editor.locator('[name=title]').fill('Cancelled edit '+device);
     await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
     assert.equal(await page.locator('#event-editor').count(),0);
     assert.equal((await record(page,'scheduler')).items.find(i=>i.id===event.id).title,'User journey '+device);
    });
    await step(device,'edit appointment and explicitly save',async()=>{
     const event=(await record(page,'scheduler')).items.find(x=>x.title==='User journey '+device);
     await page.locator('.timeline-event[data-edit="'+event.id+'"] .event-drag').click();
     await page.locator('#event-editor [name=title]').fill('Updated journey '+device);
     await page.locator('#event-editor .save-button').click();
     await page.locator('#event-editor').waitFor({state:'detached'});
     assert.equal((await record(page,'scheduler')).items.find(i=>i.id===event.id).title,'Updated journey '+device);
    });
    await step(device,'appointments list shows item and quick delete works',async()=>{
     await page.locator('[data-appointments]').click();
     const panel=page.locator('.ux-panel[data-panel=appointments]');
     const event=(await record(page,'scheduler')).items.find(x=>x.title==='Updated journey '+device);
     assert.ok(await panel.locator('[data-edit="'+event.id+'"]').count());
     await panel.locator('[data-quick-delete="'+event.id+'"]').click();
     assert.ok(!(await record(page,'scheduler')).items.some(i=>i.id===event.id),'Delete must remove saved item');
     await page.locator('.ux-panel-backdrop').click({position:{x:5,y:5}});
    });
    await step(device,'custom recurrence every six days remains visible',async()=>{
     await page.locator('header [data-new]').click();
     const editor=page.locator('#event-editor');
     await editor.locator('[name=title]').fill('Repeat every six '+device);
     await editor.locator('[name=repeat]').selectOption('custom');
     await editor.locator('[name=repeatEvery]').selectOption('6');
     await editor.locator('[name=repeatUnit]').selectOption('day');
     assert.ok(await editor.locator('.repeat-preview').isVisible());
     await editor.locator('.save-button').click();
     await editor.waitFor({state:'detached'});
     const saved=(await record(page,'scheduler')).items.find(i=>i.title==='Repeat every six '+device);
     assert.ok(saved&&saved.repeat==='custom'&&saved.repeatEvery===6&&saved.repeatUnit==='day');
     const follows=await page.evaluate(async day=>{
      const {itemsForDay}=await import('./scheduler.js');
      const {readRecord}=await import('./storage.js');
      const state=await readRecord('scheduler');return itemsForDay(state,day+6);
     },saved.startDay);
     assert.ok(follows.some(x=>x.id===saved.id),'Next occurrence missing');
    });
    await step(device,'Today returns to the current timeframe',async()=>{
     await page.locator('header [data-up-level]').click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
     await page.locator('[data-primary-view=today]').click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
     await page.locator('.time-panel[data-stream-kind=month]').nth(2).locator('button.date[data-date]').first().click();
     await page.locator('[data-primary-view=today]').click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    });
    await step(device,'no broken visible controls and no uncaught errors',async()=>{
     assert.deepEqual(errors,[],'Unhandled page errors');
     const survey=await page.evaluate(()=>{
      const all=[...document.querySelectorAll('button')].filter(el=>{
       const cs=getComputedStyle(el),r=el.getBoundingClientRect();
       return cs.visibility==='visible'&&cs.display!=='none'&&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+3&&r.bottom<=innerHeight+3;
      });
      const unnamed=all.filter(el=>!el.getAttribute('aria-label')&&!el.textContent.trim()&&!el.querySelector('svg[aria-label]'));
      return {visibleButtons:all.length,unnamed:unnamed.length,unnamedSample:unnamed.slice(0,4).map(el=>el.outerHTML.slice(0,180)),horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
     });
     assert.ok(survey.horizontalOverflow<=3,'Horizontal overflow');
     assert.equal(survey.unnamed,0,'Unlabeled icon buttons');
     await page.screenshot({path:path.join(out,'real-'+device+'-day.png')});
     return survey;
    });
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'real-user-journeys.json'),JSON.stringify({checks,issues},null,2));
 console.log('RENPET_REAL_USER_AUDIT',JSON.stringify({checks,issues}));
 if(issues.length){process.exitCode=1;console.error('RENPET_REAL_USER_ISSUES',issues.length);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
