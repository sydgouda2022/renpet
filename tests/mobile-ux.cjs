const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const out='renpet-mobile-evidence';fs.mkdirSync(out,{recursive:true});
const results=[],findings=[],errors=[];let idx=0;
const step=async(name,cb)=>{try{const value=await cb();results.push({name,ok:true,value});console.log('PASS',name,JSON.stringify(value||'').slice(0,300));}catch(e){results.push({name,ok:false,error:String(e.message).slice(0,250)});console.log('FAIL',name,e.message);}};
async function screenshot(p,label){let file=path.join(out,String(++idx).padStart(2,'0')+'-'+label+'.png');await p.screenshot({path:file,fullPage:true});}
async function inspect(p,label){
 const o=await p.evaluate(()=>{
  const rs=s=>{let r=document.querySelector(s)?.getBoundingClientRect();return r?{top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height),left:Math.round(r.left),right:Math.round(r.right)}:null};
  return {viewport:{w:innerWidth,h:innerHeight},documentWidth:document.documentElement.scrollWidth,header:rs('.ux-toolbar'),main:rs('.main-scroll'),nav:rs('.ux-bottom'),calendar:rs('.month-section'),agenda:rs('.month-agenda'),agendaHeading:rs('.agenda-heading'),year:rs('.year-overview'),buttons:[...document.querySelectorAll('header button,header select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0}).map(e=>({label:e.getAttribute('aria-label')||e.innerText,w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})),hieroglyphFont:document.fonts.check('16px RenpetEgyptian')};
 });
 if(o.documentWidth>o.viewport.w+2)findings.push({type:'overflow',screen:label,detail:o});
 if(o.agendaHeading && o.agendaHeading.top>o.viewport.h-80)findings.push({type:'agenda-below-fold',screen:label,detail:o});
 if(o.buttons.some(x=>x.w<40||x.h<40))findings.push({type:'small-control',screen:label,controls:o.buttons.filter(x=>x.w<40||x.h<40)});
 return o;
}
async function run(){
 const b=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 for(const [name,w,h] of [['iphone-375',375,667],['iphone-390',390,844]]){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const p=await ctx.newPage(); p.setDefaultTimeout(8000);await p.clock.install({time:new Date('2026-10-24T06:30:15.000Z')});p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.accept());
  await step(name+' initial',async()=>{await p.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});await p.locator('.month-agenda').waitFor();await p.evaluate(()=>document.fonts.ready);await screenshot(p,name+'-month');return inspect(p,name+'-month');});
  await step(name+' Year picker',async()=>{await p.locator('[data-open-year]').click();await p.locator('.year-season').first().waitFor();await screenshot(p,name+'-year');return {seasonCount:await p.locator('.year-season').count(),monthCount:await p.locator('.year-month').count()};});
  await step(name+' month selection',async()=>{await p.locator('[data-open-month="1"]').click();await screenshot(p,name+'-month-from-year');return inspect(p,name+'-month-from-year');});
  await step(name+' day tap',async()=>{const day=p.locator('[data-date]').nth(4);await day.click();await p.locator('.timeline-hour').first().waitFor();await screenshot(p,name+'-day');return await p.locator('.timeline-hour').count();});
  await step(name+' Today goes to month',async()=>{await p.locator('[data-primary-view="today"]').click();await p.locator('.month-agenda').waitFor();return inspect(p,name+'-today');});

  await step(name+' localized Day clock and minute-accurate live red line',async()=>{
   await p.locator('[data-date][aria-pressed="true"]').click();
   await p.locator('.timeline-now').waitFor();
   const hourLabel=await p.locator('.timeline-hour>span').nth(9).innerText();
   if(!hourLabel.includes('٠٩'))throw Error('Arabic timeline hour still uses Latin digits: '+hourLabel);
   const current=await p.locator('[data-now-line]').getAttribute('aria-label');
   if(!current.includes('٠٩:٣٠'))throw Error('Live red time marker wrong: '+current);
   const first=Number.parseFloat((await p.locator('[data-now-line]').getAttribute('style')).match(/top:\s*([0-9.]+)px/)[1]);
   await screenshot(p,name+'-arabic-live-red-line');
   await p.clock.fastForward(65000);
   const next=Number.parseFloat((await p.locator('[data-now-line]').getAttribute('style')).match(/top:\s*([0-9.]+)px/)[1]);
   if(!(next>first+0.5))throw Error('Red line did not move as time advanced: '+first+' → '+next);
   // Full-hour coverage: image assets 31–59 must exist and load offline.
   await p.clock.fastForward(28*60*1000);
   const at59=await p.locator('[data-now-line]').getAttribute('aria-label');
   if(!at59.includes('٥٩'))throw Error('Red marker did not reach minute 59: '+at59);
   await p.locator('[data-open-panel=settings]').click();
   await p.locator('[name=language]').selectOption('egy');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await p.locator('.timeline-now-clock img[src$="/59.svg"]').waitFor({timeout:4000});
   const loaded=await p.locator('.timeline-now-clock img[src$="/59.svg"]').evaluate(img=>img.complete&&img.naturalWidth>0);
   if(!loaded)throw Error('Hieroglyphic minute 59 SVG is missing or failed to load');
   await screenshot(p,name+'-hieroglyphic-minute59');
   await p.locator('[data-open-panel=settings]').click();
   await p.locator('[name=language]').selectOption('ar');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await p.locator('[data-next]').click();
   if(await p.locator('[data-now-line]').count())throw Error('Red time line appears on future date');
   await p.locator('[data-prev]').click();
   if(!(await p.locator('[data-now-line]').count()))throw Error('Red line absent when returning to today');
   await p.locator('[data-open-panel=settings]').click();
   await p.locator('[name=language]').selectOption('cop');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   const cop=await p.locator('.timeline-hour>span').nth(9).innerText();
   if(/[0-9]/.test(cop))throw Error('Coptic hour still has Western digits: '+cop);
   await screenshot(p,name+'-coptic-clock');
   await p.locator('[data-open-panel=settings]').click();
   await p.locator('[name=language]').selectOption('egy');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   const pictograms=await p.locator('.timeline-hour .clock-glyph').count();
   if(pictograms!==23||!(await p.locator('.timeline-hour .clock-zero').count()))throw Error('Missing hieroglyphic numeral artwork or midnight zero marker: '+pictograms);
   if(!(await p.locator('[data-now-line]').count()))throw Error('Live red line absent after language change');
   await screenshot(p,name+'-hieroglyphic-clock');
   await p.locator('[data-open-panel=settings]').click();
   await p.locator('[name=language]').selectOption('ar');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await p.locator('[data-back]').click();
   return {arabicHour:hourLabel,arabicNow:current,copticHour:cop,hieroglyphics:pictograms,oldY:first,newY:next};
  });

  await step(name+' schedule empty action',async()=>{await p.locator('[data-primary-view="list"]').click();await screenshot(p,name+'-empty-schedule');return {empty:await p.locator('.schedule-empty').count(),newButton:await p.locator('.schedule-empty [data-new]').count()};});
  await step(name+' event save / advanced / delete',async()=>{
   await p.locator('header [data-new]').click();
   await p.locator('#event-editor').waitFor();
   const details=p.locator('details.advanced-fields');
   const closed=!(await details.getAttribute('open'));
   await screenshot(p,name+'-new-event');
   await p.locator('#event-editor [name=title]').fill('RENPET QA TEMP EVENT');
   await p.locator('#event-editor [type=submit]').click();
   await p.locator('.timeline-event:has-text("RENPET QA TEMP EVENT")').first().waitFor();
   await p.locator('.timeline-event:has-text("RENPET QA TEMP EVENT")').first().click();
   await p.locator('#event-editor [data-delete]').click();
   return {advancedInitiallyClosed:closed,deleted:(await p.locator('.timeline-event:has-text("RENPET QA TEMP EVENT")').count())===0};
  });
  await step(name+' settings compact and language',async()=>{
   await p.locator('[data-open-panel=settings]').first().click();
   await screenshot(p,name+'-settings');
   const first=await inspect(p,name+'-settings');
   await p.locator('[name=language]').selectOption('cop');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await p.locator('[data-primary-view=today]').click();
   await screenshot(p,name+'-coptic');
   return {panelHeight:first.viewport.h,decades:await p.locator('.renpet-decade').count()};
  });
  await step(name+' Egyptian font and dates',async()=>{
   await p.locator('[data-open-panel=settings]').first().click();
   await p.locator('[name=language]').selectOption('egy');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await p.evaluate(()=>document.fonts.ready);
   await screenshot(p,name+'-hieroglyphic');
   return {font:await p.evaluate(()=>document.fonts.check('16px RenpetEgyptian')),numerals:await p.locator('.date .glyph').count(),metric:await inspect(p,name+'-hieroglyphic')};
  });
  await step(name+' week toggle / Gregorian',async()=>{
   await p.locator('[data-open-panel=settings]').first().click();
   await p.locator('[name=week]').selectOption('7');
   await p.locator('[name=gregorian]').uncheck();
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   const n=await p.locator('.seven-day').count();
   const hidden=(await p.locator('.greg-day').count())===0;
   const ink=await p.locator('.month-section .date .day-number').first().evaluate(el=>({
    weight:Number(getComputedStyle(el).fontWeight),
    stroke:Number.parseFloat(getComputedStyle(el).webkitTextStrokeWidth)
   }));
   if(ink.weight<700||ink.stroke<.1)throw Error('Hieroglyphic dates lack bold ink: '+JSON.stringify(ink));
   await screenshot(p,name+'-hieroglyphic-7');
   return {seven:n,gregorianHidden:hidden,boldInk:ink};
  });
  await step(name+' calendar management and backup',async()=>{
   await p.locator('[data-open-panel=settings]').first().click();
   await p.locator('[data-open-panel=calendars]').click();
   const manage=await p.locator('#new-calendar').count();
   await screenshot(p,name+'-manage');
   await p.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await p.locator('[data-open-panel=settings]').first().click();
   await p.locator('[data-backup]').click();
   const backup=await p.locator('.renpet-backup-panel').count();
   await screenshot(p,name+'-backup');
   return {manage,backup};
  });

  await step(name+' native Coptic and hieroglyphic keyboards',async()=>{
   const k=await ctx.newPage(); k.setDefaultTimeout(8000);
   k.on('dialog',d=>d.accept());
   await k.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await k.locator('.month-agenda').waitFor();
   await k.locator('[data-open-panel="settings"]').click();
   await k.locator('select[name="language"]').selectOption('cop');
   await k.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await k.locator('header [data-new]').click();
   await k.locator('input[name="title"]').focus();
   await k.locator('.renpet-keyboard:not([hidden])').waitFor({timeout:5000});
   const ckeys=await k.locator('.kb-coptic .kb-sign').count();
   const numeric=await k.locator('.kb-numbers .kb-num').count();
   if(ckeys!==32||numeric!==12)throw Error('Incorrect single-page Coptic keyboard key counts: '+ckeys+'/'+numeric);
   await screenshot(k,name+'-coptic-keyboard');
   await k.locator('.kb-coptic [data-kb-insert="ⲡ"]').click();
   const suggestions=await k.locator('.kb-suggestions [data-kb-pick]').count();
   if(suggestions<3)throw Error('Coptic dictionary predictions absent for ⲡ: '+suggestions);
   const labels=await k.locator('.kb-suggestions small').allInnerTexts();
   if(!labels.some(x=>x.includes('S'))||!labels.some(x=>x.includes('B')))throw Error('Both dialects are not offered: '+labels.join('|'));
   await screenshot(k,name+'-coptic-predictions');
   await k.locator('[data-kb-pick="1"]').click();
   const predictionInserted=await k.locator('input[name="title"]').inputValue();
   if(!predictionInserted.trim().startsWith('ⲡ'))throw Error('Coptic prediction not inserted: '+predictionInserted);
   await k.locator('[data-kb-done]').click();
   await k.locator('#event-editor [data-close]').click();
   await k.locator('[data-open-panel="settings"]').click();
   await k.locator('select[name="language"]').selectOption('egy');
   await k.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await k.locator('header [data-new]').click();
   await k.locator('input[name="title"]').focus();
   await k.locator('.renpet-keyboard:not([hidden])').waitFor({timeout:5000});
   if((await k.locator('[role=tab][data-kb-tab]').count())!==3)throw Error('Missing MDWNFR-style 3 pages');
   if((await k.locator('.kb-numbers .kb-num').count())!==15)throw Error('Egyptian numbers not available');
   await k.locator('[data-kb-tab="bi"]').click();
   const biliterals=await k.locator('.kb-hiero .kb-sign').count();
   await k.locator('[data-kb-tab="tri"]').click();
   const triliterals=await k.locator('.kb-hiero .kb-sign').count();
   await k.locator('[data-kb-tab="uni"]').click();
   const uniliterals=await k.locator('.kb-hiero .kb-sign').count();
   if(biliterals<70||triliterals<45||uniliterals<20)throw Error('Too few Unicode signs: '+[uniliterals,biliterals,triliterals]);
   const first=k.locator('.kb-hiero .kb-sign').first();
   const sign=await first.getAttribute('data-kb-insert');
   await first.click();
   const actual=await k.locator('input[name="title"]').inputValue();
   if(actual!==sign)throw Error('Unicode sign input did not preserve the chosen hieroglyph');
   if(!(await k.locator('.kb-suggestions [data-kb-pick="0"]').count()))throw Error('Raw input not first hieroglyphic suggestion');
   const signInk=await first.evaluate(el=>({
    weight:Number(getComputedStyle(el).fontWeight),
    stroke:Number.parseFloat(getComputedStyle(el).webkitTextStrokeWidth)
   }));
   if(signInk.weight<700||signInk.stroke<.2)throw Error('Keyboard hieroglyphs are not bold: '+JSON.stringify(signInk));
   await screenshot(k,name+'-hieroglyphic-keyboard');
   await k.close();
   return {copticKeys:ckeys,copticPredictions:suggestions,bothDialectLabels:labels,uniliterals,biliterals,triliterals,numerals:numeric};
  });


  await step(name+' localized Arabic, Coptic and hieroglyphic event time controls',async()=>{
   const q=await ctx.newPage(); q.setDefaultTimeout(8000);
   q.on('dialog',d=>d.accept());
   await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await q.locator('.month-agenda').waitFor();
   // Other tests in this browser context may have selected Coptic/Egyptian.
   await q.locator('[data-open-panel=settings]').click();
   await q.locator('select[name=language]').selectOption('ar');
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await q.locator('header [data-new]').click();
   const form=q.locator('#event-editor');
   await form.waitFor();
   if(await form.locator('input[type=time]').count())throw Error('iOS native English time inputs still exist');
   const initialTime=await form.locator('[data-time-open=start]').innerText();
   if(!/[٠-٩]/.test(initialTime)||/[0-9]/.test(initialTime))throw Error('Arabic start is not Arabic-Indic: '+initialTime);
   await screenshot(q,name+'-arabic-event-time');
   await form.locator('[data-time-open=start]').click();
   await q.locator('.time-picker-host:not([hidden])').waitFor();
   await q.locator('[data-time-hour="14"]').click();
   await q.locator('[data-time-minute="37"]').click();
   await screenshot(q,name+'-arabic-time-picker');
   await q.locator('[data-time-confirm]').click();
   if((await form.locator('input[name=start]').inputValue())!=='14:37')throw Error('Localized picker did not write hidden canonical time');
   if(!((await form.locator('[data-time-open=start]').innerText()).includes('١٤:٣٧')))throw Error('Arabic clock display did not update');
   await form.locator('[data-time-open=end]').click();
   await q.locator('[data-time-hour="15"]').click();
   await q.locator('[data-time-minute="8"]').click();
   await q.locator('[data-time-confirm]').click();
   await form.locator('input[name=title]').fill('RENPET LOCAL TIME QA');
   await form.locator('[type=submit]').click();
   await q.locator('.timeline-event:has-text("RENPET LOCAL TIME QA")').waitFor();
   await q.locator('.timeline-event:has-text("RENPET LOCAL TIME QA")').click();
   if((await q.locator('#event-editor input[name=start]').inputValue())!=='14:37')throw Error('Saved start time not roundtripped');
   if((await q.locator('#event-editor input[name=end]').inputValue())!=='15:08')throw Error('Saved end time not roundtripped');
   await q.locator('#event-editor [data-delete]').click();
   for(const lang of ['cop','egy']){
    await q.locator('[data-open-panel=settings]').click();
    await q.locator('select[name=language]').selectOption(lang);
    await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
    await q.locator('header [data-new]').click();
    const start=q.locator('#event-editor [data-time-open=start]');
    const end=q.locator('#event-editor [data-time-open=end]');
    if(await q.locator('#event-editor input[type=time]').count())throw Error(lang+' retains native HTML time');
    if(lang==='cop'){
     const a=await start.innerText(),b=await end.innerText();
     if(/[0-9]/.test(a+b)||a.includes('AM')||b.includes('AM'))throw Error('Coptic time still shows English: '+a+' / '+b);
     if(!a.includes('○'))throw Error('Coptic zero not localized');
    }else{
     if((await q.locator('.local-time-fields .clock-glyph').count())<2)throw Error('Egyptian time signs absent');
    }
    await screenshot(q,name+'-'+lang+'-event-time');
    await start.click();
    await q.locator('.time-picker-host:not([hidden])').waitFor();
    await q.locator('[data-time-hour="10"]').click();
    await q.locator('[data-time-minute="59"]').click();
    if(lang==='egy'){
     const glyph=q.locator('.time-picker-preview img[src$="/59.svg"]');
     await glyph.waitFor();
     const valid=await glyph.evaluate(img=>img.complete&&img.naturalWidth>0);
     if(!valid)throw Error('Hieroglyphic minute 59 glyph failed');
    }
    await screenshot(q,name+'-'+lang+'-time-selector');
    await q.locator('[data-time-confirm]').click();
    if((await q.locator('#event-editor input[name=start]').inputValue())!=='10:59')throw Error(lang+' hidden time changed incorrectly');
    await q.locator('#event-editor [data-close]').click();
   }
   await q.close();
   return {languageSystems:['ar','cop','egy'],start:'14:37',end:'15:08',savedAndRestored:true};
  });


  await step(name+' event year uses selected language, not English number input',async()=>{
   const q=await ctx.newPage(); q.setDefaultTimeout(8000);
   q.on('dialog',d=>d.accept());
   await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await q.locator('.month-agenda').waitFor();
   const results={};
   for(const language of ['ar','cop','egy']){
    await q.locator('[data-open-panel=settings]').click();
    await q.locator('select[name=language]').selectOption(language);
    await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
    await q.locator('header [data-new]').click();
    const field=q.locator('#event-editor select[name=egyYear]');
    await field.waitFor();
    if(await q.locator('input[name=egyYear][type=number]').count())throw Error('Untranslated numeric year input survives in '+language);
    const year=Number(await field.inputValue());
    const display=await field.locator('option:checked').innerText();
    if(language==='ar'&&!/[٠-٩]/.test(display))throw Error('Arabic year uses Latin digits: '+display);
    if(language==='cop'&&(!/[\u2c80-\u2cff\u03e2-\u03ef]/u.test(display)||/[0-9]/.test(display)))throw Error('Coptic year uses Latin digits: '+display);
    if(language==='egy'&&(!/[\u{13000}-\u{1342f}]/u.test(display)||/[0-9]/.test(display)))throw Error('Egyptian year uses Latin digits: '+display);
    await screenshot(q,name+'-'+language+'-localized-year');
    await field.selectOption(String(year+1));
    if(Number(await field.inputValue())!==year+1)throw Error('Year selection failed in '+language);
    const preview=await q.locator('#event-editor .date-preview[data-date-prefix=""]').innerText();
    if(!preview.trim())throw Error('Date preview missing after year selection');
    if((await q.locator('#event-editor select[name=egyYear] option:checked').innerText())===display)throw Error('Year display did not change in '+language);
    results[language]={original:display,selected:year+1};
    await q.locator('#event-editor [data-close]').click();
   }
   await q.close();
   return results;
  });


  await step(name+' shared red rubric and readable hieroglyphic controls',async()=>{
   const q=await ctx.newPage(); q.setDefaultTimeout(8000);
   q.on('dialog',d=>d.accept());
   await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await q.locator('.month-agenda').waitFor();
   await q.evaluate(()=>document.fonts.ready);
   const palette={},rubric='rgb(150, 55, 46)',screens=[];
   for(const language of ['ar','cop','egy']){
    await q.locator('[data-open-panel=settings]').click();
    await q.locator('select[name=language]').selectOption(language);
    if(language==='egy'||language==='cop')await q.locator('select[name=week]').selectOption('10');
    await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
    const month=q.locator('.month-section');
    await month.waitFor();
    await screenshot(q,name+'-'+language+'-red-labels-month');
     const bands=await month.locator('.week-band').count();
     if(language!=='ar'){
       if(bands!==3)throw Error('A full Egyptian month should have 3 ten-day horizontal bands: '+bands);
       for(const group of await month.locator('.decade-days').all()){
         if(await group.locator('.date').count()!==10)throw Error('A decade must show exactly ten adjacent dates');
         const cols=await group.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
         if(cols!==10)throw Error('Ten-day week unexpectedly wrapped into '+cols+' columns');
       }
     }else if(bands<4||bands>6)throw Error('Seven-day month needs 4–6 weekly bands: '+bands);
    const monthLabel=q.locator('.decade-label').first();
    if(language!=='ar'&&await monthLabel.count()){
      const labelColor=await monthLabel.evaluate(el=>getComputedStyle(el).color);
      if(labelColor!==rubric)throw Error(language+' decade label not rubric red: '+labelColor);
    }
    await q.locator('header [data-new]').click();
    await q.locator('#event-editor').waitFor();
    const done=q.locator('.renpet-keyboard:not([hidden]) [data-kb-done]');
    if(await done.count())await done.click();
    await q.locator('#event-editor select[name=egyYear]').scrollIntoViewIfNeeded();
    const info=await q.evaluate(()=>{
     const form=document.querySelector('#event-editor');
     const el=form.querySelector('select[name=egyYear]');
     const date=form.querySelector('.date-fields');
     const label=form.querySelector('.sheet-body>label');
     const time=form.querySelector('.local-time-label');
     const css=selector=>{const x=document.querySelector(selector);if(!x)return null;const c=getComputedStyle(x);return {font:c.fontSize,color:c.color,height:Math.round(x.getBoundingClientRect().height)};};
     const st=getComputedStyle(el);
     const canvas=document.createElement('canvas'),ct=canvas.getContext('2d');
     ct.font=st.font;
     return {
      label:css('#event-editor .sheet-body>label'),
      timeLabel:css('#event-editor .local-time-label'),
      year:css('#event-editor select[name=egyYear]'),
      yearWidth:Math.round(el.getBoundingClientRect().width),
      dateWidth:Math.round(date.getBoundingClientRect().width),
      yearText:el.selectedOptions[0].textContent,
      yearTextWidth:Math.round(ct.measureText(el.selectedOptions[0].textContent).width),
      dateGridColumns:getComputedStyle(date).gridTemplateColumns,
      selectedTime:css('.local-time-value'),
      formWidth:Math.round(form.getBoundingClientRect().width),
      viewportWidth:innerWidth
     };
    });
    if(info.label.color!==rubric||info.timeLabel.color!==rubric)throw Error(language+' labels lack shared red ink: '+JSON.stringify(info));
    if(info.formWidth>info.viewportWidth+2)throw Error(language+' form overflows viewport');
    if(language==='egy'){
      if(parseFloat(info.label.font)<22||parseFloat(info.timeLabel.font)<22)throw Error('Egyptian form labels still microscopic: '+JSON.stringify(info));
      if(parseFloat(info.year.font)<18||info.year.height<58)throw Error('Egyptian long year still shrunk: '+JSON.stringify(info));
      if(info.yearWidth<info.dateWidth*.90)throw Error('Egyptian year not allocated full line: '+JSON.stringify(info));
    }
    await screenshot(q,name+'-'+language+'-red-labels-editor');
    palette[language]=info;
    await q.locator('#event-editor [data-close]').click();
    if(language==='egy'){
     const grid=await q.locator('.month-section').evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight,top:el.getBoundingClientRect().top}));
     const agenda=await q.locator('.month-agenda').evaluate(el=>({top:el.getBoundingClientRect().top,visible:el.getBoundingClientRect().top<innerHeight-80}));
     if(!agenda.visible||agenda.top>670)throw Error('Selected-day agenda still below fold: '+JSON.stringify({grid,agenda}));
     const num=q.locator('.decade-days .date .day-number').first();
     const infoNum=await num.evaluate(el=>({size:getComputedStyle(el).fontSize,
       images:el.querySelectorAll('img').length,strokes:el.querySelectorAll('.egy-date-ones>span').length,
       clustered:!!el.querySelector('.egy-day-ink'),overflow:el.scrollWidth>el.clientWidth+2}));
     if(!infoNum.clustered||!infoNum.strokes||infoNum.images||infoNum.overflow)
      throw Error('Egyptian day signs failed compact grouping: '+JSON.stringify(infoNum));
     await q.locator('[data-open-year]').click();
     const card=q.locator('.year-month-name').first();
     if(parseFloat(await card.evaluate(el=>getComputedStyle(el).fontSize))<22)throw Error('Egyptian year month title still tiny');
     await screenshot(q,name+'-hieroglyphic-readable-year');
     await q.locator('[data-primary-view=today]').click();
     await q.locator('header [data-new]').click();
     await q.locator('input[name=title]').focus();
     await q.locator('.renpet-keyboard:not([hidden])').waitFor();
     const glyphs=await q.evaluate(()=>{
      const key=document.querySelector('.kb-hiero .kb-sign'),grid=document.querySelector('.kb-hiero'),name=document.querySelector('.kb-name');
      return {signFont:getComputedStyle(key).fontSize,nameColor:getComputedStyle(name).color,
       columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
       keyWidth:Math.round(key.getBoundingClientRect().width)};
     });
     if(parseFloat(glyphs.signFont)<35||glyphs.nameColor!==rubric||glyphs.columns!==6)throw Error('Hieroglyphic keyboard unreadable: '+JSON.stringify(glyphs));
     await screenshot(q,name+'-hieroglyphic-rubric-keyboard');
     await q.locator('[data-kb-done]').click();
     await q.locator('#event-editor [data-close]').click();
     palette.keyboard=glyphs;
    }
   }
   await q.close();
   return {sharedPalette:rubric,palette};
  });


  await step(name+' Year grids, Cairo, attested dictionaries and universal outside tap',async()=>{
   const q=await ctx.newPage(); q.setDefaultTimeout(8000);
   q.on('dialog',d=>d.accept());
   await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await q.locator('[data-primary-view=today]').click();
   await q.locator('.month-agenda').waitFor();
   await q.locator('header [data-open-panel=settings]').click();
   if(await q.locator('.ux-panel [data-close-panel]').count())throw Error('Settings close X still visible');
   await q.locator('select[name=language]').selectOption('ar');
   await q.locator('select[name=week]').selectOption('7');
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   if(await q.locator('.ux-panel').count())throw Error('Settings did not close on outside tap');
   await q.evaluate(()=>document.fonts.load('16px CairoRenpet'));
   if(!await q.evaluate(()=>document.fonts.check('16px CairoRenpet')))throw Error('Cairo font not bundled or loaded');
   if(!await q.locator('body').evaluate(el=>getComputedStyle(el).fontFamily.includes('CairoRenpet')))throw Error('Arabic UI still uses system font');
   await q.locator('[data-primary-view=today]').click();
   await q.locator('[data-open-year]').click();
   if((await q.locator('.year-month').count())!==12)throw Error('Year must display 12 months');
   if((await q.locator('.year-mini-day').count())<360)throw Error('Year mini calendars missing numbered days');
   if((await q.locator('.year-mini-today').count())!==1)throw Error('Today missing or multiply highlighted');
   const todayColor=await q.locator('.year-mini-today').evaluate(el=>getComputedStyle(el).backgroundColor);
   const ordinaryColor=await q.locator('.year-mini-day:not(.year-mini-today)').first().evaluate(el=>getComputedStyle(el).backgroundColor);
   if(todayColor===ordinaryColor||todayColor==='rgba(0, 0, 0, 0)')throw Error('Today has no distinct filled marker: '+todayColor);
   await screenshot(q,name+'-arabic-cairo-year-with-today');
   await q.locator('[data-primary-view=today]').click();
   await q.locator('header [data-new]').click();
   await q.locator('#event-editor').waitFor();
   await q.locator('.sheet-overlay').click({position:{x:10,y:10}});
   if(await q.locator('#event-editor').count())throw Error('Editor did not dismiss outside without saving');
   await q.locator('header [data-open-panel=settings]').click();
   await q.locator('[data-backup]').click();
   await q.locator('.renpet-backup-overlay').waitFor();
   if(await q.locator('.renpet-backup-close').count())throw Error('Backup close X remains');
   await q.locator('.renpet-backup-overlay').click({position:{x:10,y:10}});
   if(await q.locator('.renpet-backup-overlay').count())throw Error('Backup did not dismiss on outside tap');
   for(const language of ['cop','egy']){
    await q.locator('header [data-open-panel=settings]').click();
    await q.locator('select[name=language]').selectOption(language);
    await q.locator('select[name=week]').selectOption('10');
    await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
    await q.locator('[data-primary-view=today]').click();
    await q.locator('[data-open-year]').click();
    const grid=q.locator('.year-mini-grid').first();
    if((await grid.getAttribute('data-week'))!=='10')throw Error(language+' year month must show 10-day months');
    if((await q.locator('.year-mini-today').count())!==1)throw Error(language+' today not marked');
    await screenshot(q,name+'-'+language+'-year-with-today');
    await q.locator('[data-primary-view=today]').click();
   }
   await q.locator('header [data-new]').click();
   await q.locator('input[name=title]').focus();
   const key=q.locator('.renpet-keyboard:not([hidden])');
   await key.waitFor();
   await q.locator('input[name=title]').fill('𓆓');
   await q.waitForFunction(()=>document.querySelectorAll('.kb-suggestions [data-kb-pick]').length>=2,{timeout:8000});
   const choices=await q.locator('.kb-suggestions [data-kb-pick]').count();
   if(choices<2)throw Error('Real attested TLA hieroglyphic predictions are absent');
   await screenshot(q,name+'-egyptian-dictionary-predictions');
   await q.locator('.sheet-body').click({position:{x:6,y:160}});
   if(await q.locator('.renpet-keyboard:not([hidden])').count())throw Error('Keyboard did not close when tapping outside');
   await q.close();
   return {arabicFont:'CairoRenpet',yearMonths:12,arabicTodayColor:todayColor,hieroglyphicCandidates:choices};
  });


  await step(name+' iPhone appointment Save survives keyboard in Arabic, Coptic and hieroglyphic',async()=>{
    const q=await ctx.newPage();q.setDefaultTimeout(8000);
    q.on('dialog',d=>d.accept());
    await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await q.locator('.month-section').waitFor();
    const output=[];
    for(const [language,title,sign] of [['ar','اختبار موعد عربي',null],['cop','ⲣⲉⲛⲡⲉⲧ','ⲣ'],['egy','𓆓𓏏','𓆓']]){
      await q.locator('[data-open-panel=settings]').click();
      await q.locator('select[name=language]').selectOption(language);
      await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
      await q.locator('header [data-new]').click();
      await q.locator('#event-editor').waitFor();
      const input=q.locator('#event-editor [name=title]');
      if(sign){
        await input.focus();
        await q.locator('.renpet-keyboard:not([hidden])').waitFor();
        await q.locator('.kb-sign[data-kb-insert="'+sign+'"]').first().click();
        await input.fill(title);
        if(!(await q.locator('.renpet-keyboard:not([hidden])').count()))await input.focus();
      }else await input.fill(title);
      const valid=await q.locator('#event-editor').evaluate(f=>({valid:f.checkValidity(),title:f.elements.title.value, start:f.elements.start.value,end:f.elements.end.value}));
      if(!valid.valid)throw Error(language+' editor fields invalid before save: '+JSON.stringify(valid));
      const save=q.locator('#event-editor [type=submit]');
      await save.scrollIntoViewIfNeeded();
      if(sign&&!(await q.locator('.renpet-keyboard:not([hidden])').count()))await input.focus();
      const rect=await save.boundingBox();
      if(!rect)throw Error(language+' Save button missing');
      await q.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
      await q.locator('.day-page').waitFor({timeout:8000});
      if(await q.locator('#event-editor').count())throw Error(language+' Save tap failed to dismiss editor');
      if(!(await q.locator('.timeline-event:has-text("'+title+'")').count()))
        throw Error(language+' appointment was not displayed after Save');
      const storage=await q.evaluate(()=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items);
      if(!storage.some(x=>x.title===title))throw Error(language+' appointment did not persist');
      await q.reload({waitUntil:'domcontentloaded'});
      await q.locator('.month-section').waitFor();
      if(await q.locator('.day-page').count())throw Error('Month is not default on app relaunch');
      const after=await q.evaluate(()=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items);
      if(!after.some(x=>x.title===title))throw Error(language+' appointment lost after app reload');
      output.push({language,title,stored:true});
      await screenshot(q,name+'-'+language+'-saved-event');
    }
    // Deliberately invalid submission must explain what is missing, never silently fail.
    await q.locator('header [data-new]').click();
    await q.locator('#event-editor [type=submit]').click();
    if(!(await q.locator('#event-editor .event-error[role=alert]').count()))throw Error('Blank title produced no visible validation feedback');
    await q.locator('#event-editor [data-close]').click();
    await q.close();
    return output;
  });


  await step(name+' four-source festival multi-selection and personal calendar isolation',async()=>{
   const q=await ctx.newPage();q.setDefaultTimeout(8000);
   q.on('dialog',d=>d.accept());
   await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await q.locator('.month-section').waitFor();
   await q.locator('header [data-open-panel=settings]').click();
   await q.locator('[name=language]').selectOption('ar');
   const settings=q.locator('.preferences-page');
   if(await settings.locator('[name=festivals]').count())throw Error('Legacy single festival toggle still present');
   await settings.locator('[data-open-panel=festivals]').click();
   const source=q.locator('[data-festival-source-id=amun-theban]');
   await source.waitFor();
   if((await q.locator('.festival-source-row').count())!==4)throw Error('Four festival sources must be selectable');
    if(await q.locator('[data-festival-source-id=christian-coptic],[data-festival-source-id=muslim-egypt]').count())throw Error('Removed religious catalog still offered');
    if(await q.locator('[data-festival-source-id=national-egypt]').isChecked())throw Error('National source must be opt-in');
   const initial=await source.isChecked();
   if(!initial){await source.check();}
   await screenshot(q,name+'-festival-source-picker');
    await q.locator('[data-festival-source-id=national-egypt]').check();
    const together=await q.evaluate(()=>JSON.parse(localStorage.getItem('renpet.settings.v1')).festivalSources);
    if(!together.includes('national-egypt')||!together.includes('amun-theban'))throw Error('Combining independent sources failed');
    await q.locator('[data-festival-source-id=national-egypt]').uncheck();
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   // An event on 1 Thoth (11 Sep 2026) should show a star in the month,
   // festival information on Day, and appear in the upcoming List.
   await q.locator('[data-prev]').click();
   const first=q.locator('[data-date="'+Math.floor(Date.parse('2026-09-11T00:00:00Z')/86400000)+'"]');
   await first.waitFor();
   if(!(await first.locator('.fest-mark').count()))throw Error('Amun festival has no month marker');
   await first.click();
   await q.locator('.day-festivals [data-festival-source=amun-theban]').waitFor();
   await screenshot(q,name+'-amun-festival-day');
   await q.locator('[data-primary-view=list]').click();
   if(!(await q.locator('.festival-in-agenda[data-festival-source=amun-theban]').count()))throw Error('Amun festival missing from List');
   await q.locator('header [data-open-panel=settings]').click();
   await q.locator('[data-open-panel=festivals]').click();
   await source.uncheck();
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   if(await q.locator('.festival-in-agenda').count())throw Error('Disabled Amun festival still appears in List');
   const setting=await q.evaluate(()=>JSON.parse(localStorage.getItem('renpet.settings.v1')).festivalSources);
   if(!Array.isArray(setting)||setting.length)throw Error('Disabled source preference not saved');
   await q.locator('header [data-new]').click();
   const editor=q.locator('#event-editor');
   await editor.locator('[name=title]').fill('festival source isolation check');
   await editor.locator('.save-button').click();
   await q.locator('.timeline-event:has-text("festival source isolation check")').waitFor();
   await q.reload({waitUntil:'domcontentloaded'});
   await q.locator('.month-section').waitFor();
   const restored=await q.evaluate(()=>JSON.parse(localStorage.getItem('renpet.scheduler.v1')).items.some(i=>i.title==='festival source isolation check'));
   if(!restored)throw Error('Personal appointment was affected by disabled festival source');
   await q.locator('header [data-open-panel=settings]').click();
   await q.locator('[data-open-panel=festivals]').click();
   if(await source.isChecked())throw Error('Disabled Amun source was not persisted after reload');
   await source.check();
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   return {sources:['amun-theban','national-egypt','esna-khnum','isis-philae'],monthDayList:true,disabledHidesFestivals:true,
           personalAppointmentsUnaffected:true,persisted:true};
  });

  await ctx.close();
 }
 await step('National festivals remain visible with Gregorian labels hidden in all scripts',async()=>{
  const ctx=await b.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const q=await ctx.newPage();q.setDefaultTimeout(15000);
  await q.clock.install({time:new Date('2026-10-06T12:00:00.000Z')});
  await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await q.locator('.month-section').waitFor();
  const day=Math.floor(Date.parse('2026-10-06T00:00:00Z')/86400000);
  const cell=()=>q.locator('.month-section [data-date="'+day+'"]');
  const event=()=>q.locator('.month-agenda [data-festival-source=national-egypt]');
  const records=[];
  for(const language of ['ar','cop','egy']){
   await q.locator('header [data-open-panel=settings]').click();
   await q.locator('[name=language]').selectOption(language);
   await q.locator('[name=gregorian]').uncheck();
   await q.locator('[data-open-panel=festivals]').click();
   const checkbox=q.locator('[data-festival-source-id=national-egypt]');
   if(!(await checkbox.isChecked()))await checkbox.check();
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await cell().waitFor();
   if(await q.locator('.month-section .greg-day').count())throw Error('Gregorian date labels remain visible in '+language);
   if(!(await cell().locator('.fest-mark').count()))throw Error('National festival marker vanished with Gregorian off: '+language);
   if(!(await cell().getAttribute('data-festival-sources')||'').split(',').includes('national-egypt'))throw Error('National source not represented on Egyptian date in '+language);
   await event().waitFor();
   const title=await event().locator('strong').innerText();
   if(!title)throw Error('National festival title missing in '+language);
   await screenshot(q,'national-without-gregorian-'+language);
   await event().first().click();
   const festivalDate=await q.locator('.festival-detail-sheet .festival-when').innerText();
   if(/2026|٢٠٢٦/.test(festivalDate))throw Error('Festival detail still shows the hidden Gregorian date in '+language);
   await q.locator('[data-close-festival]').click();
   // A date tap opens Day on iPad too, with its national festival preserved.
   await cell().click();
   await q.locator('.day-festivals [data-festival-source=national-egypt]').waitFor();
   await q.locator('[data-back]').click();
   await event().waitFor();
   if((await cell().getAttribute('aria-pressed'))!=='true')throw Error('Selected national day not retained on iPad');
   await q.locator('header [data-open-panel=settings]').click();
   await q.locator('[name=gregorian]').check();
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   if(!(await cell().locator('.fest-mark').count())||!(await event().count()))throw Error('Gregorian toggle changed national events in '+language);
   if(!(await q.locator('.month-section .greg-day').count()))throw Error('Gregorian date labels not restored');
   records.push({language,absoluteDay:day,nationalFestivalVisibleInBothModes:true,title});
  }
  await q.reload({waitUntil:'domcontentloaded'});
  await event().waitFor();
  const saved=await q.evaluate(()=>JSON.parse(localStorage.getItem('renpet.settings.v1')));
  if(!saved.festivalSources.includes('national-egypt'))throw Error('National source selection did not persist');
  await ctx.close();
  return {records,persistent:true};
 });
 await step('iPad/web large GUI has separated calendar, agenda and navigation rail',async()=>{
  const ctx=await b.newContext({viewport:{width:1024,height:768},deviceScaleFactor:1,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const q=await ctx.newPage();q.setDefaultTimeout(8000);
  await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await q.locator('.month-agenda').waitFor();
  const inspect=()=>q.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
   return {shell:getComputedStyle(document.querySelector('.app-shell')).display,month:getComputedStyle(document.querySelector('.month-scroll')).display,
    rail:rect('.ux-bottom'),calendar:rect('.month-section'),agenda:rect('.month-agenda'),
    scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  const ar=await inspect();
  if(ar.shell!=='grid'||ar.month!=='grid')throw Error('Large screen still renders phone-only stack: '+JSON.stringify(ar));
  const overlap=(a,b)=>a.left<b.right-2&&b.left<a.right-2;
  if(overlap(ar.rail,ar.calendar)||overlap(ar.rail,ar.agenda)||overlap(ar.calendar,ar.agenda))
   throw Error('Large view panes overlap: '+JSON.stringify(ar));
  if(ar.scrollWidth>ar.viewport+2)throw Error('Large GUI horizontally clips: '+JSON.stringify(ar));
  await screenshot(q,'ipad-arabic-split-month');
  await q.locator('header [data-open-panel=settings]').click();
  await q.locator('select[name=language]').selectOption('egy');
  await q.locator('select[name=week]').selectOption('10');
  await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
  if(await q.locator('.week-band').count()!==3)throw Error('Egyptian large month has to contain 3 horizontal decade bands');
  await screenshot(q,'ipad-hieroglyphic-split-month');
  const eg=await inspect();
  if(eg.scrollWidth>eg.viewport+2||eg.agenda.width<180)throw Error('iPad hieroglyphic agenda clipped: '+JSON.stringify(eg));
  await ctx.close();return {arabic:ar,egyptian:eg};
 });
 await step('Bold enlarged Egyptian numbers fit phone and iPad',async()=>{
  const ctx=await b.newContext({viewport:{width:375,height:667},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const q=await ctx.newPage();q.setDefaultTimeout(10000);
  await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await q.locator('.month-section').waitFor();
  await q.locator('header [data-open-panel=settings]').click();
  await q.locator('select[name=language]').selectOption('egy');
  await q.locator('select[name=week]').selectOption('10');
  await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
  await q.evaluate(()=>document.fonts.ready);
  const cases=[[320,740,'phone'],[375,667,'phone'],[390,844,'phone'],[744,1133,'tablet-stacked'],[1024,768,'tablet-split']];
  const data=[];
  for(const [width,height,layout] of cases){
   await q.setViewportSize({width,height});
   await q.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   const m=await q.evaluate(()=>{
    const ones=[...document.querySelectorAll('.egy-date-ones:has(>span:nth-child(9))')].at(-1); // day 29, not day 9
    const day=ones?.closest('.day-number'),tens=day?.querySelector('.egy-date-tens');
    const css=el=>el?{size:parseFloat(getComputedStyle(el).fontSize),weight:parseFloat(getComputedStyle(el).fontWeight),
     stroke:parseFloat(getComputedStyle(el).webkitTextStrokeWidth),height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}:null;
    return {layout:document.documentElement.dataset.renpetLayout,day:css(day),tens:css(tens),units:css(ones?.querySelector('span')),
     count:ones?.querySelectorAll(':scope > span').length,
     clipping:day&&(day.scrollWidth>day.clientWidth+2||day.scrollHeight>day.clientHeight+2),
     documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,
     agendaTop:document.querySelector('.month-agenda').getBoundingClientRect().top};
   });
   if(m.layout!==layout||!m.day||!m.units||!m.tens||m.count!==9)throw Error('Lost nine-sign day numeral '+JSON.stringify(m));
   if(m.clipping||m.documentWidth>m.viewport+2)throw Error('Larger bold number clipped '+JSON.stringify(m));
   if(m.units.weight<700||m.tens.weight<700||m.units.stroke<.25||m.tens.stroke<.25)
    throw Error('Hieroglyphic numbers are not bold '+JSON.stringify(m));
   if(m.units.size<(layout==='phone'?15:20)||m.tens.size<(layout==='phone'?17:24))
    throw Error('Hieroglyphic numbers still small '+JSON.stringify(m));
   if(m.agendaTop>=height-65)throw Error('Agenda not visible '+JSON.stringify(m));
   if(width===320||width===744||width===1024)await screenshot(q,'bold-hieroglyphic-numbers-'+width);
   data.push({width,height,layout,unitSize:m.units.size,tensSize:m.tens.size});
  }
  await q.locator('header [data-new]').click();
  await q.locator('input[name=title]').focus();
  await q.locator('.renpet-keyboard:not([hidden])').waitFor();
  const k=await q.locator('.kb-num').first().evaluate(el=>{const s=getComputedStyle(el);return {size:parseFloat(s.fontSize),weight:parseFloat(s.fontWeight),stroke:parseFloat(s.webkitTextStrokeWidth)};});
  if(k.size<30||k.weight<700||k.stroke<.25)throw Error('Keyboard numerals not bold and larger '+JSON.stringify(k));
  await ctx.close();return {screens:data,keyboard:k};
 });
 await step('Viewport 700/1024 and 560 height rules preserve month and live editor',async()=>{
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const q=await ctx.newPage();q.setDefaultTimeout(8000);
  await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await q.locator('.month-agenda').waitFor();
  const selected=await q.locator('.date.chosen').getAttribute('data-date');
  await q.evaluate(()=>globalThis.__responsiveMonthNode=document.querySelector('.app-shell'));
  const measure=()=>q.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
   return {layout:document.documentElement.dataset.renpetLayout,
    shell:getComputedStyle(document.querySelector('.app-shell')).display,
    month:getComputedStyle(document.querySelector('.month-scroll')).display,
    focus:document.querySelector('.date.chosen')?.dataset.date,
    sameDOM:globalThis.__responsiveMonthNode===document.querySelector('.app-shell'),
    cal:rect('.month-section'),agenda:rect('.month-agenda'),rail:rect('.ux-bottom'),
    scrollWidth:document.documentElement.scrollWidth,innerWidth,innerHeight,clientHeight:document.documentElement.clientHeight};
  });
  const cases=[[390,844,'phone'],[844,390,'phone'],[699,900,'phone'],
   [700,559,'phone'],[700,560,'tablet-stacked'],[744,1133,'tablet-stacked'],
   [1023,768,'tablet-stacked'],[1024,559,'phone'],[1024,560,'tablet-split'],
   [1024,768,'tablet-split'],[1440,900,'tablet-split'],[1200,500,'phone']];
  for(const [width,height,expected] of cases){
   await q.setViewportSize({width,height});
   // Browser resize events can land a frame after Playwright resolves the size.
   await q.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   const m=await measure();
   if(m.layout!==expected||m.shell!==(expected==='phone'?'flex':'grid')||m.month!==(expected==='tablet-split'?'grid':'flex'))
    throw Error('Incorrect '+width+'x'+height+' responsive GUI '+JSON.stringify(m));
   if(m.focus!==selected||!m.sameDOM)throw Error('Resizing reset the selected day or remounted the UI');
   if(m.scrollWidth>m.innerWidth+2)throw Error('Layout horizontally overflows '+JSON.stringify(m));
   if(expected==='tablet-stacked'&&(m.agenda.top<m.cal.bottom-2||Math.abs(m.agenda.width-m.cal.width)>3))
    throw Error('Stacked iPad agenda not below the full-width month: '+JSON.stringify(m));
   if(expected==='tablet-split'){
    const overlap=(a,b)=>a.left<b.right-2&&b.left<a.right-2;
    if(overlap(m.cal,m.agenda)||overlap(m.cal,m.rail)||overlap(m.agenda,m.rail))
     throw Error('Split iPad panes overlap: '+JSON.stringify(m));
   }
  }
  await q.setViewportSize({width:1024,height:768});
  await q.locator('[data-new]').click();
  const title=q.locator('#event-editor [name=title]');
  await title.fill('Responsive draft preservation');
  await title.focus();
  await q.setViewportSize({width:1024,height:400});
  await q.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  if(await q.evaluate(()=>document.documentElement.dataset.renpetLayout)!=='tablet-split')
   throw Error('Keyboard-like height shrink incorrectly switched GUI');
  await q.setViewportSize({width:744,height:1133});
  await q.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  if(await q.evaluate(()=>document.documentElement.dataset.renpetLayout)!=='tablet-stacked')
   throw Error('Actual viewport width change did not switch to stacked');
  await q.setViewportSize({width:844,height:390});
  await q.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  if(await q.evaluate(()=>document.documentElement.dataset.renpetLayout)!=='phone')
   throw Error('Short landscape did not use phone GUI');
  if(await title.inputValue()!=='Responsive draft preservation')
   throw Error('Unsaved editor text lost on GUI switch');
  await q.locator('#event-editor [data-close]').click();
  await ctx.close();
  return {tested:cases.length,selectedDayPreserved:true,editorDraftPreserved:true};
 });
 await step('iPad Coptic and Egyptian festivals have native titles, detail text and one Add action',async()=>{
  const ctx=await b.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',timezoneId:'Africa/Cairo'});
  const q=await ctx.newPage();q.setDefaultTimeout(12000);
  await q.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await q.locator('.month-section').waitFor();
  if(await q.locator('.agenda-add-action,[data-new-date]').count())throw Error('Redundant agenda Add remains');
  if(!(await q.locator('header [data-new]').count()))throw Error('Main header Add is missing');
  const day=Math.floor(Date.parse('2026-11-05T00:00:00Z')/86400000),screens=[];
  for(const [language,character]of [['cop',/[\u2c80-\u2cff]/u],['egy',/[\u{13000}-\u{1345f}]/u]]){
   await q.locator('header [data-open-panel=settings]').click();
   await q.locator('[name=language]').selectOption(language);
   await q.locator('.ux-panel-backdrop').click({position:{x:12,y:12}});
   await q.locator('[data-date="'+day+'"]').click();
   const fest=q.locator('.day-festivals .festival-in-agenda[data-festival-open]').first();
   await fest.waitFor();
   const heading=await fest.locator('strong').innerText();
   if(!character.test(heading)||/[\u0600-\u06ff]/u.test(heading))throw Error('Wrong script in agenda title '+language+': '+heading);
   await fest.click();
   const details=q.locator('.festival-detail-sheet');
   await details.waitFor();
   const words=await details.locator('h2,.festival-type,.festival-evidence,h3,.festival-translation-note').allInnerTexts();
   if(words.some(t=>/[\u0600-\u06ff]/u.test(t)))throw Error('Arabic leaked into '+language+' detail');
   if(!words.every(t=>character.test(t)))throw Error('Missing '+language+' translation: '+words.join(' / '));
   if(!(await details.locator('.festival-sources-links a').count()))throw Error('Source links not shown');
   if(await details.evaluate(el=>el.scrollWidth>el.clientWidth+3))throw Error('Festival detail has horizontal overflow');
   await screenshot(q,'ipad-'+language+'-festival-localized');
   screens.push({language,title:heading,sources:await details.locator('.festival-sources-links a').count()});
   await q.locator('[data-close-festival]').click();
   await q.locator('[data-back]').click();
  }
  await ctx.close();return {screens,quickAddRemoved:true};
 });
 await b.close();
}
(async()=>{try{await run()}catch(e){errors.push('FATAL '+String(e.stack||e))}
const report={results,findings,errors,summary:{total:results.length,pass:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,findings:findings.length,errors:errors.length}};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log('RENPET3_REPORT',JSON.stringify(report).slice(0,20000));
if(report.summary.failed||report.summary.errors)process.exitCode=1;})();
