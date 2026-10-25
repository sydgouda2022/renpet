import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toGregorian,dayNumber} from '../web/calendar.js';
import {AMUN_SOURCE,loadFestivalCatalog,enabledSourceIds,festivalHitsForDay} from '../web/festival-catalog.js';
import {emptyState,createItem,upsertItem,itemsForDay} from '../web/scheduler.js';

const read=async name=>JSON.parse(await readFile(new URL('../web/'+name,import.meta.url),'utf8'));
const data=await read('data.json');
const actualManifest=await read('festival-sources.json');
const fetchManifest=async u=>({ok:true,json:async()=>
 u==='./festival-sources.json'?actualManifest:read(u.replace('./',''))
});
const catalog=await loadFestivalCatalog(data,fetchManifest);
assert.equal(catalog.sources.length,4,'Only Amun, national, Esna and Isis are selectable');
assert.deepEqual(catalog.sources.map(s=>s.id),['amun-theban','national-egypt','esna-khnum','isis-philae']);
assert.ok(!catalog.sources.some(s=>['christian-coptic','muslim-egypt'].includes(s.id)));
assert.deepEqual(enabledSourceIds(['national-egypt','christian-coptic','muslim-egypt'],catalog),['national-egypt'],'Legacy selections of removed packs are ignored');

// An installed PWA can still return a six-source registry and its old packs
// while offline. Retirement must be enforced by code, not only by deleting
// current files or assuming network revalidation always succeeds.
const retiredSources=[
 {id:'christian-coptic',category:'christian'},
 {id:'muslim-egypt',category:'muslim'},
 // A retired ID stays retired even if its cached category is incorrect.
 {id:'christian-coptic',category:'national'},
 // Category filtering also covers a stale catalog with another source ID.
 {id:'old-christian',category:'christian'},
 {id:'old-muslim',category:'muslim'},
 {id:'old-islamic',category:'islamic'}
].map(source=>({...source,status:'available',name:{ar:'مصدر قديم'},
 calendarRule:'gregorian-annual',defaultEnabled:true,
 data:{type:'file',path:'./festival-packs/'+source.id+'.json'},
 events:[{id:'retired-event',ar:'عيد قديم',month:10,day:6,duration:1}]}));
const staleManifest={...actualManifest,sources:[...actualManifest.sources,...retiredSources]};
const requestedPacks=[];
const staleCatalog=await loadFestivalCatalog(data,async url=>{
 requestedPacks.push(url);
 if(url==='./festival-sources.json')return {ok:true,json:async()=>staleManifest};
 const retired=retiredSources.find(source=>source.data.path===url);
 return retired?{ok:true,json:async()=>({schema:1,sourceId:retired.id,events:retired.events})}:fetchManifest(url);
});
assert.deepEqual(staleCatalog.sources.map(source=>source.id),catalog.sources.map(source=>source.id),
 'Cached retired catalogs cannot reappear as selectable festival sources');
for(const source of retiredSources){
 assert.ok(!requestedPacks.includes(source.data.path),'Do not request a retired festival pack: '+source.id);
}
const legacyCatalog={sources:[...catalog.sources,...retiredSources]};
const oldSelection=['national-egypt',...retiredSources.map(source=>source.id)];
assert.deepEqual(enabledSourceIds(oldSelection,legacyCatalog),['national-egypt'],
 'Legacy in-memory catalogs must also reject retired source selections');
assert.ok(!enabledSourceIds(null,legacyCatalog).some(id=>retiredSources.some(source=>source.id===id)),
 'Retired default-enabled sources must never become enabled');
assert.deepEqual(festivalHitsForDay(dayNumber('2026-10-06'),data.years,legacyCatalog,oldSelection).map(event=>event.id),
 ['armed-forces'],'A stale catalog must produce only the retained national festival');

// Every festival, including embedded Amun and all three external packs,
// must contain its own native-script title and descriptive interpretation.
// A missing localization must not show Arabic in Coptic/hieroglyphic screens.
const arabic=/[\u0600-\u06ff]/u;
const coptic=/[\u2c80-\u2cff]/u;
const glyph=/[\u{13000}-\u{1345f}]/u;
for(const source of catalog.sources){
 for(const locale of ['cop','egy']){
  const expression=locale==='cop'?coptic:glyph;
  assert.ok(expression.test(source.name[locale]),'Native source title: '+source.id+' '+locale);
  assert.ok(expression.test(source.description[locale]),'Native source description: '+source.id+' '+locale);
  assert.ok(!arabic.test(source.name[locale]+source.description[locale]),'Arabic leaked into native source '+source.id);
 }
 for(const festival of source.events){
  for(const locale of ['cop','egy']){
   const expression=locale==='cop'?coptic:glyph;
   const description=festival['description_'+locale];
   assert.ok(typeof festival[locale]==='string'&&expression.test(festival[locale]),'Native event title missing '+festival.id+' '+locale);
   assert.ok(typeof description==='string'&&description.length>=18&&expression.test(description),'Native description missing '+festival.id+' '+locale);
   assert.ok(!arabic.test(festival[locale]+description),'Arabic leaked into festival '+festival.id+' '+locale);
  }
 }
}
assert.equal(catalog.sources.reduce((n,s)=>n+s.events.length,0),24,'All 24 retained festival titles and notes localized');

assert.equal(catalog.sources[0].id,AMUN_SOURCE);
assert.equal(catalog.sources[0].events.length,data.festivals.length,'Do not change attested Amun date list');
assert.equal(enabledSourceIds(null,catalog).join(','),AMUN_SOURCE,'Amun enabled for existing users');
assert.deepEqual(enabledSourceIds(null,catalog,false),[],'Legacy festival off migrates to none');
assert.deepEqual(enabledSourceIds([],catalog),[],'Explicitly disabled source persists');
assert.deepEqual(enabledSourceIds([AMUN_SOURCE,AMUN_SOURCE,'nonexistent'],catalog),[AMUN_SOURCE]);

