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
    // The old hidden background had all the lighting but was never painted.
    // The actual scroll panel must own the rendered, light-reactive artwork.
    assert.equal(await page.locator('.season-art').count(),0,'No hidden duplicate scenery');
    const activeMonth=page.locator('.time-panel[data-stream-kind=month]').nth(2);
    const art=await activeMonth.evaluate(el=>({
     image:getComputedStyle(el,'::before').backgroundImage,
     pointer:getComputedStyle(el,'::before').pointerEvents,
     shade:getComputedStyle(el,'::after').opacity,
     surface:getComputedStyle(el.querySelector('.month-section')).backgroundImage
    }));
    assert.ok(art.image.includes('akhet.webp'),'Month renders Akhet landscape: '+art.image);
    assert.equal(art.pointer,'none','Artwork cannot intercept calendar taps');
    assert.ok(art.surface.includes('gradient'),'Month has a translucent writing surface');
    assert.ok(Number(art.shade)>0,'Visible month artwork receives night shading');
    const lighting=await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--night-opacity').trim());
    // Setting the local time must visibly affect the *painted* landscape.
    await page.clock.setFixedTime(new Date('2026-10-25T00:00:00Z'));
    await page.locator('[data-primary-view=today]').click();
    const night=await page.evaluate(()=>({
     opacity:Number(document.body.style.getPropertyValue('--night-opacity')),
     brightness:Number(document.body.style.getPropertyValue('--scene-brightness')),
     saturation:Number(document.body.style.getPropertyValue('--scene-saturation'))
    }));
    await page.clock.setFixedTime(new Date('2026-10-25T10:00:00Z'));
    await page.locator('[data-primary-view=today]').click();
    const noon=await page.evaluate(()=>({
     opacity:Number(document.body.style.getPropertyValue('--night-opacity')),
     brightness:Number(document.body.style.getPropertyValue('--scene-brightness')),
     saturation:Number(document.body.style.getPropertyValue('--scene-saturation'))
    }));
    assert.ok(night.opacity>noon.opacity+.30,'Night visibly darkens the seasonal artwork');
    assert.ok(night.brightness<noon.brightness-.25,'Day brightens the same artwork');
    assert.notEqual(night.saturation,noon.saturation,'Color warmth follows local hour');
    assert.ok(Number(lighting)>0&&Number(lighting)<1,'Day-night lighting is a continuous opacity');
    // Each four-month season gets its own landscape, not one repeated year skin.
    await page.locator('header [data-up-level]').click();
    const yearPanel=page.locator('.time-panel[data-stream-kind="year"]').nth(1);
    assert.equal(await yearPanel.locator('.year-season').count(),3);
    for(const season of ['akhet','peret','shemu']){
     const card=yearPanel.locator('.year-season[data-season="'+season+'"]');
     assert.equal(await card.locator('.year-month').count(),4,season+' contains four months');
     const style=await card.evaluate(el=>({
      image:getComputedStyle(el,'::before').backgroundImage,
      pseudo:getComputedStyle(el,'::before').content,
      shade:getComputedStyle(el,'::after').opacity,
      border:getComputedStyle(el).borderTopWidth
     }));
     assert.ok(style.image.includes('/assets/seasons/'+season+'.webp'),season+' artwork must belong to section: '+style.image);
     assert.notEqual(style.pseudo,'none',season+' paints exactly one art layer');
     assert.ok(Number(style.shade)>0,season+' card is subject to real lighting');
     assert.notEqual(style.border,'0px',season+' remains a visible section');
    }
    await page.screenshot({path:path.join(out,name+'-year-season-cards.png'),fullPage:false});
    await yearPanel.locator('[data-open-month="1"]').click();
    for(const [month,season] of [[5,'peret'],[9,'shemu'],[1,'akhet']]){
     await page.locator('[data-primary-view=today]').click();
     await page.locator('[data-up-level]').click();
     const year=page.locator('.time-panel[data-stream-kind=year]').nth(1);
     await year.locator('[data-open-month="'+month+'"]').click();
     assert.equal(await page.locator('body').getAttribute('data-season'),season);
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
     const monthPanel=page.locator('.time-panel[data-stream-kind="month"]').nth(2);
     const panelStyle=await monthPanel.evaluate(el=>getComputedStyle(el,'::before').backgroundImage);
     assert.ok(panelStyle.includes('/assets/seasons/'+season+'.webp'),
      season+' Month uses its own landscape: '+panelStyle);
    }
    await page.locator('.time-panel[data-stream-kind=month]').nth(2).locator('.date[data-date]').nth(5).click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    // Top right displays the actual month name in the active language.
    const names=await page.evaluate(async()=>(await(await fetch('./data.json')).json()).months.ar);
    const dayMonth=page.locator('header [data-up-level] .ux-month-value');
    assert.equal((await dayMonth.textContent()).trim(),names[0]);
    assert.equal((await page.locator('header [data-up-level]').getAttribute('aria-label')).trim(),names[0]);
    assert.equal(await page.locator('.month-section').count(),0,'iPad Day is independent, without Month panel');
    const dayScene=page.locator('.time-panel[data-stream-kind="day"]').nth(2);
    const dayArt=await dayScene.evaluate(el=>getComputedStyle(el,'::before').backgroundImage);
    assert.ok(dayArt.includes('akhet.webp'),'Day uses same seasonal landscape as its Egyptian month');
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
