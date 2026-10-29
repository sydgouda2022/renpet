const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {boot,record}=require('./browser-tools.cjs');
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());
  await boot(page);
  await page.locator('header [data-new]').click();
  const form=page.locator('#event-editor');
  await form.locator('[name=title]').fill('Three-day preservation test');
  await form.locator('[name=egyYear]').selectOption('6268');
  await form.locator('[name=egyMonth]').selectOption('2');
  await form.locator('[name=egyDay]').selectOption('26');
  assert.equal(await form.locator('[name=endEgyDay]').inputValue(),'26');
  await form.locator('[name=endEgyDay]').selectOption('28');
  await form.locator('.save-button').click();
  await page.locator('.save-confirmation').waitFor();
  const saved=(await record(page,'scheduler')).items.find(i=>i.title==='Three-day preservation test');
  assert.ok(saved);assert.equal(saved.endDay-saved.startDay,2);
  await page.locator('[data-next]').click();
  assert.equal(await page.locator('.timeline-event:has-text("Three-day preservation test")').count(),1);
  await page.locator('.timeline-event:has-text("Three-day preservation test")').click();
  assert.equal(await page.locator('#event-editor [name=egyDay]').inputValue(),'26');
  await page.locator('[data-close]').click();
  await page.reload();await page.locator('.month-agenda').waitFor();
  const persistent=(await record(page,'scheduler')).items.find(i=>i.id===saved.id);
  assert.equal(persistent.endDay,saved.endDay);
  // Recurring appointments remain Egyptian-only and are stored once as a series.
  await page.locator('header [data-new]').click();
  const recurring=page.locator('#event-editor');
  await recurring.locator('[name=title]').fill('Egyptian ten-day recurrence');
  await recurring.locator('.advanced-fields summary').click();
  const repeat=recurring.locator('[name=repeat]');
  const values=await repeat.locator('option').evaluateAll(a=>a.map(x=>x.value));
  assert.deepEqual(values,['none','daily','egy10','egyMonthly','egyYearly']);
  await repeat.selectOption('egy10');
  await recurring.locator('.save-button').click();
  await page.locator('.save-confirmation').waitFor();
  const item=(await record(page,'scheduler')).items.find(i=>i.title==='Egyptian ten-day recurrence');
  assert.ok(item);assert.equal(item.repeat,'egy10');
  await context.close();
  console.log('Renpet date editor, persistence, recurrence and reload passed');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
