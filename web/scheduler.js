import {toEgyptian,toGregorian,monthLength} from './calendar.js';

export const DEFAULT_CALENDARS=[
 {id:'personal',name:{ar:'شخصي',cop:'ⲛⲟⲩⲓ',egy:'𓀀'},color:'#187568',visible:true},
 {id:'work',name:{ar:'العمل',cop:'ⲃⲱⲕ',egy:'𓂋𓐍𓏏'},color:'#C8A24A',visible:true},
 {id:'home',name:{ar:'المنزل',cop:'ⲏⲓ',egy:'𓉐'},color:'#2C8C7E',visible:true},
];

const copy=value=>structuredClone(value);
const uid=()=>crypto.randomUUID();
export function emptyState(){return {calendars:copy(DEFAULT_CALENDARS),items:[]};}
export const REPEAT_RULES=Object.freeze(['none','daily','egy10','egyMonthly','egyYearly']);
export function validateSchedulerData(state){
 if(!state||!Array.isArray(state.calendars)||!state.calendars.length||!Array.isArray(state.items))return false;
 const calendars=new Set(),ids=new Set();
 for(const c of state.calendars){
  if(!c||typeof c.id!=='string'||!c.id||calendars.has(c.id)||!/^#[0-9a-f]{6}$/i.test(c.color)||!c.name||typeof c.name!=='object')return false;
  calendars.add(c.id);
 }
 for(const i of state.items){
  if(!i||typeof i.id!=='string'||!i.id||ids.has(i.id)||!calendars.has(i.calendarId)||!['event','reminder'].includes(i.kind)||typeof i.title!=='string'||!i.title.trim()||i.title.length>200)return false;
  if(!Number.isInteger(i.startDay)||!Number.isInteger(i.endDay)||i.endDay<i.startDay||i.endDay-i.startDay>3660)return false;
  if(!Number.isInteger(i.startMinutes)||i.startMinutes<0||i.startMinutes>=1440||!Number.isInteger(i.endMinutes)||i.endMinutes<0||i.endMinutes>1440)return false;
  if(!REPEAT_RULES.includes(i.repeat)||!['none','atTime','5min','15min','1hour','1day'].includes(i.alert))return false;
  if(typeof i.location!=='string'||i.location.length>300||typeof i.notes!=='string'||i.notes.length>4000)return false;
  if(!Array.isArray(i.excludedDays||[])||!Array.isArray(i.completedDays||[]))return false;
  ids.add(i.id);
 }
 return true;
}
export function createItem(values){
 const now=new Date().toISOString();
 return {
  id:uid(),kind:values.kind==='reminder'?'reminder':'event',title:String(values.title||'').trim(),
  startDay:Number(values.startDay),endDay:Number.isInteger(values.endDay)?values.endDay:Number(values.startDay),
  startMinutes:Number.isInteger(values.startMinutes)?values.startMinutes:540,
  endMinutes:Number.isInteger(values.endMinutes)?values.endMinutes:600,
  allDay:Boolean(values.allDay),location:String(values.location||'').trim(),notes:String(values.notes||'').trim(),
  calendarId:String(values.calendarId||'personal'),alert:String(values.alert||'none'),repeat:String(values.repeat||'none'),
  completed:Boolean(values.completed),completedDays:Array.isArray(values.completedDays)?values.completedDays:[],createdAt:now,updatedAt:now
 };
}
export function updateItem(item,values){return {...item,...values,title:String(values.title??item.title).trim(),updatedAt:new Date().toISOString()};}
export function upsertItem(state,item){
 const i=state.items.findIndex(v=>v.id===item.id);if(i>=0)state.items[i]=item;else state.items.push(item);return item;
}
export function removeItem(state,id){state.items=state.items.filter(v=>v.id!==id);}
// Ensure that a newly saved event can actually appear on the calendar.
// A previously hidden or removed calendar must not accept an event that
// immediately disappears from Day, Month, and List views.
export function ensureSavedItemVisible(state,item){
 let calendar=state.calendars.find(c=>c.id===item.calendarId);
 if(!calendar){
  calendar=state.calendars.find(c=>c.id==='personal')||state.calendars[0];
  if(!calendar){calendar=copy(DEFAULT_CALENDARS[0]);state.calendars.push(calendar);}
  item.calendarId=calendar.id;
 }
 calendar.visible=true;
 return item;
}
export function revealSavedCalendars(state){
 for(const cal of state.calendars)cal.visible=true;
 return state;
}
export function hiddenItemsForDay(state,day){
 const visible=visibleCalendars(state);
 return instancesForDay(state,day,item=>!visible.has(item.calendarId));
}
export function calendarFor(state,id){return state.calendars.find(c=>c.id===id)||state.calendars[0];}
export function visibleCalendars(state){return new Set(state.calendars.filter(c=>c.visible!==false).map(c=>c.id));}
export function createCalendar(state,name,color='#187568'){
 const label=String(name||'').trim();if(!label)return null;
 const calendar={id:uid(),name:{ar:label,cop:label,egy:label},color:String(color||'#187568'),visible:true,custom:true};
 state.calendars.push(calendar);return calendar;
}
export function updateCalendar(state,id,{name,color,visible}={}){
 const calendar=state.calendars.find(c=>c.id===id);if(!calendar)return null;
 if(name!==undefined){const label=String(name).trim();if(label)calendar.name={ar:label,cop:label,egy:label};}
 if(color!==undefined)calendar.color=String(color);
 if(visible!==undefined)calendar.visible=Boolean(visible);
 return calendar;
}
export function removeCalendar(state,id,reassignTo){
 if(state.calendars.length<=1)return false;
 const index=state.calendars.findIndex(c=>c.id===id);if(index<0)return false;
 const fallback=state.calendars.find(c=>c.id===(reassignTo||'' )&&c.id!==id)||state.calendars.find(c=>c.id!==id);
 if(!fallback)return false;
 for(const item of state.items)if(item.calendarId===id)item.calendarId=fallback.id;
 state.calendars.splice(index,1);return true;
}
export function itemName(item){return item.title|| (item.kind==='reminder'?'Reminder':'Event');}
export function isCompleted(item,day){return item.kind==='reminder'&&(item.repeat==='none'?Boolean(item.completed):(item.completedDays||[]).includes(day));}
export function toggleCompleted(item,day){
 if(item.kind!=='reminder')return item;
 if(item.repeat==='none')item.completed=!item.completed;
 else{const set=new Set(item.completedDays||[]);set.has(day)?set.delete(day):set.add(day);item.completedDays=[...set].sort((a,b)=>a-b);}
 item.updatedAt=new Date().toISOString();return item;
}

function monthSerial(e){return e.year*13+(e.month-1);}
function isStartOccurrence(item,day){
 if(day<item.startDay||(item.excludedDays||[]).includes(day))return false;
 const delta=day-item.startDay;
 if(item.repeat==='none')return day===item.startDay;
 if(item.repeat==='daily')return true;
 if(item.repeat==='egy10')return delta%10===0;
 const base=toEgyptian(item.startDay),candidate=toEgyptian(day);
 if(item.repeat==='egyMonthly')return candidate.day===base.day&&monthSerial(candidate)>=monthSerial(base);
 if(item.repeat==='egyYearly')return candidate.year>=base.year&&candidate.month===base.month&&candidate.day===base.day;
 return false;
}
// A concrete recurrence start is identified separately from a day within
// a multi-day occurrence, so moving one event cannot delete the entire series.
/** Every recurrence anchor whose span contains this calendar day.
 * A long event repeating daily may have multiple independent live instances.
 * Exclusions apply to the anchor, not all trailing dates of that instance.
 */
export function occurrenceStartsForDay(item,day){
 if(!Number.isInteger(day)||day<item.startDay)return [];
 const duration=Math.max(0,(item.endDay??item.startDay)-item.startDay);
 const starts=[];
 for(let start=Math.max(item.startDay,day-duration);start<=day;start++)
  if(isStartOccurrence(item,start))starts.push(start);
 return starts;
}
export function occurrenceStartForDay(item,day){
 const starts=occurrenceStartsForDay(item,day);
 // Prefer the occurrence beginning on the selected date, if one exists.
 return starts.at(-1)??null;
}
export function excludeOccurrence(item,start){
 if(item.repeat==='none'||!Number.isInteger(start))return false;
 item.excludedDays=[...new Set([...(item.excludedDays||[]),start])].sort((a,b)=>a-b);
 item.updatedAt=new Date().toISOString();
 return true;
}
export function occursOn(item,day){
 if(day<item.startDay)return false;
 return occurrenceStartForDay(item,day)!==null;
}

function instancesForDay(state,day,include){
 return state.items.flatMap(item=>{
  if(!include(item))return [];
  const starts=occurrenceStartsForDay(item,day);
  return item.repeat==='none'?(starts.length?[item]:[]):
   starts.map(start=>({...item,_occurrenceStart:start}));
 }).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||
  a.startMinutes-b.startMinutes||a.title.localeCompare(b.title)||
  (a._occurrenceStart??a.startDay)-(b._occurrenceStart??b.startDay));
}
export function itemsForDay(state,day){
 const visible=visibleCalendars(state);
 return instancesForDay(state,day,item=>visible.has(item.calendarId));
}

export function itemsInRange(state,start,endExclusive){
 const out=[];
 for(let day=start;day<endExclusive;day++)for(const item of itemsForDay(state,day))out.push({day,item});
 return out;
}

export function nextOccurrence(item,fromDay,maxDays=370){
 for(let d=Math.max(fromDay,item.startDay);d<Math.max(fromDay,item.startDay)+maxDays;d++)if(isStartOccurrence(item,d))return d;
 return null;
}

export function searchItems(state,query){
 const q=String(query||'').trim().toLocaleLowerCase();if(!q)return [];
 return state.items.filter(item=>[item.title,item.location,item.notes].some(v=>String(v||'').toLocaleLowerCase().includes(q)));
}

export function egyptianDateOptions(day){
 const e=toEgyptian(day);
 return {year:e.year,month:e.month,day:e.day,daysInMonth:monthLength(e.year,e.month)};
}

export function dayFromEgyptian(year,month,day){return toGregorian({year:Number(year),month:Number(month),day:Number(day)});}
