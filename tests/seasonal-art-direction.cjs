const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {ROOT}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});

async function run(engine,engineName){
 const browser=await engine.launch({headless:true,args:engineName==='chromium'?['--no-sandbox']:[]});
 const sizes=[['iphone',390,844],['ipad-portrait',768,1024],['ipad-landscape',1194,834]];
 try{
  for(const [name,width,height] of sizes){
   const context=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Cairo',serviceWorkers:'block',hasTouch:true});
   const page=await context.newPage();page.setDefaultTimeout(20000);
   await page.clock.install({time:new Date('2026-10-25T10:00:00Z')});
   try{
    await page.goto(ROOT,{waitUntil:'domcontentloaded'});
    await page.locator('.time-rail').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const initialLight=await page.evaluate(()=>({
     opacity:document.body.style.getPropertyValue('--night-opacity'),
     brightness:document.body.style.getPropertyValue('--scene-brightness')
    }));
    const observed=new Set();
    for(const [month,season] of [[1,'akhet'],[5,'peret'],[9,'shemu']]){
     await page.locator('[data-primary-view=today]').click();
     await page.locator('header [data-up-level]').click();
     const currentYear=page.locator('.time-panel[data-stream-kind=year]').nth(1);
     const section=currentYear.locator('.year-season[data-season="'+season+'"]');
     const group=await section.evaluate(el=>({
      background:getComputedStyle(el).backgroundImage,
      size:getComputedStyle(el).backgroundSize,
      border:getComputedStyle(el).borderTopWidth,
      radius:getComputedStyle(el).borderRadius,
      monthBackground:getComputedStyle(el.querySelector('.year-month')).backgroundColor
     }));
     assert.ok(group.background.includes(season+'.webp'),season+' seasonal group uses its own art');
     assert.ok(['100%','100% auto'].includes(group.size.split(',').at(-1).trim()),season+' group keeps all scenery width: '+JSON.stringify(group));
     assert.equal(group.border,'0px','year seasons are not separately framed cards');
     assert.ok(group.radius!=='0px','year groups keep subtle rounded surface');
     assert.ok(group.monthBackground.startsWith('rgba('),'miniature months should show softened scenery');
     await currentYear.locator('[data-open-month="'+month+'"]').click();
     const panel=page.locator('.time-panel[data-stream-kind=month]').nth(2);
     const art=await panel.evaluate(el=>{
      const before=getComputedStyle(el,'::before');
      const surface=getComputedStyle(el.querySelector('.month-section'));
      return {
       image:before.backgroundImage,size:before.backgroundSize,
       mask:before.maskImage||before.webkitMaskImage,
       surface:surface.backgroundImage,
       rect:el.getBoundingClientRect().toJSON(),
       scrollWidth:document.documentElement.scrollWidth,
       clientWidth:document.documentElement.clientWidth
      };
     });
     assert.ok(art.image.includes(season+'.webp'),season+' background is visible in month');
     assert.ok(['100%','100% auto'].includes(art.size.trim()),name+' scenery avoids horizontal center-cropping: '+art.size);
     assert.ok(art.mask.includes('gradient'),'blend artwork edges between continuous calendar months');
     assert.ok(art.surface.includes('gradient'),'dates retain a high-contrast parchment layer');
     assert.ok(art.scrollWidth<=art.clientWidth+2,'seasonal art does not create horizontal overflow');
     assert.equal(await page.locator('body').getAttribute('data-season'),season);
     observed.add(season);
     await page.screenshot({path:path.join(out,engineName+'-'+name+'-'+season+'-landscape.png'),fullPage:false});
    }
    assert.equal(observed.size,3);
    await page.locator('[data-primary-view=today]').click();
    await page.locator('.time-panel[data-stream-kind=month]').nth(2).locator('.date[data-date]').first().click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    const afterLight=await page.evaluate(()=>({
     opacity:document.body.style.getPropertyValue('--night-opacity'),
     brightness:document.body.style.getPropertyValue('--scene-brightness')
    }));
    assert.deepEqual(afterLight,initialLight,'switching from Month to Day must not change actual ambient lighting');
    const dayPanel=page.locator('.time-panel[data-stream-kind=day]').nth(1);
    assert.ok(['100%','100% auto'].includes((await dayPanel.evaluate(el=>getComputedStyle(el,'::before').backgroundSize)).trim()));
    await page.screenshot({path:path.join(out,engineName+'-'+name+'-day-landscape.png'),fullPage:false});
    console.log('RENPET_ART_DIRECTION',JSON.stringify({engine:engineName,screen:name,seasons:[...observed],consistentLighting:true}));
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
(async()=>{await run(chromium,'chromium');await run(webkit,'webkit');})().catch(error=>{
 console.error(error);process.exitCode=1;
});
