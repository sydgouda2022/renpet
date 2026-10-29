const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,record,language}=require('./browser-tools.cjs');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
async function seed(page,title){
 return page.evaluate(async title=>{
  const domain=await import('./scheduler.js'),storage=await import('./storage.js');
  const state=(await storage.readRecord('scheduler'))??domain.emptyState();
  const now=new Date(),day=Math.floor(Date.parse([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')+'T00:00:00Z')/86400000);
  const item=domain.createItem({title,startDay:day,startMinutes:600,endMinutes:660,calendarId:'personal'});
  state.items.push(item);
  await storage.writeRecord('scheduler',state);
  return item;
 },title);
}
async function main(){
 const browser=await webkit.launch({headless:true});
 const results=[];
 try{
  for(const [width,height] of [[375,667],[390,844]])for(const lang of ['ar','cop','egy']){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());
   try{
    await boot(page);await language(page,lang);
    const item=await seed(page,lang+' direct '+width);
    await page.reload();await page.locator('.month-agenda').waitFor();
    await page.locator('[data-date="'+item.startDay+'"]').click();
    const block=page.locator('.timeline-event[data-edit="'+item.id+'"]');
    await block.waitFor();
    const grip=block.locator('.event-resize');
    await grip.scrollIntoViewIfNeeded();
    const b=await grip.boundingBox();
    assert.ok(b&&b.height>=20,'Missing accessible resize grip');
    const x=b.x+b.width/2,y=b.y+b.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+51,{steps:8});await page.mouse.up();
    await page.waitForFunction(async id=>{
     const state=await(await import('./storage.js')).readRecord('scheduler');
     return state?.items.some(i=>i.id===id&&i.endMinutes>660);
    },item.id,{timeout:8000});
    await page.locator('[data-back]').click();
    const row=page.locator('.event-row-shell:has([data-edit="'+item.id+'"])');
    await row.waitFor();
    await row.locator('[data-quick-delete="'+item.id+'"]').click();
    await page.waitForFunction(async id=>!(await(await import('./storage.js')).readRecord('scheduler'))?.items.some(x=>x.id===id),item.id);
    assert.ok(!(await record(page,'scheduler')).items.some(i=>i.id===item.id));
    await page.screenshot({path:path.join(out,'webkit-'+width+'-'+lang+'-direct.png'),fullPage:true});
    results.push({width,lang,resize:true,delete:true});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'safari-direct-actions.json'),JSON.stringify(results,null,2));
 console.log('RENPET_SAFARI_DIRECT',JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
