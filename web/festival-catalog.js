// Source registry and date-rule dispatcher for Renpet festivals.
// Source catalogs are separate from user-owned calendar appointments.
// Future catalogs require only a manifest entry + static JSON pack.
import {festivalHits,dayNumber,isoDate,DAY} from './calendar.js';
import {orthodoxEasterDay} from './festival-dates.mjs';

export const AMUN_SOURCE='amun-theban';
const fallback=[{
 id:AMUN_SOURCE,category:'ancient-egyptian',status:'available',
 name:{ar:'آمون — طيبة',cop:'Ⲁⲙⲟⲩⲛ — Ⲑⲏⲃⲁⲓ',egy:'𓇋𓏠𓈖 — 𓌀𓏏𓊖'},
 calendarRule:'egyptian-fixed',data:{type:'embedded',key:'festivals'},defaultEnabled:true
}];

const dateCode=iso=>/^\d{4}-\d\d-\d\d$/.test(iso||'')&&
 Number.isFinite(Date.parse(iso+'T00:00:00Z')) &&
 new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso;
const duration=x=>Math.max(1,Math.min(366,Number.isInteger(x?.duration)?x.duration:1));
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(id);
// Legacy Amun festival IDs include an ICS UID suffix (@egyptian-calendar.local).
// Preserve these source identifiers exactly; pack source IDs stay stricter.
const validEventId=id=>typeof id==='string'&&id.length<=180&&/^[a-z0-9@._-]+$/i.test(id);
const validPack=path=>typeof path==='string'&&/^\.\/festival-packs\/[a-z0-9-]+\.json$/.test(path);
// Installed apps may retain old registries and packs while offline. Enforce
// catalog retirement here as well as in the published source registry.
const retiredIds=new Set(['christian-coptic','muslim-egypt']);
const retiredCategories=new Set(['christian','muslim','islamic']);
const retainedSource=s=>s&&!retiredIds.has(s.id)&&!retiredCategories.has(s.category);
const validSource=s=>retainedSource(s)&&validId(s.id)&&s.status==='available'&&
 ['egyptian-fixed','gregorian-fixed','gregorian-annual','dated','orthodox-easter'].includes(s.calendarRule)&&
 (s.data?.type==='embedded'&&s.data.key==='festivals'||
  s.data?.type==='file'&&validPack(s.data.path));

export async function loadFestivalCatalog(data,fetcher=fetch){
 let manifest=fallback;
 try{
  const result=await fetcher('./festival-sources.json');
  if(!result.ok)throw Error('Registry unavailable');
  const parsed=await result.json();
  if(parsed.schema!==1||!Array.isArray(parsed.sources)||!parsed.sources.length)throw Error('Invalid registry');
  manifest=parsed.sources;
 }catch(err){
  console.warn('Renpet using embedded Amun source registry',err);
 }
 const sources=[],seen=new Set();
 for(const source of manifest){
  if(!validSource(source)||seen.has(source.id))continue;
  seen.add(source.id);
  let events=[];
  try{
   if(source.data.type==='embedded')events=Array.isArray(data?.festivals)?data.festivals:[];
   else{
    const result=await fetcher(source.data.path);
    if(!result.ok)throw Error('Missing festival pack '+source.id);
    const pack=await result.json();
    if(pack.sourceId!==source.id||pack.schema!==1||!Array.isArray(pack.events))throw Error('Invalid festival pack '+source.id);
    events=pack.events;
   }
  }catch(err){console.warn('Renpet festival source unavailable',source.id,err);continue;}
  // A source may contain a mix of fixed and verified per-year movable dates.
  const normalized=events.filter(x=>{
   if(!x||!validEventId(x.id)||typeof x.ar!=='string'||!x.ar.trim())return false;
   const rule=x.calendarRule||source.calendarRule;
   if(!['egyptian-fixed','gregorian-fixed','gregorian-annual','dated','orthodox-easter'].includes(rule))return false;
   if(rule==='dated')return dateCode(x.date);
   if(rule==='orthodox-easter')return Number.isInteger(x.offsetDays??0)&&Math.abs(x.offsetDays??0)<=100;
   if(!Number.isInteger(x.month)||!Number.isInteger(x.day)||x.day<1)return false;
   if(rule==='egyptian-fixed')return x.month>=1&&x.month<=13&&x.day<=(x.month===13?6:30);
   return x.month>=1&&x.month<=12&&dateCode('2000-'+String(x.month).padStart(2,'0')+'-'+String(x.day).padStart(2,'0'));
  }).map(event=>({...event,sourceId:source.id,calendarRule:event.calendarRule||source.calendarRule,duration:duration(event)}));
  sources.push({...source,events:normalized});
 }
 // Never allow an unreachable registry to erase the existing Amun catalog.
 if(!sources.length&&Array.isArray(data?.festivals)){
  return {sources:[{...fallback[0],events:data.festivals.map(x=>({...x,sourceId:AMUN_SOURCE,calendarRule:'egyptian-fixed',duration:duration(x)}))}]};
 }
 return {sources};
}

export function enabledSourceIds(selection,catalog,legacyVisible=true){
 const sources=(catalog?.sources||[]).filter(retainedSource);
 const known=new Set(sources.map(s=>s.id));
 if(Array.isArray(selection))return [...new Set(selection.filter(id=>known.has(id)))];
 return legacyVisible===false?[]:sources.filter(s=>s.defaultEnabled===true).map(s=>s.id);
}

export function festivalSourceName(source,language='ar'){
 return source.name?.[language]||source.name?.ar||source.id;
}

// Gregorian rules are independent of Egyptian era conversion. Use 'dated'
// for modern lunar/variable-date festivals; these dates are supplied by a
// future authoritative pack, never calculated speculatively here.
function hitGregorian(day,event,rule){
 let starts=[];
 if(rule==='dated'){
  if(!dateCode(event.date))return null;
  starts=[dayNumber(event.date)];
 }else if(rule==='orthodox-easter'){
  const year=new Date(day*DAY).getUTCFullYear();
  starts=[year-1,year,year+1].filter(y=>y>=1900&&y<=2200).map(y=>orthodoxEasterDay(y)+(event.offsetDays||0));
 }else{
  const date=new Date(day*DAY);
  for(const year of [date.getUTCFullYear()-1,date.getUTCFullYear()]){
   const iso=String(year)+'-'+String(event.month).padStart(2,'0')+'-'+String(event.day).padStart(2,'0');
   if(dateCode(iso))starts.push(dayNumber(iso));
  }
 }
 return starts.filter(start=>day>=start&&day<start+event.duration)
  .map(start=>({...event,start,end:start+event.duration}));
}
export function festivalHitsForDay(day,years,catalog,selection){
 const allowed=new Set(enabledSourceIds(selection,catalog));
 const results=[];
 for(const source of catalog?.sources||[]){
  if(!allowed.has(source.id))continue;
  const hits=source.events.flatMap(e=>{
   const rule=e.calendarRule||source.calendarRule;
   return rule==='egyptian-fixed'?festivalHits(day,years,[e]):hitGregorian(day,e,rule)||[];
  });
  for(const hit of hits)results.push({...hit,sourceId:source.id,
   sourceName:source.name,category:source.category,calendarRule:source.calendarRule});
 }
 return results;
}

