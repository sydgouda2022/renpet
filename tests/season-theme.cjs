const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language}=require('./browser-tools.cjs');
const evidenceDir='renpet-mobile-evidence';fs.mkdirSync(evidenceDir,{recursive:true});
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const [name,width,height] of [
   ['iphone',390,844],['ipad-portrait',768,1024],['ipad-landscape',1194,834]
  ]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:true,
    serviceWorkers:'block',timezoneId:'Africa/Cairo'});
   const page=await context.newPage();page.setDefaultTimeout(15000);
   await page.clock.install({time:new Date('2026-10-25T09:00:00Z')});
   try{
    await boot(page);
    const artwork=await page.evaluate(async()=>{
     return Promise.all(['akhet','peret','shemu'].map(async season=>{
      const response=await fetch('./assets/landscapes/'+season+'.svg');
      const body=await response.text();
      return {season,status:response.status,svg:body.startsWith('<?xml'),
       human:/<\s*(?:person|human|figure)\b/i.test(body),bytes:body.length};
     }));
    });
    assert.ok(artwork.every(x=>x.status===200&&x.svg&&!x.human&&x.bytes>1000),
     'All three nature-only season landscapes load locally');
    const baseline=await page.evaluate(()=>({
     background:getComputedStyle(document.querySelector('.flow-season')).backgroundImage,
     width:document.documentElement.scrollWidth,
     main:document.querySelector('.main-scroll').getBoundingClientRect().height,
     season:document.querySelector('.flow-season').dataset.season,
     clock:getComputedStyle(document.documentElement).getPropertyValue('--ambient-night').trim()
    }));
    assert.equal(baseline.season,'akhet');
    assert.ok(baseline.width<=width+2,'No horizontal overflow on '+name);
    assert.equal(baseline.clock,'0','Morning daylight should not tint the landscape');

    await page.locator('header [data-open-year]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'year');
    assert.equal(await page.locator('.year-season').count(),3);
    assert.equal(await page.locator('.year-month').count(),12);
    assert.equal(await page.locator('.year-mini-day').count(),366);
    assert.equal(await page.locator('.year-mini-epagomenal .year-mini-day').count(),6);
    const columns=await page.locator('.year-months').first().evaluate(el=>
     getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,width<700?2:width<1024?3:4);
    await page.screenshot({path:path.join(evidenceDir,'season-'+name+'-year.png')});
    // A season should begin naturally at each four-month boundary, without
    // displaying a separate screen, human figure or a mini month in Day.
    for(const [month,season] of [[4,'akhet'],[5,'peret'],[9,'shemu'],[13,'shemu']]){
     if(await page.locator('body').getAttribute('data-view')!=='year')
      await page.locator('header [data-open-year]').click();
     await page.locator('[data-open-month="'+month+'"]').click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'month');
     assert.equal(await page.locator('body').getAttribute('data-season'),season);
     assert.ok(await page.locator('.flow-season[data-season="'+season+'"]').count()>0);
     const scene=await page.locator('.flow-season[data-season="'+season+'"]').first().evaluate(el=>
      getComputedStyle(el,'::before').backgroundImage);
     assert.ok(scene.includes(season+'.svg'),'Season landscape must come from nature-only art');
    }
    // The day view takes over the entire content region on both iPhone/iPad.
    const selected=page.locator('.flow-month .date.chosen');
    assert.equal(await selected.count(),1);
    await selected.click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'day');
    assert.equal(await page.locator('.timeline-hour').count(),24);
    assert.equal(await page.locator('.month-scroll').count(),0);
    await page.screenshot({path:path.join(evidenceDir,'season-'+name+'-day.png')});
    await page.locator('[data-back]').click();
    assert.equal(await page.locator('body').getAttribute('data-view'),'month');

    for(const script of ['ar','cop','egy']){
     await language(page,script);
     assert.equal(await page.locator('.flow-month .month-agenda').count(),1);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
     const chosen=page.locator('.flow-month .date.chosen');
     assert.equal(await chosen.count(),1);
     const day=await chosen.getAttribute('data-date');
     await chosen.click();
     assert.equal(await page.locator('body').getAttribute('data-view'),'day');
     await page.locator('[data-next]').click();
     await page.locator('[data-back]').click();
     assert.equal(await page.locator('.date.chosen').count(),1);
     assert.equal(await page.locator('.date.chosen').getAttribute('data-date'),String(Number(day)+1));
     await page.locator('.date.chosen').click();
     await page.locator('[data-prev]').click();
     await page.locator('[data-back]').click();
     assert.equal(await page.locator('.date.chosen').getAttribute('data-date'),day);
    }
    // Ambient light is a continuous property on the scenery, not cards or
    // unrelated view-specific backgrounds.
    await page.clock.setFixedTime(new Date('2026-10-25T23:00:00Z'));
    await page.reload();await page.locator('.flow-month').first().waitFor();
    const night=await page.evaluate(()=>Number(getComputedStyle(document.documentElement)
     .getPropertyValue('--ambient-night').trim()));
    assert.ok(night>0,'Evening landscape should darken gradually');
    await page.screenshot({path:path.join(evidenceDir,'season-'+name+'-month-night.png')});
    results.push({name,width,height,landscapes:3,yearMonths:12,
     seasonalBoundaries:true,dayNavigation:true,allLanguages:true,night});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(evidenceDir,'seasonal-design-report.json'),JSON.stringify(results,null,2));
 console.log('RENPET_SEASONAL_DESIGN',JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
