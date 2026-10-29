// Four locally bundled festival catalogs. Historical festivals are Egyptian-date
// observations; national occasions retain their legal or astronomical source dates.
import {festivalHits,dayNumber,isoDate,DAY} from './calendar.js';
import {orthodoxEasterDay} from './festival-dates.mjs';

export const AMUN_SOURCE='amun-theban';
const rules=new Set(['egyptian-fixed','gregorian-fixed','gregorian-annual','dated','orthodox-easter']);
const dateCode=iso=>/^\d{4}-\d\d-\d\d$/.test(iso||'')&&
 Number.isFinite(Date.parse(iso+'T00:00:00Z')) &&
 new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso;
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(id);
const validPath=path=>typeof path==='string'&&/^\.\/festival-packs\/[a-z0-9-]+\.json$/.test(path);
const translated=entry=>['ar','cop','egy'].every(language=>
 typeof entry?.[language]==='string'&&entry[language].trim().length>0);
function checkEvent(event,source){
 if(!validId(event?.id)||!translated(event)||
 !['cop','egy'].every(language=>typeof event['description_'+language]==='string'&&event['description_'+language].trim()))throw Error('Invalid festival: '+event?.id);
 const rule=event.calendarRule||source.calendarRule;
 if(!rules.has(rule))throw Error('Invalid festival date rule');
 if(!Number.isInteger(event.duration??1)||(event.duration??1)<1||(event.duration??1)>366)throw Error('Invalid festival duration');
 if(rule==='dated'&&dateCode(event.date))return;
 if(rule==='orthodox-easter'&&Number.isInteger(event.offsetDays??0)&&Math.abs(event.offsetDays??0)<=100)return;
 if(!Number.isInteger(event.month)||!Number.isInteger(event.day)||event.day<1)throw Error('Invalid festival day');
 if(rule==='egyptian-fixed'&&event.month>=1&&event.month<=13&&event.day<=(event.month===13?6:30))return;
 if(rule.startsWith('gregorian-')&&event.month>=1&&event.month<=12&&dateCode('2000-'+String(event.month).padStart(2,'0')+'-'+String(event.day).padStart(2,'0')))return;
 throw Error('Invalid festival date');
}
export async function loadFestivalCatalog(data,fetcher=fetch){
 const response=await fetcher('./festival-sources.json');
 if(!response.ok)throw Error('Festival registry unavailable');
 const manifest=await response.json();
 if(!Array.isArray(manifest.sources)||manifest.sources.length!==4)throw Error('Unexpected festival catalog');
 const sources=[],seen=new Set();
 for(const source of manifest.sources){
  if(!validId(source.id)||seen.has(source.id)||!translated(source.name)||!translated(source.description)||
   !rules.has(source.calendarRule)||source.status!=='available')throw Error('Invalid festival source');
  seen.add(source.id);
  let events;
  if(source.data?.type==='embedded'&&source.data.key==='festivals'){
   events=data.festivals;
  }else if(source.data?.type==='file'&&validPath(source.data.path)){
   const fetched=await fetcher(source.data.path);
   if(!fetched.ok)throw Error('Missing festival pack '+source.id);
   const pack=await fetched.json();
   if(pack.sourceId!==source.id)throw Error('Incorrect festival pack');
   events=pack.events;
  }else throw Error('Invalid festival data source');
  if(!Array.isArray(events))throw Error('Missing festival entries');
  for(const event of events)checkEvent(event,source);
  sources.push({...source,events:events.map(event=>({...event,sourceId:source.id,
   calendarRule:event.calendarRule||source.calendarRule,duration:event.duration??1}))});
 }
 return {sources};
}
export function enabledSourceIds(selection,catalog){
 const sources=catalog.sources;
 if(Array.isArray(selection)){
  const known=new Set(sources.map(source=>source.id));
  return [...new Set(selection.filter(id=>known.has(id)))];
 }
 return sources.filter(source=>source.defaultEnabled===true).map(source=>source.id);
}
export function festivalSourceName(source,language='ar'){
 return source.name?.[language]||source.id;
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
export function festivalHitsForDay(day,catalog,selection){
 const allowed=new Set(enabledSourceIds(selection,catalog));
 const results=[];
 for(const source of catalog?.sources||[]){
  if(!allowed.has(source.id))continue;
  const hits=source.events.flatMap(e=>{
   const rule=e.calendarRule||source.calendarRule;
   return rule==='egyptian-fixed'?festivalHits(day,[e]):hitGregorian(day,e,rule)||[];
  });
  for(const hit of hits)results.push({...hit,sourceId:source.id,
   sourceName:source.name,category:source.category,calendarRule:hit.calendarRule||source.calendarRule});
 }
 return results;
}

