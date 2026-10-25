const {webkit,chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const dir='renpet-mobile-evidence';fs.mkdirSync(dir,{recursive:true});
const results=[],errors=[];
const ROOT='http://127.0.0.1:8765/';

async function scenario(engine,name) {
 const browser=await engine.launch(name==='chromium'?{channel:'chrome',headless:true,args:['--no-sandbox']}:{headless:true});
 try {
  // This scenario enables service workers (unlike other UI tests) to catch
  // the old ?v= asset cache miss which caused a lone hieroglyphic splash.
  for(const width of [375,390]){
   const ctx=await browser.newContext({
    viewport:{width,height:width===375?667:844},deviceScaleFactor:2,
    isMobile:true,hasTouch:true,serviceWorkers:'allow',timezoneId:'Africa/Cairo'
   });
   const p=await ctx.newPage();
   p.setDefaultTimeout(18000);
   try {
    await p.goto(ROOT,{waitUntil:'domcontentloaded'});
    await p.locator('.month-section').waitFor();
    await p.evaluate(()=>localStorage.setItem('renpet.startup-preserve','test-value'));
    // Wait for the entire SW installation, not just registration.
    await p.waitForFunction(()=>navigator.serviceWorker?.controller &&
      navigator.serviceWorker.controller.state==='activated',null,{timeout:100000});
    const release=await p.evaluate(async()=>(await (await fetch('./data.json')).json()).version);
    const moduleUrl=await p.evaluate(()=>document.querySelector('script[type="module"]')?.getAttribute('src'));
    const cacheNames=await p.evaluate(()=>caches.keys());
    if(!moduleUrl||!cacheNames.some(s=>s.startsWith('renpet-'+release+'-')))throw Error('Service worker release missing: '+release);
    // Regression: previous versions cached the obsolete six-source registry
    // forever. Inject that stale cached response and verify the new worker
    // retrieves the current four-source registry while online.
    const registry=await p.evaluate(async()=>{
     const key=(await caches.keys()).find(k=>k.startsWith('renpet-'));
     const cache=await caches.open(key);
     const uri=new URL('./festival-sources.json',location.href).href;
     const stale={schema:1,sources:[
      {id:'amun-theban'},{id:'national-egypt'},
      {id:'christian-coptic'},{id:'muslim-egypt'},
      {id:'esna-khnum'},{id:'isis-philae'}]};
     await cache.put(uri,new Response(JSON.stringify(stale),{
      headers:{'Content-Type':'application/json'}}));
     const response=await fetch('./festival-sources.json');
     if(!response.ok)throw Error('Online catalog revalidation failed');
     const sources=(await response.json()).sources.map(s=>s.id);
     return {sources,staleWasOverridden:sources.length===4&&
       !sources.includes('christian-coptic')&&!sources.includes('muslim-egypt')};
    });
    if(!registry.staleWasOverridden)throw Error('Old festival catalogs still served from cache: '+JSON.stringify(registry));
    // Linux Playwright's WebKit offline mode rejects SW-served fetches
    // and its network route emulation blocks navigation in Web Inspector.
    // Verify real CacheStorage availability even while offline, but reserve
    // full offline navigation assertions for Chromium and device testing.
    if(name==='webkit'){
     await ctx.setOffline(true);
     const direct=await p.evaluate(async(moduleUrl)=>{
      const uri=new URL(moduleUrl,location.href).href;
      const found=await caches.match(uri,{ignoreSearch:true});
      const artwork=await Promise.all(['akhet','peret','shemu'].map(async season=>
       !!(await caches.match(new URL('./assets/seasons/'+season+'.webp',location.href).href))));
      return {cached:!!found,content:found?(await found.text()).slice(0,60):'',artwork};
     },moduleUrl);
     if(!direct.cached||!direct.content.includes('import '))throw Error('WebKit offline CacheStorage missing app JS: '+JSON.stringify(direct));
     if(!direct.artwork.every(Boolean))throw Error('WebKit offline seasonal artwork missing');
     if(await p.evaluate(()=>localStorage.getItem('renpet.startup-preserve'))!=='test-value')throw Error('WebKit offline cache test lost data');
     results.push({engine:name,width,offlineCache:true,moduleStored:true,dataPreserved:true,offlineNavigation:'not supported by Playwright Web Inspector'});
     continue;
    }
    await ctx.setOffline(true);
    // Reproduce an installed PWA retaining the full retired catalogs, even
    // when network revalidation cannot replace them. The current app must
    // reject the stale sources before loading their cached festival packs.
    const currentManifest=JSON.parse(fs.readFileSync('renpet/web/festival-sources.json','utf8'));
    await p.evaluate(async({release,manifest})=>{
     const key=(await caches.keys()).find(k=>k.startsWith('renpet-'+release+'-'));
     const cache=await caches.open(key);
     const removed=[{id:'christian-coptic',category:'christian'},
      {id:'muslim-egypt',category:'muslim'}];
     for(const source of removed){
      source.status='available';source.name={ar:'مصدر قديم'};
      source.calendarRule='gregorian-annual';source.defaultEnabled=true;
      source.data={type:'file',path:'./festival-packs/'+source.id+'.json'};
      const pack={schema:1,sourceId:source.id,events:[{
       id:source.id+'-old',ar:'عيد قديم',month:10,day:6,duration:1}]};
      await cache.put(new URL(source.data.path,location.href).href,
       new Response(JSON.stringify(pack),{headers:{'Content-Type':'application/json'}}));
     }
     manifest.sources.push(...removed);
     await cache.put(new URL('./festival-sources.json',location.href).href,
      new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
     localStorage.setItem('renpet.settings.v1',JSON.stringify({language:'ar',gregorian:false,
      festivalSources:['amun-theban','national-egypt','christian-coptic','muslim-egypt'],weeks:{}}));
    },{release,manifest:currentManifest});
    const asset=await p.evaluate(async(moduleUrl)=>{
     const cacheKeys=await caches.keys();
     const fullUrl=new URL('./app.js',location.href).href;
     const cached=await caches.match(fullUrl);
     const matchWithVersion=await caches.match(new URL(moduleUrl,location.href).href,{ignoreSearch:true});
     const artwork=await Promise.all(['akhet','peret','shemu'].map(async season=>{
      const response=await fetch('./assets/seasons/'+season+'.webp');
      return response.ok&&(await response.arrayBuffer()).byteLength>20000;
     }));
     try{
      const response=await fetch(moduleUrl);
      return {ok:response.ok,type:response.headers.get('content-type'),text:(await response.text()).slice(0,65),
       cacheHit:!!cached,queryCacheHit:!!matchWithVersion,cacheKeys,artwork};
     }catch(error){
      return {ok:false,error:String(error),cacheHit:!!cached,queryCacheHit:!!matchWithVersion,cacheKeys};
     }
    },moduleUrl);
    if(!asset.ok||!asset.text?.includes('import '))throw Error('Offline query-string module failed: '+JSON.stringify(asset));
    if(!asset.artwork.every(Boolean))throw Error('Offline seasonal artwork failed: '+JSON.stringify(asset));
    await p.reload({waitUntil:'domcontentloaded'});
    await p.locator('.month-section').waitFor({timeout:24000});
    const preserved=await p.evaluate(()=>localStorage.getItem('renpet.startup-preserve'));
    if(preserved!=='test-value')throw Error('Offline reload lost local storage');
    await p.locator('[data-open-panel="settings"]').click();
    await p.locator('[data-open-panel="festivals"]').click();
    const sourceIds=await p.locator('[data-festival-source-id]').evaluateAll(nodes=>
     nodes.map(node=>node.dataset.festivalSourceId));
    if(JSON.stringify(sourceIds)!==JSON.stringify(['amun-theban','national-egypt','esna-khnum','isis-philae'])){
     throw Error('Offline startup revived retired festival options: '+JSON.stringify(sourceIds));
    }
    const migrated=await p.evaluate(()=>JSON.parse(localStorage.getItem('renpet.settings.v1')));
    if(JSON.stringify(migrated.festivalSources)!==JSON.stringify(['amun-theban','national-egypt'])||migrated.gregorian!==false){
     throw Error('Offline migration changed retained festival/Gregorian preferences: '+JSON.stringify(migrated));
    }
    await p.keyboard.press('Escape');
    await p.screenshot({path:path.join(dir,'offline-'+name+'-'+width+'.png'),fullPage:true});
    results.push({engine:name,width,offline:true,queryModule:true,dataPreserved:true,retiredCatalogsRejected:true});
   }catch(e){
    errors.push({engine:name,width,scenario:'offline',error:String(e.stack||e).slice(0,1200)});
    await p.screenshot({path:path.join(dir,'offline-'+name+'-'+width+'-FAILED.png'),fullPage:true}).catch(()=>{});
   }finally{await ctx.close();}
  }
  // Simulate a module graph failure. The user must not be left with a blank
  // screen; retry must restore the calendar without deleting local records.
  const ctx=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const p=await ctx.newPage();
  try {
   await p.goto(ROOT);await p.locator('.month-section').waitFor();
   await p.evaluate(()=>localStorage.setItem('renpet.startup-preserve','not-deleted'));
   await p.route('**/app.js?v=*',route=>route.abort('failed'));
   await p.reload({waitUntil:'domcontentloaded'});
   await p.locator('.renpet-startup-failed').waitFor({timeout:14000});
   const text=await p.locator('.renpet-startup-failed').innerText();
   if(!text.includes('Retry'))throw Error('No retry button for failed modules');
   await p.screenshot({path:path.join(dir,'recovery-'+name+'.png'),fullPage:true});
   await p.unroute('**/app.js?v=*');
   await p.locator('[data-retry]').click();
   await p.locator('.month-section').waitFor();
   if(await p.evaluate(()=>localStorage.getItem('renpet.startup-preserve'))!=='not-deleted')throw Error('Retry deleted local data');
   results.push({engine:name,recovery:true,retry:true,dataPreserved:true});
  }catch(e){errors.push({engine:name,scenario:'failed-module',error:String(e.stack||e).slice(0,1300)});}
  finally{await ctx.close();}
 }finally{await browser.close();}
}
async function main(){
 await scenario(webkit,'webkit');
 await scenario(chromium,'chromium');
 fs.writeFileSync(path.join(dir,'boot-offline-report.json'),JSON.stringify({results,errors},null,2));
 console.log('RENPET_OFFLINE_BOOT',JSON.stringify({results,errors}).slice(0,14000));
 if(errors.length||results.length!==6)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});

