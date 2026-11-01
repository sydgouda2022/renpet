// Reproduce Cloudflare's /index.html -> / canonical redirect.
// Safari must open Renpet offline after a completely new page navigation,
// not merely keep a previously-loaded JavaScript app running.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const root=path.resolve(__dirname,'../web');
const MIME={
 '.html':'text/html; charset=utf-8',
 '.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8',
 '.webmanifest':'application/manifest+json',
 '.svg':'image/svg+xml',
 '.png':'image/png',
 '.webp':'image/webp',
 '.ttf':'font/ttf'
};
async function startServer(){
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1:8766');
   if(url.pathname==='/index.html'){
    // The redirect is the regression trigger. The old SW stores its
    // final response under /index.html and Safari rejects it offline.
    res.writeHead(302,{Location:'/', 'Cache-Control':'no-store'});res.end();return;
   }
   const name=decodeURIComponent(url.pathname);
   const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
   if(!file.startsWith(root+path.sep))throw Error('Invalid path');
   const bytes=await fs.readFile(file);
   const ext=path.extname(file);
   res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':'no-store'});
   res.end(bytes);
  }catch(error){res.writeHead(404);res.end(String(error.message||error));}
 });
 server.listen(8766,'127.0.0.1');
 await once(server,'listening');
 return server;
}
async function verify(engine,name){
 const browser=await engine.launch(name==='chromium'?{channel:'chrome',headless:true,args:['--no-sandbox']}:{headless:true});
 try{
  const context=await browser.newContext({
   viewport:{width:390,height:844},isMobile:true,hasTouch:true,
   serviceWorkers:'allow',timezoneId:'Africa/Cairo'
  });
  try{
   const page=await context.newPage();
   page.setDefaultTimeout(35000);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
   await page.locator('.time-rail').waitFor();
   await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated',null,{timeout:45000});
   // A second controlled online navigation must also be valid.
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.time-rail').waitFor();
   const cached=await page.evaluate(async()=>{
    const cacheNames=(await caches.keys()).filter(key=>key.startsWith('renpet-'));
    const cache=await caches.open(cacheNames.at(-1));
    const html=await cache.match('./index.html');
    return {names:cacheNames,exists:!!html,redirected:html?.redirected,url:html?.url};
   });
   assert.ok(cached.exists, name+' must cache an offline HTML shell');
   assert.equal(cached.redirected,false,name+' must not cache followed HTML redirects: '+JSON.stringify(cached));
   // This is a fresh navigation: don't count the already-running app as
   // offline support (that was the previous WebKit test's blind spot).
   await context.setOffline(true);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.time-rail').waitFor({timeout:25000});
   assert.equal(await page.locator('body').getAttribute('data-view'),'month');
   assert.deepEqual(errors,[],name+' offline navigation must have no unhandled errors');
   const nav=await page.evaluate(()=>({
    url:location.pathname,controller:!!navigator.serviceWorker.controller,
    page:!!document.querySelector('.time-rail'),
    online:navigator.onLine
   }));
   assert.ok(nav.controller&&nav.page&&!nav.online,name+' offline page must be served by its controller');
   console.log('RENPET_OFFLINE_REDIRECT',JSON.stringify({engine:name,cache:cached,navigation:nav}));
  }finally{await context.close();}
 }finally{await browser.close();}
}
async function main(){
 const server=await startServer();
 try{await verify(webkit,'webkit');await verify(chromium,'chromium');}
 finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
