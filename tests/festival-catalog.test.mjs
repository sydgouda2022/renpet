import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dayNumber,toGregorian} from '../web/calendar.js';
import {loadFestivalCatalog,festivalHitsForDay} from '../web/festival-catalog.js';
const read=async name=>JSON.parse(await readFile(new URL('../web/'+name,import.meta.url),'utf8'));
const pack=await read('festival-packs/national-egypt.json');
const fetcher=async()=>({ok:true,json:async()=>pack});
const catalog=await loadFestivalCatalog(fetcher);

test('Renpet includes only contemporary Egyptian national and social occasions',()=>{
 assert.equal(catalog.sources.length,1);
 assert.equal(catalog.sources[0].id,'national-egypt');
 assert.equal(catalog.sources[0].events.length,7);
 assert.equal(catalog.sources[0].category,'national');
 for(const event of catalog.sources[0].events){
  for(const lang of ['ar','cop','egy']){
   assert.ok(event[lang]&&event['description_'+lang],event.id+' '+lang);
  }
  assert.notEqual(event.calendarRule,'egyptian-fixed');
 }
});

test('national anniversaries and spring observances are independent of Egyptian calendar dates',()=>{
 assert.ok(festivalHitsForDay(dayNumber('2026-10-06'),catalog).some(e=>e.id==='armed-forces'));
 assert.ok(festivalHitsForDay(dayNumber('2026-04-13'),catalog).some(e=>e.id==='sham-el-nessim'));
 assert.ok(festivalHitsForDay(dayNumber('2027-05-03'),catalog).some(e=>e.id==='sham-el-nessim'));
 assert.ok(!festivalHitsForDay(dayNumber('2026-10-07'),catalog).some(e=>e.id==='armed-forces'));
 assert.ok(!festivalHitsForDay(toGregorian({year:6268,month:1,day:19}),catalog).some(e=>e.id==='opet'));
});

test('invalid or missing public occasions fail visibly',async()=>{
 await assert.rejects(loadFestivalCatalog(async()=>({ok:false})),/unavailable/i);
 await assert.rejects(loadFestivalCatalog(async()=>({ok:true,json:async()=>({...pack,sourceId:'ancient'})})),/invalid/i);
 const malformed={...pack,events:[{...pack.events[0],description_ar:''}]};
 await assert.rejects(loadFestivalCatalog(async()=>({ok:true,json:async()=>malformed})),/invalid/i);
});
