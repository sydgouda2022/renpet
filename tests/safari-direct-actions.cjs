const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
async function seed(page,title){
 return page.evaluate(async title=>{
  const domain=await import('./scheduler.js'),storage=await import('./storage.js');
  const state=(await storage.readRecord('scheduler'))??domain.emptyState();
  const now=new Date(),day=Math.floor(Date.parse([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')+'T00:00:00Z')/86400000);
  const item=domain.createItem({title,startDay:day,startMinutes:600,endMinutes:660,calendarId:'personal'});
  state.items.push(item);
  await storage.writeRecord('scheduler',state);
  return item;
 },title);
}
async function main(){
 const browser=await webkit.launch({headless:true});
 const results=[];
 try{
  for(const [width,height] of [[375,667],[390,844]])for(const lang of ['ar','cop','egy']){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());
   try{
    await boot(page);await language(page,lang);
    const item=await seed(page,lang+' direct '+width);
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('[data-date="'+item.startDay+'"]').click();
    const block=page.locator('.timeline-event[data-edit="'+item.id+'"]');
    await block.waitFor();
    // On touch devices the body is a normal scrolling/tap surface.
    // Only the separate 44px move grip or the lower resize grip can drag.
    const controlState=await block.evaluate(el=>{
      const body=el.querySelector('.event-drag'),move=el.querySelector('.event-move');
      const resize=el.querySelector('.event-resize');
      const m=move?.getBoundingClientRect(),r=resize?.getBoundingClientRect();
      return {
        bodyTouch:getComputedStyle(body).touchAction,
        blockTouch:getComputedStyle(el).touchAction,
        moveTouch:getComputedStyle(move).touchAction,
        resizeTouch:getComputedStyle(resize).touchAction,
        moveWidth:m?.width,moveHeight:m?.height,
        resizeRight:r?.right,resizeLeft:r?.left,
        moveLeft:m?.left,moveRight:m?.right
      };
    });
    assert.equal(controlState.bodyTouch,'pan-y','Long event text must allow vertical touch scrolling');
    assert.equal(controlState.blockTouch,'pan-y','Long event card must allow vertical touch scrolling');
    assert.equal(controlState.moveTouch,'none','Only the move grip owns a touch drag');
    assert.equal(controlState.resizeTouch,'none','Only the resize grip owns a touch drag');
    assert.ok(controlState.moveWidth>=44&&controlState.moveHeight>=44,'Move grip is a full touch target');
    assert.ok(controlState.resizeRight<=controlState.moveLeft+1||
      controlState.moveRight<=controlState.resizeLeft+1,'Move and resize grips do not overlap');

    const touchGesture=async(selector,delta)=>{
      await block.evaluate((el,{selector,delta})=>{
        const grip=el.querySelector(selector),rect=grip.getBoundingClientRect();
        const x=rect.left+Math.min(rect.width/2,25),y=rect.top+Math.min(rect.height/2,20);
        for(const [type,dy] of [['pointerdown',0],['pointermove',delta],['pointerup',delta]]){
          grip.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,button:0,pointerId:301,pointerType:'touch',clientX:x,clientY:y+dy}));
        }
      },{selector,delta});
    };
    await touchGesture('.event-drag',48);
    assert.equal(await page.locator('#event-editor').count(),0,
      'A touch scroll begun on the appointment body cannot open a move preview');
    await touchGesture('.event-move',8);
    assert.equal(await page.locator('#event-editor').count(),0,
      'An 8px move-grip wobble cannot propose an appointment change');
    await touchGesture('.event-move',32);
    await page.locator('#event-editor').waitFor();
    assert.equal(await page.locator('#event-editor [name=start]').inputValue(),'10:30',
      'The move grip proposes a snapped time without storing it');
    assert.equal(await page.locator('#event-editor [name=end]').inputValue(),'11:30');
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===item.id).startMinutes,600);
    await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===item.id).startMinutes,600);
    await touchGesture('.event-resize',32);
    await page.locator('#event-editor').waitFor();
    assert.equal(await page.locator('#event-editor [name=start]').inputValue(),'10:00',
      'Resize grip cannot move the start');
    assert.equal(await page.locator('#event-editor [name=end]').inputValue(),'11:30');
    await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===item.id).endMinutes,660);

    const grip=block.locator('.event-resize');
    await grip.scrollIntoViewIfNeeded();
    const b=await grip.boundingBox();
    assert.ok(b&&b.height>=20,'Missing accessible resize grip');
    const x=b.x+b.width/2,y=b.y+b.height/2;
    // A tap on a long event's resize handle should open the editor, not
    // silently modify its end or leave the handle as a dead control.
    await grip.click();
    await page.locator('#event-editor').waitFor();
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===item.id).endMinutes,660);
    await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+51,{steps:8});await page.mouse.up();
    const editor=page.locator('#event-editor');
    await editor.waitFor();
    assert.equal(await editor.locator('[name=start]').inputValue(),'10:00','Resize does not shift appointment start');
    assert.ok((await editor.locator('[name=end]').inputValue())>'11:00','Proposed resized time should appear in the editor');
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===item.id).endMinutes,660,'Drag preview cannot silently save');
    await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
    assert.equal(await page.locator('#event-editor').count(),0);
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===item.id).endMinutes,660,'Outside dismissal discards resize');
    // Repeat and explicitly save the proposed duration to confirm it.
    const newBlock=page.locator('.timeline-event[data-edit="'+item.id+'"]');
    const newGrip=newBlock.locator('.event-resize');
    await newGrip.scrollIntoViewIfNeeded();
    const next=await newGrip.boundingBox();
    const xx=next.x+next.width/2,yy=next.y+next.height/2;
    await page.mouse.move(xx,yy);await page.mouse.down();await page.mouse.move(xx,yy+51,{steps:8});await page.mouse.up();
    await page.locator('#event-editor .save-button').click();
    await page.locator('.save-confirmation').waitFor();
    await page.waitForFunction(async id=>{
     const state=await(await import('./storage.js')).readRecord('scheduler');
     return state?.items.some(i=>i.id===id&&i.endMinutes>660);
    },item.id,{timeout:8000});
    await page.locator('[data-back]').click();
    const row=page.locator('.event-row-shell:has([data-edit="'+item.id+'"])');
    await row.waitFor();
    await row.locator('[data-quick-delete="'+item.id+'"]').click();
    await page.waitForFunction(async id=>!(await(await import('./storage.js')).readRecord('scheduler'))?.items.some(x=>x.id===id),item.id);
    assert.ok(!(await record(page,'scheduler')).items.some(i=>i.id===item.id));
    // Short cards reserve the entire 46px target for tap-to-edit. A finger
    // moving over them must not start a hidden drag or intercept Day scrolling.
    const short=await page.evaluate(async()=>{
      const domain=await import('./scheduler.js'),storage=await import('./storage.js');
      const state=await storage.readRecord('scheduler');
      const now=new Date();
      const day=Math.floor(Date.parse([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')+'T00:00:00Z')/86400000);
      const event=domain.createItem({title:'Quarter-hour touch test',startDay:day,startMinutes:840,endMinutes:855,calendarId:'personal'});
      state.items.push(event);
      await storage.writeRecord('scheduler',state);
      return {id:event.id,day};
    });
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('[data-date="'+short.day+'"]').click();
    const shortBlock=page.locator('.timeline-event[data-edit="'+short.id+'"]');
    await shortBlock.waitFor();await shortBlock.scrollIntoViewIfNeeded();
    assert.equal(await shortBlock.locator('.event-resize').count(),0,'Short appointment must not steal tap space for a resize grip');
    assert.equal(await shortBlock.evaluate(el=>getComputedStyle(el).touchAction),'pan-y',
      'Vertical scroll remains available when a gesture starts on a short event');
    await shortBlock.evaluate(el=>{
      const rect=el.getBoundingClientRect(), x=rect.x+rect.width/2, y=rect.y+rect.height/2;
      for(const [type,delta] of [['pointerdown',0],['pointermove',40],['pointerup',40]])
       el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:303,button:0,clientX:x,clientY:y+delta}));
    });
    assert.equal(await page.locator('#event-editor').count(),0,'Touch movement alone cannot launch a short-event drag preview');
    const hit=await shortBlock.locator('.event-drag').boundingBox();
    await page.touchscreen.tap(hit.x+hit.width/2,hit.y+hit.height/2);
    await page.locator('#event-editor').waitFor();
    assert.equal(await page.locator('#event-editor [name=end]').inputValue(),'14:15');
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===short.id).endMinutes,855,'Tap cannot modify stored duration');
    await page.locator('#event-editor [data-time-open=end]').click();
    await page.locator('#event-editor [data-time-minute="45"]').click();
    await page.locator('#event-editor [data-time-confirm]').click();
    assert.equal(await page.locator('#event-editor [name=end]').inputValue(),'14:45');
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===short.id).endMinutes,855,'Picker is still a draft');
    await page.locator('#event-editor .save-button').click();
    await page.locator('.save-confirmation').waitFor();
    assert.equal((await record(page,'scheduler')).items.find(i=>i.id===short.id).endMinutes,885,
      'Explicit Save updates the original appointment');
    // A recurring appointment is still a series: dragging one occurrence
    // must never mutate the parent until Save, and it must not affect future days.
    const repeat=await page.evaluate(async title=>{
     const domain=await import('./scheduler.js'),storage=await import('./storage.js');
     const state=await storage.readRecord('scheduler');
     const now=new Date(),day=Math.floor(Date.parse([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')+'T00:00:00Z')/86400000);
     const recurring=domain.createItem({title,startDay:day-10,startMinutes:600,endMinutes:660,calendarId:'personal',repeat:'egy10'});
     state.items.push(recurring);await storage.writeRecord('scheduler',state);
     return {id:recurring.id,day};
    },lang+' recurring '+width);
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('[data-date="'+repeat.day+'"]').click();
    const recurringBlock=page.locator('.timeline-event[data-edit="'+repeat.id+'"]');
    await recurringBlock.waitFor();
    const recurringGrip=recurringBlock.locator('.event-resize');
    await recurringGrip.scrollIntoViewIfNeeded();
    const rc=await recurringGrip.boundingBox();
    assert.ok(rc&&rc.height>=20,'Recurring appointment exposes a resize handle');
    const rx=rc.x+rc.width/2,ry=rc.y+rc.height/2;
    await page.mouse.move(rx,ry);await page.mouse.down();await page.mouse.move(rx,ry+51,{steps:8});await page.mouse.up();
    await page.locator('#event-editor').waitFor();
    assert.equal(await page.locator('[name=repeatScope][value=one]').isChecked(),true);
    assert.ok((await page.locator('#event-editor [name=end]').inputValue())>'11:00');
    let unchanged=(await record(page,'scheduler')).items.find(i=>i.id===repeat.id);
    assert.equal(unchanged.endMinutes,660,'Drag preview must not modify the parent recurrence');
    assert.ok(!(unchanged.excludedDays||[]).includes(repeat.day));
    await page.locator('.sheet-overlay').click({position:{x:5,y:5}});
    unchanged=(await record(page,'scheduler')).items.find(i=>i.id===repeat.id);
    assert.equal(unchanged.endMinutes,660,'Outside tap leaves the recurring series unchanged');
    assert.ok(!(unchanged.excludedDays||[]).includes(repeat.day));
    const restored=page.locator('.timeline-event[data-edit="'+repeat.id+'"] .event-resize');
    await restored.scrollIntoViewIfNeeded();
    const rb=await restored.boundingBox(),rxx=rb.x+rb.width/2,ryy=rb.y+rb.height/2;
    await page.mouse.move(rxx,ryy);await page.mouse.down();await page.mouse.move(rxx,ryy+51,{steps:8});await page.mouse.up();
    await page.locator('[name=repeatScope][value=one]').check();
    await page.locator('#event-editor .save-button').click();
    await page.locator('.save-confirmation').waitFor();
    const persisted=await record(page,'scheduler');
    const series=persisted.items.find(i=>i.id===repeat.id);
    assert.ok(series,'Save must retain the parent recurring series');
    assert.equal(series.endMinutes,660,'The parent repeat time remains unchanged');
    assert.ok(series.excludedDays.includes(repeat.day),'Only the edited occurrence is excluded');
    const exception=persisted.items.find(i=>i.id!==repeat.id&&i.repeat==='none'&&i.startDay===repeat.day&&i.title===series.title);
    assert.ok(exception&&exception.endMinutes>660,'Save creates one updated single occurrence');
    const nextOccurs=await page.evaluate(async({id,day})=>{
     const domain=await import('./scheduler.js'),storage=await import('./storage.js');
     const state=await storage.readRecord('scheduler'),item=state.items.find(i=>i.id===id);
     return domain.occursOn(item,day+10);
    },repeat);
    assert.equal(nextOccurs,true,'Future repeats must remain scheduled');
    await page.screenshot({path:path.join(out,'webkit-'+width+'-'+lang+'-direct.png'),fullPage:true});
    results.push({width,lang,touchMoveGrip:true,touchScrollBody:true,resizePreview:true,outsideDiscard:true,explicitSave:true,recurringOccurrenceResize:true,seriesPreserved:true,delete:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'safari-direct-actions.json'),JSON.stringify(results,null,2));
 console.log('RENPET_SAFARI_DIRECT',JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
