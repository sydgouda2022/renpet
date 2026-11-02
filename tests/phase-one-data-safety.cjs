const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {ROOT,boot,record,saveEvent}=require('./browser-tools.cjs');

async function verify(engine,name){
 const browser=await engine.launch(name==='chromium'?
  {channel:'chrome',headless:true,args:['--no-sandbox']}:{headless:true});
 const passed=[];
 try{
  // Losing the optional public calendar must never hide local appointments.
  {
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
   const page=await context.newPage();
   try{
    await page.route('**/festival-packs/national-egypt.json',route=>
     route.fulfill({status:503,contentType:'application/json',body:'{}'}));
    await boot(page);
    await page.locator('[data-open-panel=settings]').click();
    await page.locator('.festival-load-notice').waitFor();
    await page.unroute('**/festival-packs/national-egypt.json');
    await page.locator('[data-retry-festivals]').click();
    await page.locator('.festival-load-notice').waitFor({state:'detached'});
    assert.equal(await page.locator('.time-rail').count(),1);
    passed.push('optional catalog failure and explicit retry');
   }finally{await context.close();}
  }
  // If IndexedDB was corrupted, the original raw data must remain
  // recoverable and no empty calendar should silently replace it.
  {
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
   const page=await context.newPage();
   page.on('dialog',dialog=>dialog.accept());
   try{
    await boot(page);
    await page.evaluate(async()=>{const s=await import('./storage.js');await s.writeRecord('scheduler',{items:'unreadable'});});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-export-raw]').waitFor();
    assert.deepEqual(await record(page,'scheduler'),{items:'unreadable'});
    await page.locator('[data-export-raw]').click();
    assert.match(await page.locator('[data-recovery-error]').textContent(),/تنزيل/);
    await page.locator('[data-reset-calendar]').click();
    await page.locator('.time-rail').waitFor({timeout:20000});
    assert.deepEqual((await record(page,'scheduler')).items,[]);
    passed.push('non-destructive corruption recovery');
   }finally{await context.close();}
  }
  // Two tabs editing the same scheduler cannot overwrite each other.
  {
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
   const first=await context.newPage(),stale=await context.newPage();
   try{
    await boot(first);await boot(stale);
    await saveEvent(first,'Saved in first tab');
    const result=await stale.evaluate(async()=>{
     const storage=await import('./storage.js');
     const scheduler=await import('./scheduler.js');
     try{await storage.writeRecord('scheduler',scheduler.emptyState());return 'unsafe-write';}
     catch(error){return error.name;}
    });
    assert.equal(result,'StorageConflictError');
    assert.ok((await record(first,'scheduler')).items.some(item=>item.title==='Saved in first tab'));
    await stale.reload({waitUntil:'domcontentloaded'});
    await stale.locator('.time-rail').waitFor();
    await saveEvent(stale,'Saved after reload');
    assert.ok((await record(stale,'scheduler')).items.some(item=>item.title==='Saved in first tab'));
    passed.push('atomic stale-tab conflict protection');
   }finally{await context.close();}
  }
  // A restored calendar must have an atomically captured pre-restore copy.
  {
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},acceptDownloads:true});
   const page=await context.newPage();
   page.on('dialog',dialog=>dialog.accept());
   try{
    await boot(page);
    await saveEvent(page,'Existing before restore');
    const current=await record(page,'scheduler');
    const backup=await page.evaluate(async()=>{
     const {createBackup}=await import('./backup-core.mjs');
     const {emptyState,createItem}=await import('./scheduler.js');
     const {dayNumber}=await import('./calendar.js');
     const state=emptyState();
     state.items.push(createItem({title:'From restored file',startDay:dayNumber('2026-10-30')}));
     return createBackup({scheduler:state,preferences:{language:'ar',gregorian:true,dynamicLighting:true,showHolidays:true,weeks:{}}});
    });
    await page.locator('[data-open-panel=settings]').click();
    await page.locator('[data-backup]').click();
    const pick=page.waitForEvent('filechooser');
    await page.locator('[data-backup="import"]').click();
    await (await pick).setFiles({name:'test-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
    await page.locator('.time-rail').waitFor({timeout:20000});
    await page.waitForFunction(async()=>{const s=await import('./storage.js');const state=await s.readRecord('scheduler');return state.items.some(e=>e.title==='From restored file');});
    const snap=await record(page,'restoreSnapshot');
    assert.ok(snap.scheduler.items.some(e=>e.title==='Existing before restore'));
    assert.ok(!(await record(page,'scheduler')).items.some(e=>e.title==='Existing before restore'));
    await page.locator('[data-open-panel=settings]').click();
    await page.locator('[data-backup]').click();
    await page.locator('[data-backup="undo"]').waitFor();
    await page.locator('[data-backup="undo"]').click();
    await page.waitForFunction(async()=>{const s=await import('./storage.js');const state=await s.readRecord('scheduler');return state.items.some(e=>e.title==='Existing before restore');});
    assert.ok(!(await record(page,'scheduler')).items.some(e=>e.title==='From restored file'));
    assert.equal(current.items.length,1);
    passed.push('atomic restore rollback and explicit undo');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 console.log('RENPET_DATA_SAFETY',JSON.stringify({engine:name,passed}));
}
(async()=>{await verify(chromium,'chromium');await verify(webkit,'webkit');})().catch(err=>{
 console.error(err);process.exitCode=1;
});
