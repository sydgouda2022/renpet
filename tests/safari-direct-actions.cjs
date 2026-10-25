const {webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
const results=[],issues=[];
const assert=(v,msg)=>{if(!v)throw Error(msg);};
const titleFor={ar:'وقت قابل للتمديد',cop:'Ⲣⲁⲛ ⲧⲏⲣϥ',egy:'𓆓𓏏𓇳'};
async function main(){
 const browser=await webkit.launch();
 try{
  for(const [w,h] of [[375,667],[390,844]])for(const lang of ['ar','cop','egy']){
   const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    timezoneId:'Africa/Cairo',locale:'en-US',serviceWorkers:'block'});
   const p=await ctx.newPage();p.setDefaultTimeout(7000);
   p.on('dialog',d=>d.accept());
   p.on('pageerror',e=>issues.push({width:w,lang,jsError:String(e)}));
   try{
    await p.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await p.locator('.month-section').waitFor();
    await p.locator('[data-open-panel=settings]').click();
    await p.locator('select[name=language]').selectOption(lang);
    await p.locator('.ux-panel-backdrop').click({position:{x:8,y:8}});
    const seed=await p.evaluate(({title})=>{
     const now=new Date();
     const iso=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
     const day=Math.floor(Date.parse(iso+'T00:00:00Z')/86400000);
     const s=JSON.parse(localStorage.getItem('renpet.scheduler.v1'))||{version:1,calendars:[{id:'personal',name:{ar:'شخصي',cop:'ⲛⲟⲩⲓ',egy:'𓀀'},color:'#187568',visible:true}],items:[]};
     const id='gesture-'+Date.now()+Math.random().toString(36).slice(2);
     s.items.push({id,kind:'event',title,startDay:day,endDay:day,startMinutes:600,endMinutes:660,
      allDay:false,calendarId:s.calendars[0].id,alert:'none',repeat:'none',location:'',notes:'',
      completed:false,completedDays:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
     s.calendars[0].visible=true;
     localStorage.setItem('renpet.scheduler.v1',JSON.stringify(s));
     return {id,day};
    },{title:titleFor[lang]});
    await p.reload({waitUntil:'domcontentloaded'});
    await p.locator('.month-section').waitFor();
    const date=p.locator('[data-date="'+seed.day+'"]');
    await date.click();
    await p.locator('.day-page').waitFor();
    const block=p.locator('.timeline-event[data-edit="'+seed.id+'"]');
    await block.waitFor();
    const resize=block.locator('.event-resize');
    assert(await resize.count()===1,'Resize grip missing '+lang);
    const rect=await resize.boundingBox();
    assert(rect?.height>=24,'Resize grip not touchable '+JSON.stringify(rect));
    await resize.scrollIntoViewIfNeeded();
    const grip=await resize.boundingBox();
    // Real WebKit pointer sequence, with several intermediate move events.
    const x=grip.x+grip.width/2,y=grip.y+grip.height/2;
    await p.mouse.move(x,y);await p.mouse.down();
    await p.mouse.move(x,y+51,{steps:9});
    await p.mouse.up();
    const after=await p.evaluate(id=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items.find(i=>i.id===id),seed.id);
    assert(after && after.endMinutes>660,'Duration not stretched: '+JSON.stringify(after));
    assert(after.startMinutes===600,'Resize changed start time: '+JSON.stringify(after));
    assert((after.endMinutes-660)%15===0,'Resize increments must be 15 minutes: '+after.endMinutes);
    await p.reload({waitUntil:'domcontentloaded'});
    await p.locator('[data-date="'+seed.day+'"]').click();
    const persist=await p.evaluate(id=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items.find(i=>i.id===id),seed.id);
    assert(persist.endMinutes===after.endMinutes,'Resize did not survive reload');
    await p.locator('.timeline-event[data-edit="'+seed.id+'"] .event-delete-action').scrollIntoViewIfNeeded();
    const quick=p.locator('.timeline-event[data-edit="'+seed.id+'"] .event-delete-action');
    const delbox=await quick.boundingBox();
    await p.touchscreen.tap(delbox.x+delbox.width/2,delbox.y+delbox.height/2);
    assert(await p.locator('.timeline-event[data-edit="'+seed.id+'"]').count()===0,'Quick-delete did not remove Day event');
    const deleted=await p.evaluate(id=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items.some(i=>i.id===id),seed.id);
    assert(!deleted,'Quick-delete did not persist');
    // A second event can be deleted from Month agenda without opening editor.
    const second=await p.evaluate(day=>{
     const s=JSON.parse(localStorage.getItem('renpet.scheduler.v1'));
     const id='row-'+Date.now()+Math.random().toString(36).slice(2);
     s.items.push({id,title:'row delete test',kind:'event',startDay:day,endDay:day,startMinutes:900,endMinutes:960,
      allDay:false,calendarId:s.calendars[0].id,repeat:'none',alert:'none'});
     localStorage.setItem('renpet.scheduler.v1',JSON.stringify(s));
     return id;
    },seed.day);
    await p.reload({waitUntil:'domcontentloaded'});
    await p.locator('.month-section').waitFor();
    const row=p.locator('.event-row-shell:has(.event-row[data-edit="'+second+'"])');
    await row.waitFor();
    const rowDelete=row.locator('[data-quick-delete="'+second+'"]');
    assert(await rowDelete.count()===1,'Month quick-delete missing');
    await rowDelete.click();
    assert(await p.locator('.event-row[data-edit="'+second+'"]').count()===0,'Month quick-delete still visible');
    const remain=await p.evaluate(id=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items.some(i=>i.id===id),second);
    assert(!remain,'Month delete not stored');
    // List uses the same quick-delete button for a future appointment.
    const listId=await p.evaluate(day=>{
      const s=JSON.parse(localStorage.getItem('renpet.scheduler.v1'));
      const id='list-'+Date.now()+Math.random().toString(36).slice(2);
      s.items.push({id,title:'list delete test',kind:'event',startDay:day+1,endDay:day+1,
        startMinutes:660,endMinutes:720,allDay:false,calendarId:s.calendars[0].id,repeat:'none',alert:'none'});
      localStorage.setItem('renpet.scheduler.v1',JSON.stringify(s));return id;
    },seed.day);
    await p.reload({waitUntil:'domcontentloaded'});
    await p.locator('.month-section').waitFor();
    await p.locator('[data-primary-view=list]').click();
    const listRow=p.locator('.event-row-shell:has([data-edit="'+listId+'"])');
    await listRow.waitFor();
    await listRow.locator('[data-quick-delete="'+listId+'"]').click();
    const listStill=await p.evaluate(id=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items.some(i=>i.id===id),listId);
    assert(!listStill,'List direct deletion did not persist');
    await p.screenshot({path:path.join(out,'webkit-'+w+'-'+lang+'-direct-actions.png'),fullPage:true});
    results.push({width:w,language:lang,resizeFrom:660,resizeTo:after.endMinutes,deletedDay:true,deletedMonth:true,deletedList:true,verified:true});
   }catch(e){issues.push({width:w,lang,message:String(e.stack||e).slice(0,1250)});
    await p.screenshot({path:path.join(out,'webkit-'+w+'-'+lang+'-direct-actions-FAIL.png'),fullPage:true}).catch(()=>{});
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'safari-direct-actions.json'),JSON.stringify({results,issues},null,2));
 console.log('SAFARI_DIRECT_ACTIONS',JSON.stringify({results,issues}));
 if(issues.length||results.length!==6)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});