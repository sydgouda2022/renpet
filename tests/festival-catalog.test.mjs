import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dayNumber,toGregorian} from '../web/calendar.js';
import {AMUN_SOURCE,loadFestivalCatalog,enabledSourceIds,festivalHitsForDay} from '../web/festival-catalog.js';
const read=async name=>JSON.parse(await readFile(new URL('../web/'+name,import.meta.url),'utf8'));
const data=await read('data.json'),manifest=await read('festival-sources.json');
const fetcher=async url=>({ok:true,json:async()=>url==='./festival-sources.json'?manifest:read(url.replace('./',''))});
const catalog=await loadFestivalCatalog(data,fetcher);
test('exactly four clean, localized festival catalogs',()=>{
 assert.deepEqual(catalog.sources.map(s=>s.id),[AMUN_SOURCE,'national-egypt','esna-khnum','isis-philae']);
 assert.deepEqual(catalog.sources.map(s=>s.events.length),[13,7,3,1]);
 assert.deepEqual(enabledSourceIds(null,catalog),[AMUN_SOURCE]);
 assert.deepEqual(enabledSourceIds(['national-egypt','national-egypt'],catalog),['national-egypt']);
 assert.deepEqual(enabledSourceIds([],catalog),[]);
 for(const source of catalog.sources){
  for(const locale of ['ar','cop','egy']){
   assert.ok(source.name[locale]&&source.description[locale]);
  }
  for(const event of source.events){
   assert.match(event.id,/^[a-z][a-z0-9-]+$/);
   for(const locale of ['cop','egy']){
    assert.ok(event[locale]&&event['description_'+locale]);
    assert.doesNotMatch(event[locale]+event['description_'+locale],/\$\{[A-Z]+\}|[\u0600-\u06ff]/u);
   }
  }
 }
});
test('historical dates use Egyptian months; national dates remain independent',()=>{
 assert.ok(festivalHitsForDay(toGregorian({year:6268,month:1,day:1}),catalog,[AMUN_SOURCE]).some(e=>e.id==='wepet-renpet'));
 assert.ok(festivalHitsForDay(toGregorian({year:6268,month:11,day:13}),catalog,['esna-khnum']).some(e=>e.id==='esna-neith-visit'));
 assert.ok(festivalHitsForDay(toGregorian({year:6268,month:13,day:4}),catalog,['isis-philae']).some(e=>e.id==='isis-epagomenal-birthday'));
 assert.ok(festivalHitsForDay(dayNumber('2026-10-06'),catalog,['national-egypt']).some(e=>e.id==='armed-forces'));
 assert.ok(festivalHitsForDay(dayNumber('2026-04-13'),catalog,['national-egypt']).some(e=>e.id==='sham-el-nessim'));
 assert.equal(festivalHitsForDay(dayNumber('2026-10-06'),catalog,[]).length,0);
});
test('malformed or missing festival packs fail rather than silently masking data problems',async()=>{
 await assert.rejects(loadFestivalCatalog(data,async()=>({ok:false})),/registry/i);
 const broken={...manifest,sources:manifest.sources.slice(0,3)};
 await assert.rejects(loadFestivalCatalog(data,async()=>({ok:true,json:async()=>broken})),/catalog/i);
 await assert.rejects(loadFestivalCatalog(data,async url=>url==='./festival-sources.json'?
  {ok:true,json:async()=>manifest}:{ok:false}),/pack/i);
});
