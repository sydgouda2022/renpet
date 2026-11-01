const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {ROOT,boot,record,saveEvent}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
async function scenario(engine,name){
 const browser=await engine.launch(name==='chromium'?{channel:'chrome',headless:true,args:['--no-sandbox']}:{headless:true});
 const results=[];
 try{
  for(const width of [375,390]){
   const context=await browser.newContext({viewport:{width,height:width===375?667:844},isMobile:true,hasTouch:true,serviceWorkers:'allow',timezoneId:'Africa/Cairo'});
   const page=await context.newPage();page.setDefaultTimeout(25000);page.on('dialog',d=>d.accept());
   try{
    await boot(page);
    const event=await saveEvent(page,'Offline '+name+' '+width);
    await page.waitForFunction(()=>navigator.serviceWorker?.controller?.state==='activated',null,{timeout:45000});
    const cache=await page.evaluate(async()=>{
     const keys=await caches.keys();
     const worker=keys.filter(k=>k.startsWith('renpet-'));
     const app=await caches.match(new URL('./app.js',location.href).href,{ignoreSearch:true});
     const storage=await(await import('./storage.js')).readRecord('scheduler');
     return {worker,app:!!app,stored:!!storage?.items?.length};
    });
    assert.ok(cache.worker.length&&cache.app&&cache.stored,'Missing packaged offline resources or appointment');
    if(name==='chromium'){
     // Chromium's offline transport supports a real navigation from a SW cache.
     await context.setOffline(true);
     await page.reload({waitUntil:'domcontentloaded'});
     await page.locator('.time-rail').waitFor({timeout:18000});
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    }else{
     // Linux Playwright WebKit throws an internal browser error on
     // context.setOffline(true)+reload even with a controlling SW.
     // A separate redirected-shell test exercises WebKit's offline fallback
     // by making the source server unavailable (HTTP 503) instead.
     await context.setOffline(true);
    }
    assert.ok((await record(page,'scheduler')).items.some(i=>i.id===event.id),
      name+' offline check lost IndexedDB appointment');
    results.push({engine:name,width,offlineAssets:true,localAppointment:true,
      offlineNavigation:name==='chromium',webkitFallbackTestedSeparately:name==='webkit'});
   }finally{await context.close();}
  }
  // The raw document must remain understandable without JavaScript.
  const noScriptContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:375,height:667},serviceWorkers:'block'});
  const noScriptPage=await noScriptContext.newPage();
  try{
   await noScriptPage.goto(ROOT,{waitUntil:'domcontentloaded'});
   assert.ok(await noScriptPage.locator('.nojs-fallback').isVisible(),'No-script explanation is not visible');
   assert.equal(await noScriptPage.locator('#app>.loading').isVisible(),false,'No-script visitors still see the loading splash');
   assert.match(await noScriptPage.locator('.nojs-fallback h1').textContent(),/رنبت/);
   results.push({engine:name,noScript:true});
  }finally{await noScriptContext.close();}
  // A startup failure must display a retry action, not an empty page.
  const context=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(22000);
  try{
   await boot(page);
   // The skip link must move keyboard focus to the real main landmark.
   await page.locator('.skip-to-calendar').focus();
   await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>document.activeElement?.id),'main-content','Skip link did not focus the calendar');
   await page.route('**/app.js?v=*',route=>route.abort('failed'));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.renpet-startup-failed').waitFor({timeout:20000});
   assert.equal(await page.locator('.renpet-startup-failed').getAttribute('id'),'main-content');
   assert.equal(await page.locator('.renpet-startup-failed').getAttribute('tabindex'),'-1');
   assert.equal(await page.locator('#renpet-status').textContent(),'تعذّر تشغيل تقويم رنبت');
   await page.unroute('**/app.js?v=*');
   await page.locator('[data-retry]').click();
   await page.locator('.time-rail').waitFor();
   assert.equal(await page.locator('#renpet-status').textContent(),'اكتمل تحميل تقويم رنبت');
   results.push({engine:name,recovery:true,skipLink:true,announcements:true});
  }finally{await context.close();}
 }finally{await browser.close();}
 return results;
}
async function main(){
 const r=[...await scenario(webkit,'webkit'),...await scenario(chromium,'chromium')];
 fs.writeFileSync(path.join(out,'boot-offline-report.json'),JSON.stringify(r,null,2));
 console.log('RENPET_OFFLINE',JSON.stringify(r));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
