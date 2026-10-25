import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dayNumber} from '../web/calendar.js';

const handlers={};
const root={innerHTML:'',addEventListener:(n,fn)=>{(handlers[n]??=[]).push(fn)},querySelector:()=>null};
const memory=new Map();
// Simulate a returning user who previously selected now-removed catalogs.
memory.set('renpet.settings.v1',JSON.stringify({language:'ar',gregorian:true,
 festivalSources:['amun-theban','christian-coptic','muslim-egypt'],weeks:{}}));
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
globalThis.document={querySelector:s=>s==='#app'?root:null,addEventListener:()=>{},documentElement:{lang:'ar',dir:'rtl',dataset:{}},body:{dataset:{}}};
// The unit smoke loader must serve the manifest AND its read-only packs,
// not silently return data.json for every request.
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(
 new URL('../web/'+(String(url).startsWith('./')?String(url).slice(2):String(url)),import.meta.url),'utf8'))});
await import('../web/app.js');
for(let i=0;i<50&&!root.innerHTML;i++)await new Promise(r=>setTimeout(r,20));
const has=s=>root.innerHTML.includes(s);
function click(n,value=''){const b={disabled:false,dataset:{[n.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:String(value)},hasAttribute:x=>x===n};for(const f of handlers.click||[])f({target:{closest:x=>x==='button'?b:null,stopImmediatePropagation(){},preventDefault(){}}});}
function change(n,value,checked){for(const f of handlers.change||[])f({target:{name:n,value,checked,hasAttribute:()=>false,closest:()=>null}});}
assert.ok(has('class="app-shell"')&&has('month-agenda'),'One calendar with month and selected-day agenda');
assert.deepEqual(JSON.parse(memory.get('renpet.settings.v1')).festivalSources,['amun-theban'],
 'Startup removes retired Christian and Muslim preferences but preserves Amun');
assert.equal((root.innerHTML.match(/class="ux-bottom"/g)||[]).length,1,'One navigation');
assert.ok(has('data-primary-view="today"')&&has('data-primary-view="list"')&&!has('data-primary-view="month"'),'Two useful bottom actions, no redundant Month tab');
assert.ok(!has('data-primary-view="year"')&&!has('data-more')&&!has('data-menu'),'Old redundant navigation removed');
assert.ok(has('data-open-year'),'Year accessible through heading');
assert.ok(has('data-week="7"'),'Arabic defaults to seven-day grid');
assert.ok(has('month-agenda'),'Festivals and events are displayed in the selected-day agenda');
click('data-open-year');
assert.ok(has('year-overview')&&has('year-season'),'Year is readable season/month navigator');
assert.equal((root.innerHTML.match(/data-open-month="/g)||[]).length,13,'12 months and epagomenal entry');
assert.ok(has('year-mini-grid')&&has('year-mini-day'),'Year displays each month with actual numbered days');
assert.ok(has('year-mini-today'),'Today is highlighted inside the matching year month');
click('data-open-month','13');
assert.ok(has('month-agenda'));
assert.ok([5,6].includes((root.innerHTML.match(/class="date /g)||[]).length),'Epagomenal days remain correct');
click('data-primary-view','today');
assert.ok(has('month-agenda'),'Today returns to selected-day agenda rather than switching to Day');
click('data-primary-view','list');
assert.ok(has('class="list-page"'),'List view displays the selected festival sources and user appointments');
assert.ok(has('data-new'),'Empty Schedule has new-event action');
click('data-primary-view','today');
const d=dayNumber('2026-10-17');
for(const layout of ['phone','tablet-stacked','tablet-split']){
 document.documentElement.dataset.renpetLayout=layout;
 click('data-date',d);
 assert.ok(has('timeline-hour'),'Single tap opens selected Day on '+layout);
 assert.equal(document.body.dataset.view,'day');
 click('data-back');
 assert.ok(has('month-agenda'),'Day back returns to Month on '+layout);
 assert.ok(has('data-date="'+d+'"'),'Back retains the selected month on '+layout);
}
click('data-open-panel','settings');
assert.ok(has('preferences-page')&&has('class="app-shell"'),'Settings opens as compact overlay');
assert.ok(has('data-open-panel="calendars"')&&has('data-backup'),'Advanced features nested in Settings');
assert.ok(has('data-open-panel="festivals"'),'Festival source selector is available within Settings');
click('data-open-panel','festivals');
assert.ok(has('festival-source-page')&&has('data-festival-source-id="amun-theban"'),'Amun remains a selectable source');
assert.equal((root.innerHTML.match(/data-festival-source-id="/g)||[]).length,4,'Only Amun, Esna, Isis and national choices present');
assert.ok(!has('data-festival-source-id="christian-coptic"')&&!has('data-festival-source-id="muslim-egypt"'),'Removed sources do not appear in Settings');
for(const handler of handlers.change||[])handler({target:{
 name:'',checked:false,dataset:{festivalSourceId:'amun-theban'},
 hasAttribute:key=>key==='data-festival-source-id',closest:()=>null
}});
assert.deepEqual(JSON.parse(memory.get('renpet.settings.v1')).festivalSources,[],'Festival source choice persists');
for(const handler of handlers.change||[])handler({target:{
 name:'',checked:true,dataset:{festivalSourceId:'amun-theban'},
 hasAttribute:key=>key==='data-festival-source-id',closest:()=>null
}});
assert.deepEqual(JSON.parse(memory.get('renpet.settings.v1')).festivalSources,['amun-theban'],'Multiple-source setting can be reenabled');
click('data-open-panel','settings');
change('language','cop');
assert.equal(document.body.dataset.language,'cop');
assert.ok(has('renpet-decade')&&has('data-week="10"'),'Coptic ten-day months');
change('language','egy');
assert.equal(document.body.dataset.language,'egy');
assert.ok(has('data-week="10"'),'Hieroglyphic ten-day months');
change('gregorian','',false);
assert.ok(!has('class="greg-day"'),'Gregorian overlay toggles');
change('gregorian','',true);
assert.ok(has('class="greg-day"'),'Gregorian overlay can be restored');
change('language','ar');
assert.ok(has('data-week="7"'));
assert.ok(!has('data-close-panel'),'Settings has no close X');
for(const listener of handlers.click||[])listener({target:{closest:s=>s==='[data-dismiss-panel]'?{}:null}});
assert.ok(!has('preferences-page'),'Tapping outside closes settings');
click('data-new');
assert.ok(has('id="event-editor"')&&has('advanced-fields'),'Event editor retains advanced fields behind disclosure');
assert.ok(has('name="repeat"')&&has('name="alert"'),'Recurring events and reminders retained');
click('data-close');
const css=await readFile(new URL('../web/ui.css',import.meta.url),'utf8');
for(const c of ['.month-agenda','.year-season','.advanced-fields','.ux-panel','.schedule-empty','RenpetEgyptian'])assert.ok(css.includes(c),'Present styles: '+c);
for(const dead of ['.more-sheet','.mini-grid','.ux-language','.festival-list'])assert.ok(!css.includes(dead),'Remove unused CSS: '+dead);
assert.ok(!has('Renpet:'),'No runtime errors');
console.log('Renpet direct Month/Year/Day navigation smoke tests passed');