const festival=data.festivals.find(x=>x.month===1&&x.day===1);
const newYear=toGregorian({year:6282,month:1,day:1},data.years);
assert.equal(catalog.sources.find(s=>s.id==='national-egypt').events.length,7);
assert.equal(catalog.sources.find(s=>s.id==='esna-khnum').events.length,3);
assert.equal(catalog.sources.find(s=>s.id==='isis-philae').events.length,1);
assert.ok(festivalHitsForDay(toGregorian({year:6282,month:11,day:13},data.years),data.years,catalog,['esna-khnum']).some(f=>f.id==='esna-neith-visit'));
assert.ok(festivalHitsForDay(toGregorian({year:6282,month:13,day:4},data.years),data.years,catalog,['isis-philae']).some(f=>f.id==='isis-epagomenal-birthday'));
assert.equal(festivalHitsForDay(toGregorian({year:6282,month:13,day:4},data.years),data.years,catalog,[]).length,0,'No historical catalog on opt-out');
assert.ok(festivalHitsForDay(dayNumber('2026-04-13'),data.years,catalog,['national-egypt']).some(f=>f.id==='sham-el-nessim'));
const october6=dayNumber('2026-10-06');
assert.ok(festivalHitsForDay(october6,data.years,catalog,['national-egypt']).some(f=>f.id==='armed-forces'),
 '6 October national festival remains attached to its absolute date on the Egyptian calendar');
assert.equal(festivalHitsForDay(october6,data.years,catalog,[]).length,0,
 'Festival source selection, not Gregorian label display, is the visibility switch');
assert.equal(festivalHitsForDay(october6,data.years,catalog,['national-egypt']).some(f=>f.id==='armed-forces'),true,
 'Hide-Gregorian mode must use the same independent absolute-date catalog');

assert.ok(festivalHitsForDay(dayNumber('2027-05-03'),data.years,catalog,['national-egypt']).some(f=>f.id==='sham-el-nessim'),
 'Sham El Nessim remains an Egyptian national observance despite removing Christian festival lists');
for(const removed of ['christian-coptic','muslim-egypt']){
 assert.deepEqual(enabledSourceIds([removed],catalog),[],removed+' cannot be selected');
 assert.equal(festivalHitsForDay(dayNumber('2026-04-12'),data.years,catalog,[removed]).length,0,removed+' cannot produce events');
}
assert.ok(festival,'Existing Amun list contains Wepet Renpet');
const defaultHits=festivalHitsForDay(newYear,data.years,catalog,[AMUN_SOURCE]);
assert.ok(defaultHits.some(x=>x.id===festival.id),'Amun calendar dates remain intact');
assert.equal(festivalHitsForDay(newYear,data.years,catalog,[]).length,0,'Disabling Amun removes festival overlays');

// Personal data remains independent when all festival sources are disabled.
const personal=emptyState(),appointment=createItem({title:'Birthday',kind:'event',
 startDay:newYear,endDay:newYear,startMinutes:540,endMinutes:600,calendarId:'personal'});
upsertItem(personal,appointment);
assert.equal(itemsForDay(personal,newYear,data.years).length,1,'Personal appointments unaffected by festival filtering');

// Keep the registry extensible with secular and ancient-Egyptian sources only.
const nextManifest={schema:1,sources:[
 actualManifest.sources[0],
 {id:'national-test',status:'available',category:'national',name:{ar:'أعياد وطنية'},
  calendarRule:'gregorian-annual',data:{type:'file',path:'./festival-packs/national-test.json'}},
 {id:'ancient-test',status:'available',category:'ancient-egyptian',name:{ar:'اختبار أثري'},
  calendarRule:'egyptian-fixed',data:{type:'file',path:'./festival-packs/ancient-test.json'}}
]};
const packs={
 './festival-packs/national-test.json':{schema:1,sourceId:'national-test',events:[{id:'nat-1',ar:'عيد تجريبي وطني',month:12,day:25,duration:1}]},
 './festival-packs/ancient-test.json':{schema:1,sourceId:'ancient-test',events:[{id:'anc-1',ar:'احتفال مصري تجريبي',month:4,day:16,duration:2}]}
};
const future=await loadFestivalCatalog(data,async url=>({ok:!!(url==='./festival-sources.json'||packs[url]),
 json:async()=>url==='./festival-sources.json'?nextManifest:packs[url]}));
assert.equal(future.sources.length,3,'Independent nonreligious and historical catalogs supported');
assert.deepEqual(enabledSourceIds(null,future),[AMUN_SOURCE],'Additional catalogs require opt-in');
const dec25=dayNumber('2026-12-25');
const ancientStart=toGregorian({year:6282,month:4,day:16},data.years);
assert.deepEqual(festivalHitsForDay(dec25,data.years,future,['national-test']).map(x=>x.id),['nat-1']);
assert.deepEqual(festivalHitsForDay(ancientStart,data.years,future,['ancient-test']).map(x=>x.id),['anc-1']);
assert.deepEqual(festivalHitsForDay(ancientStart+1,data.years,future,['ancient-test']).map(x=>x.id),['anc-1']);
assert.equal(festivalHitsForDay(dec25,data.years,future,[]).length,0);

const fallback=await loadFestivalCatalog(data,async()=>{throw Error('offline registry blocked')});
assert.equal(fallback.sources[0].events.length,data.festivals.length,'Amun remains readable if registry request fails');
console.log('Four-source registry, retained national Sham El Nessim and personal calendar isolation passed');

