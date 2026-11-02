// Public occasions observed in contemporary Egypt. Personal occasions
// belong to the local scheduler, never to this read-only public catalog.
import {dayNumber,DAY} from './calendar.js';
import {orthodoxEasterDay} from './festival-dates.mjs';

const SOURCE_ID='national-egypt';
const validDate=(iso)=>{
 if(typeof iso!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(iso))return false;
 const date=new Date(iso+'T00:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===iso;
};
export async function loadFestivalCatalog(fetcher=fetch){
 const response=await fetcher('./festival-packs/national-egypt.json');
 if(!response.ok)throw Error('Egyptian public occasions unavailable');
 const pack=await response.json();
 if(pack.sourceId!==SOURCE_ID||!Array.isArray(pack.events))throw Error('Invalid public occasions');
 const ids=new Set();
 for(const event of pack.events){
  if(!/^[a-z][a-z0-9-]+$/.test(event.id||'')||ids.has(event.id)||
   !['ar','cop','egy'].every(language=>typeof event[language]==='string'&&event[language].trim())||
   !['ar','cop','egy'].every(language=>typeof event['description_'+language]==='string'&&event['description_'+language].trim()))
   throw Error('Invalid public occasion '+event?.id);
  ids.add(event.id);
  if(event.calendarRule==='orthodox-easter'){
   if(!Number.isInteger(event.offsetDays)||Math.abs(event.offsetDays)>7)throw Error('Invalid spring date');
  }else if(!validDate('2000-'+String(event.month).padStart(2,'0')+'-'+String(event.day).padStart(2,'0')))
   throw Error('Invalid annual occasion date');
 }
 return {sources:[{
  id:SOURCE_ID,category:'national',name:{
   ar:'المناسبات المصرية',cop:'Ⲛⲓϣⲁⲓ ⲛ̀ⲧⲉ Ⲭⲏⲙⲓ',egy:'𓎛𓃀𓎱 𓆳𓏺 𓈉𓏤'
  },events:pack.events.map(event=>({
   ...event,sourceId:SOURCE_ID,
   calendarRule:event.calendarRule||'gregorian-annual',duration:1
  }))
 }]};
}
export function festivalSourceName(source,language='ar'){
 return source?.name?.[language]||source?.name?.ar||'';
}
export function festivalHitsForDay(day,catalog){
 const date=new Date(day*DAY),year=date.getUTCFullYear(),month=date.getUTCMonth()+1,dayOfMonth=date.getUTCDate();
 const source=catalog?.sources?.[0];
 if(!source)return [];
 return source.events.flatMap(event=>{
  const rule=event.calendarRule;
  let matches;
  if(rule==='orthodox-easter'){
   matches=year>=1900&&year<=2200&&day===orthodoxEasterDay(year)+event.offsetDays;
  }else matches=event.month===month&&event.day===dayOfMonth;
  return matches?[{
   ...event,start:day,end:day+1,sourceName:source.name,
   category:source.category
  }]:[];
 });
}
