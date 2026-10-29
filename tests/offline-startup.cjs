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
    await context.setOffline(true);
    if(name==='chromium'){
     await page.reload({waitUntil:'domcontentloaded'});
     await page.locator('.month-agenda').waitFor({timeout:18000});
     assert.ok((await record(page,'scheduler')).items.some(i=>i.id===event.id),'Offline reload lost IndexedDB appointment');
    }else{
     const state=await record(page,'scheduler');
     assert.ok(state.items.some(i=>i.id===event.id),'WebKit offline lost IndexedDB data');
    }
    results.push({engine:name,width,offlineAssets:true,localAppointment:true,offlineNavigation:name==='chromium'});
   }finally{await context.close();}
  }
  // A startup failure must display a retry action, not an empty page.
  const context=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(22000);
  try{
   await boot(page);
   await page.route('**/app.js?v=*',route=>route.abort('failed'));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.renpet-startup-failed').waitFor({timeout:20000});
   await page.unroute('**/app.js?v=*');
   await page.locator('[data-retry]').click();
   await page.locator('.month-agenda').waitFor();
   results.push({engine:name,recovery:true});
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
