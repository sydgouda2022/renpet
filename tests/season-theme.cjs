const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {ROOT}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const [name,width,height] of [
   ['iphone',390,844],['ipad-portrait',768,1024],['ipad-landscape',1194,834]
  ]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:true,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
   const page=await context.newPage();page.setDefaultTimeout(20000);
   await page.clock.install({time:new Date('2026-10-25T09:00:00Z')});
   try{
    await page.goto(ROOT,{waitUntil:'domcontentloaded'});
    await page.locator('.time-rail').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('body').getAttribute('data-season'),'akhet');
    const assets=await page.evaluate(async()=>Promise.all(['akhet','peret','shemu'].map(async id=>{
     const response=await fetch('./assets/seasons/'+id+'.webp');
     return {id,ok:response.ok,size:(await response.arrayBuffer()).byteLength};
    })));
    assert.ok(assets.every(a=>a.ok&&a.size>20000),'All local Egyptian botanical landscapes ship with PWA');
    assert.equal(await page.locator('.season-art').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
    const lighting=await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--night-opacity').trim());
    assert.ok(Number(lighting)>0&&Number(lighting)<1,'Day-night lighting is a continuous opacity');
    for(const [month,season] of [[5,'peret'],[9,'shemu'],[1,'akhet']]){
     await page.locator('[data-primary-view=today]').click();
     await page.locator('[data-up-level]').click();
     const year=page.locator('.time-panel[data-stream-kind=year]').nth(1);
     await year.locator('[data-open-month="'+month+'"]').click();
     assert.equal(await page.locator('body').getAttribute('data-season'),season);
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
    }
    await page.locator('.time-panel[data-stream-kind=month]').nth(2).locator('.date[data-date]').nth(5).click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    assert.equal(await page.locator('.month-section').count(),0,'iPad Day is independent, without Month panel');
    const rect=await page.evaluate(()=>{
     const main=document.querySelector('#main-content').getBoundingClientRect();
     const rail=document.querySelector('.time-rail').getBoundingClientRect();
     return {mainWidth:main.width,railWidth:rail.width,scrollWidth:document.documentElement.scrollWidth};
    });
    assert.ok(rect.railWidth>=rect.mainWidth*.94,'Day fills available landscape width');
    assert.ok(rect.scrollWidth<=width+3,'No horizontal overrun');
    await page.screenshot({path:path.join(out,name+'-season.png'),fullPage:false});
    results.push({name,width,height,assets:assets.map(x=>x.id),lighting,fullWidthDay:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'seasonal-ui.json'),JSON.stringify(results,null,2));
 console.log('RENPET_SEASONAL_UI',JSON.stringify(results));
}
main().catch(e=>{console.error(e);process.exitCode=1});
