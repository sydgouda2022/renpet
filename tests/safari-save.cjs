const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language,saveEvent}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await webkit.launch({headless:true});
 const results=[];
 try{
  for(const [width,height] of [[375,667],[390,844],[768,1024],[1194,834]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Africa/Cairo',serviceWorkers:'block'});
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());
   try{
    await boot(page);
    for(const lang of ['ar','cop','egy']){
     await language(page,lang);
     const title=lang+' WebKit '+width;
     const item=await saveEvent(page,title);
     const visibleBlock=page.locator('.timeline-event[data-edit="'+item.id+'"]');
     if(!await visibleBlock.count()){
      const grouped=page.locator('.timeline-crowded');
      assert.ok(await grouped.count(),'Saved appointment must be visible individually or in a readable overlap group');
      await grouped.first().click();
      assert.ok(await page.locator('.crowded-choice[data-crowded-edit="'+item.id+'"]').count(),'Saved item missing from crowded event list');
      await page.locator('.crowded-backdrop').click({position:{x:6,y:6}});
     }
     assert.ok((await record(page,'scheduler')).items.some(i=>i.id===item.id),'Event absent from storage after save');
     await page.reload();await page.locator('.month-agenda').waitFor();
     const saved=await record(page,'scheduler');
     assert.ok(saved.items.some(i=>i.id===item.id),'WebKit lost appointment after restart');
     await page.locator('header [data-new]').click();
     const form=page.locator('#event-editor');
     await form.locator('[name=title]').fill(title+' picker');
     await form.locator('[data-time-open=start]').click();
     await form.locator('.time-picker-host:not([hidden])').waitFor();
     if(lang!=='ar'){
      const labels=await form.locator('.time-picker-host [aria-label]').evaluateAll(elements=>
       elements.map(el=>el.getAttribute('aria-label')).join(' '));
      assert.doesNotMatch(labels,/[A-Za-z]/,'Time picker must not expose English controls in '+lang);
     }
     const saveRect=await form.locator('.save-button').boundingBox();
     assert.ok(saveRect&&saveRect.width>=44&&saveRect.height>=44,'Save control must be touch-accessible');
     await form.locator('.save-button').click();
     await page.locator('.save-confirmation').waitFor();
     assert.ok((await record(page,'scheduler')).items.some(i=>i.title===title+' picker'),'Save with picker open failed');
     await page.locator('[data-primary-view=today]').click();
    }
    await page.screenshot({path:path.join(out,'safari-'+width+'-save.png'),fullPage:true});
    results.push({width,height,languages:['ar','cop','egy'],saveVerified:true,reloadVerified:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'safari-save-report.json'),JSON.stringify(results,null,2));
 console.log('RENPET_SAFARI_SAVE',JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1});
