const ROOT='http://127.0.0.1:8765/';
async function boot(page){
 await page.goto(ROOT,{waitUntil:'domcontentloaded'});
 await page.locator('.time-rail').waitFor();
}
async function record(page,key){
 return page.evaluate(async key=>(await import('./storage.js')).readRecord(key),key);
}
async function put(page,key,value){
 return page.evaluate(async({key,value})=>(await import('./storage.js')).writeRecord(key,value),{key,value});
}
async function language(page,id){
 await page.locator('header [data-open-panel=settings]').click();
 await page.locator('[name=language]').selectOption(id);
 await page.locator('.ux-panel-backdrop').click({position:{x:9,y:9}});
}
async function saveEvent(page,title){
 await page.locator('header [data-new]').click();
 const form=page.locator('#event-editor');
 await form.locator('[name=title]').fill(title);
 // Save must remain reachable on small phones, regardless of language.
 const saveBounds=await form.evaluate(el=>{
  const button=el.querySelector('.save-button'),b=button.getBoundingClientRect();
  const f=el.getBoundingClientRect(),h=el.querySelector('.sheet-head').getBoundingClientRect();
  return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,formX:f.x,formWidth:f.width,
   headerWidth:h.width,viewportWidth:innerWidth,viewportHeight:innerHeight,
   formHeight:f.height,formBottom:f.bottom,overlayTop:el.closest('.sheet-overlay')?.getBoundingClientRect().top,
   overlayHeight:el.closest('.sheet-overlay')?.getBoundingClientRect().height,
   maxHeight:getComputedStyle(el).maxHeight,cssHeight:getComputedStyle(el).height,
   documentScrollY:scrollY,visualTop:visualViewport?.offsetTop??null,
   visualHeight:visualViewport?.height??null};
 });
 if(saveBounds.x<0||saveBounds.y<0||saveBounds.right>saveBounds.viewportWidth+2||
   saveBounds.bottom>saveBounds.viewportHeight+2)
  throw Error('Appointment Save is outside phone viewport: '+JSON.stringify(saveBounds));
 await form.locator('.save-button').click();
 await page.locator('.save-confirmation').waitFor();
 await page.locator('#event-editor').waitFor({state:'detached'});
 const state=await record(page,'scheduler');
 const item=state.items.find(i=>i.title===title);
 if(!item)throw Error('Saved appointment missing from IndexedDB: '+title);
 return item;
}
module.exports={ROOT,boot,record,put,language,saveEvent};
