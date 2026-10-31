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
   ['iphone-compact',320,640],['iphone-small',375,667],['iphone',390,844],
   ['iphone-large',430,932],
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
    // Dense, simultaneous appointments must not collapse into unreadable
    // 30px columns. Open the full list, select one, or dismiss outside.
    const crowded=await page.evaluate(async day=>{
      const storage=await import('./storage.js'),domain=await import('./scheduler.js');
      const sched=await storage.readRecord('scheduler'),ids=[];
      for(let i=0;i<4;i++){
       const item=domain.createItem({title:'Shift overlap '+i,startDay:day,startMinutes:600,endMinutes:660,calendarId:'personal'});
       sched.items.push(item);ids.push(item.id);
      }
      await storage.writeRecord('scheduler',sched);return ids;
    },future.start);
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('.date[data-date="'+future.start+'"]').click();
    const cluster=page.locator('.timeline-crowded');
    await cluster.waitFor();
    assert.equal(await cluster.count(),1,'Four simultaneous items must form one accessible group');
    assert.equal(await page.locator('.timeline-event[data-edit="'+crowded[0]+'"]').count(),0);
    const clusterBounds=await cluster.boundingBox();
    assert.ok(clusterBounds&&clusterBounds.width>=150&&clusterBounds.height>=44,'Summary must be legible and tappable');
    await cluster.click();
    assert.equal(await page.locator('.crowded-choice').count(),4);
    assert.equal(await page.locator('.crowded-choice').first().isVisible(),true);
    assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('.crowded-sheet'))),true,'Crowded sheet traps focus');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.crowded-choice').last().evaluate(el=>el===document.activeElement),true,'Reverse Tab wraps inside sheet');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.crowded-choice').first().evaluate(el=>el===document.activeElement),true,'Tab wraps inside sheet');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.timeline-crowded').evaluate(el=>el===document.activeElement),true,'Escape restores group focus');
    await page.locator('.timeline-crowded').click();
    await page.locator('.crowded-backdrop').click({position:{x:6,y:6}});
    assert.equal(await page.locator('.crowded-sheet').count(),0,'Outside tap dismisses the group list');
    assert.equal(await page.locator('.timeline-crowded').evaluate(el=>el===document.activeElement),true,'Backdrop dismissal restores group focus');
    await page.locator('.timeline-crowded').click();
    await page.locator('.crowded-choice[data-crowded-edit="'+crowded[1]+'"]').click();
    assert.equal(await page.locator('#event-editor [name=title]').inputValue(),'Shift overlap 1');
    await page.locator('.sheet-overlay').click({position:{x:6,y:6}});
    assert.equal(await page.locator('.timeline-crowded').evaluate(el=>el===document.activeElement),true,'Discarding edit restores group focus');
    assert.equal((await record(page,'scheduler')).items.filter(i=>crowded.includes(i.id)).length,4,'Opening/closing group must not mutate appointments');
    // A long bridging event can overlap four simultaneous appointments,
    // but a later two-way overlap must still have its own readable block.
    const mixed=await page.evaluate(async day=>{
      const storage=await import('./storage.js'),domain=await import('./scheduler.js');
      const sched=await storage.readRecord('scheduler');
      const bridge=domain.createItem({title:'Bridge overlap',startDay:day,startMinutes:645,endMinutes:690,calendarId:'personal'});
      const later=domain.createItem({title:'Later separate appointment',startDay:day,startMinutes:675,endMinutes:720,calendarId:'personal'});
      sched.items.push(bridge,later);
      await storage.writeRecord('scheduler',sched);
      return {bridge:bridge.id,later:later.id};
    },future.start);
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('.date[data-date="'+future.start+'"]').click();
    assert.equal(await page.locator('.timeline-crowded').count(),1);
    await page.locator('.timeline-crowded').click();
    assert.equal(await page.locator('.crowded-choice').count(),5,'Only the five genuinely crowded events should be grouped');
    assert.equal(await page.locator('.crowded-choice[data-crowded-edit="'+mixed.later+'"]').count(),0,'Later event must not be hidden in group');
    await page.keyboard.press('Escape');
    const laterBlock=page.locator('.timeline-event[data-edit="'+mixed.later+'"]');
    assert.equal(await laterBlock.count(),1,'Later non-crowded event stays visible on timeline');
    const laterWidth=await laterBlock.evaluate(el=>el.getBoundingClientRect().width/el.parentElement.getBoundingClientRect().width);
    assert.ok(laterWidth>0.85,'Later event gets available width instead of ghost columns');
    // Adjacent short appointments have 46px minimum touch targets even
    // though their actual 15-minute duration is only 16px on this timeline.
    // The rendered targets must never hide or intercept one another.
    const shortDay=future.start+1;
    const shortItems=await page.evaluate(async day=>{
      const storage=await import('./storage.js'),domain=await import('./scheduler.js');
      const state=await storage.readRecord('scheduler');
      const times=[[600,615],[615,630],[630,645],[645,660],[690,750],[1410,1425],[1425,1440]];
      const ids=times.map(([startMinutes,endMinutes],n)=>{
        const item=domain.createItem({title:'Short slot '+n,startDay:day,startMinutes,endMinutes,calendarId:'personal'});
        state.items.push(item);return item.id;
      });
      await storage.writeRecord('scheduler',state);
      return ids;
    },shortDay);
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('.date[data-date="'+future.start+'"]').click();
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    const overlapErrors=await page.evaluate(()=>{
      const elements=[...document.querySelectorAll('.timeline-event,.timeline-crowded')];
      const rects=elements.map(e=>({label:e.dataset.edit||e.dataset.openCrowded,r:e.getBoundingClientRect()}));
      const errors=[];
      for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
        const a=rects[i],b=rects[j];
        const dx=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left);
        const dy=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top);
        if(dx>2&&dy>2)errors.push(a.label+' overlaps '+b.label);
      }
      const bounds=document.querySelector('.timeline-events').getBoundingClientRect();
      for(const row of rects){
        if(row.r.height<44)errors.push('Undersized touch target '+row.label);
        if(row.r.bottom>bounds.bottom+2)errors.push('Event beyond midnight '+row.label);
      }
      return errors;
    });
    assert.deepEqual(overlapErrors,[],'No two Day appointment touch targets may collide');
    const visible=await page.locator('.timeline-event').count();
    const groups=await page.locator('.timeline-crowded').count();
    assert.ok(groups+visible>0);
    if(width<700){
      assert.ok(groups>=1,'Phone groups adjacent 15-minute slots that would create 3 narrow lanes');
      await page.locator('.timeline-crowded').first().click();
      assert.ok(await page.locator('.crowded-choice').count()>=3,'All short events remain selectable');
      await page.keyboard.press('Escape');
    }else{
      assert.equal(await page.locator('.timeline-event[data-edit="'+shortItems[0]+'"]').count(),1,'iPad displays its first short appointment');
      assert.equal(await page.locator('.timeline-event[data-edit="'+shortItems[3]+'"]').count(),1,'iPad displays its last short appointment');
    }
    assert.equal((await record(page,'scheduler')).items.filter(i=>shortItems.includes(i.id)).length,7,
      'Visual grouping must not change or remove any stored appointment');
    // A longer appointment gets independently tappable move/resize grips
    // at every iPhone/iPad/desktop width, without blocking its scrollable body.
    const longId=await page.evaluate(async day=>{
      const storage=await import('./storage.js'),domain=await import('./scheduler.js');
      const state=await storage.readRecord('scheduler');
      const item=domain.createItem({title:'Long touch target',startDay:day,startMinutes:780,endMinutes:900,calendarId:'personal'});
      state.items.push(item);await storage.writeRecord('scheduler',state);return item.id;
    },shortDay);
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('.date[data-date="'+shortDay+'"]').click();
    const longBlock=page.locator('.timeline-event[data-edit="'+longId+'"]');
    await longBlock.waitFor();
    const longTargets=await longBlock.evaluate(el=>{
      const m=el.querySelector('.event-move'),r=el.querySelector('.event-resize');
      const a=m.getBoundingClientRect(),b=r.getBoundingClientRect();
      return {moveWidth:a.width,moveHeight:a.height,
       distinct:a.right<=b.left+1||b.right<=a.left+1,
       bodyTouch:getComputedStyle(el.querySelector('.event-drag')).touchAction};
    });
    assert.ok(longTargets.moveWidth>=44&&longTargets.moveHeight>=44&&longTargets.distinct,
      'Long appointment has an independent 44px move grip at '+width);
    assert.equal(longTargets.bodyTouch,'pan-y','Long event text is a scrollable/tappable surface');
    await longBlock.locator('.event-drag').click();
    assert.equal(await page.locator('#event-editor [name=title]').inputValue(),'Long touch target');
    await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===longId).startMinutes,780);
    // Two simultaneous one-hour appointments should remain readable on a
    // phone without sacrificing the existing direct Delete action.
    const pair=await page.evaluate(async day=>{
      const storage=await import('./storage.js'),domain=await import('./scheduler.js');
      const state=await storage.readRecord('scheduler');
      const a=domain.createItem({title:'First simultaneous shift',startDay:day,startMinutes:660,endMinutes:720,calendarId:'personal'});
      const b=domain.createItem({title:'Second simultaneous shift',startDay:day,startMinutes:675,endMinutes:735,calendarId:'personal'});
      state.items.push(a,b);await storage.writeRecord('scheduler',state);
      return {first:a.id,second:b.id};
    },shortDay+1);
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    const first=page.locator('.timeline-event[data-edit="'+pair.first+'"]');
    const second=page.locator('.timeline-event[data-edit="'+pair.second+'"]');
    await first.waitFor();await second.waitFor();
    const phone=width<700;
    assert.equal(await first.getAttribute('data-compact'),String(phone),
      'Side-by-side event controls respond to phone width '+width);
    assert.equal(await first.locator('.event-move,.event-resize').count(),phone?0:2,
      'Narrow phone cards edit move and duration in the full editor');
    assert.equal(await first.locator('[data-quick-delete]').count(),1,
      'Direct Delete remains present on overlapping appointments');
    const heading=await page.locator('.day-heading').evaluate(el=>getComputedStyle(el).display);
    assert.equal(heading,phone?'none':'flex','Avoid duplicate Day heading with Gregorian hidden');
    await first.locator('.event-drag').click();
    assert.equal(await page.locator('#event-editor [name=title]').inputValue(),'First simultaneous shift');
    assert.equal(await page.locator('#event-editor [name=start]').inputValue(),'11:00');
    await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
    await second.locator('[data-quick-delete]').click();
    assert.equal((await record(page,'scheduler')).items.some(i=>i.id===pair.second),false,
      'Direct Delete works on a compact overlapping appointment');
    assert.equal((await record(page,'scheduler')).items.some(i=>i.id===pair.first),true);
    await page.screenshot({path:path.join(out,name+'-indexeddb.png'),fullPage:true});
    results.push({name,width,height,languageChecks:3,yearMonths:12,offlineData:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'mobile-ux.json'),JSON.stringify(results,null,2));
 console.log('RENPET_MOBILE_UX',JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
