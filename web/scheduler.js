import {toEgyptian,toGregorian} from './calendar.js';

export const SCHEDULER_STORE='renpet.scheduler.v1';
export const DEFAULT_CALENDARS=[
 {id:'personal',name:{ar:'شخصي',cop:'ⲛⲟⲩⲓ',egy:'𓀀'},color:'#187568',visible:true},
 {id:'work',name:{ar:'العمل',cop:'ⲃⲱⲕ',egy:'𓂋𓐍𓏏'},color:'#C8A24A',visible:true},
 {id:'home',name:{ar:'المنزل',cop:'ⲏⲓ',egy:'𓉐'},color:'#2C8C7E',visible:true},
];

const copy=value=>JSON.parse(JSON.stringify(value));
const uid=()=>globalThis.crypto?.randomUUID?.()||`r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const nameObject=value=>typeof value==='object'&&value?value:{ar:String(value||''),cop:String(value||''),egy:String(value||'')};

export function emptyState(){return {version:1,calendars:copy(DEFAULT_CALENDARS),items:[]};}

export function normalizeState(value){
 const base=emptyState();
 if(!value||typeof value!=='object')return base;
 if(Array.isArray(value.calendars)){
  const valid=value.calendars.filter(c=>c&&typeof c.id==='string'&&typeof c.color==='string');
  if(valid.length)base.calendars=valid.map(c=>({...c,visible:c.visible!==false,name:nameObject(c.name||c.id)}));
 }
 if(Array.isArray(value.items))base.items=value.items.filter(i=>i&&typeof i.id==='string'&&['event','reminder'].includes(i.kind)&&Number.isInteger(i.startDay));
 return base;
}

// Personal calendar records have a recoverable primary copy and two rotating
// snapshots, independent of dictionary IndexedDB caches. Never call clear().
export const SCHEDULER_RECOVERY_KEYS=Object.freeze(['renpet.scheduler.recovery.1','renpet.scheduler.recovery.2']);
const parseStored=text=>{
 if(typeof text!=='string')return null;
 try{
  const state=JSON.parse(text);
  if(!state||typeof state!=='object'||!Array.isArray(state.items)||!Array.isArray(state.calendars))return null;
  if(state.items.some(i=>!i||typeof i.id!=='string'||!['event','reminder'].includes(i.kind)||
     !Number.isInteger(i.startDay)||!Number.isInteger(i.endDay??i.startDay)||(i.endDay??i.startDay)<i.startDay))return null;
  return normalizeState(state);
 }catch{return null;}
};
export function schedulerRecoveryStatus(storage=globalThis.localStorage){
 try{
  const primary=storage?.getItem(SCHEDULER_STORE);
  const recovered=SCHEDULER_RECOVERY_KEYS.find(key=>parseStored(storage?.getItem(key))!==null);
  return {primaryValid:primary===null||parseStored(primary)!==null,
   primaryMissing:primary===null,recoveryAvailable:!!recovered,recoveredFrom:primary!==null&&!parseStored(primary)?recovered:null};
 }catch{return {primaryValid:false,primaryMissing:false,recoveryAvailable:false,recoveredFrom:null};}
}
export function loadScheduler(storage=globalThis.localStorage){
 try{
  const primary=storage?.getItem(SCHEDULER_STORE);
  if(primary!==null){const valid=parseStored(primary);if(valid)return valid;}
  for(const key of SCHEDULER_RECOVERY_KEYS){
   const snapshot=parseStored(storage?.getItem(key));if(snapshot)return snapshot;
  }
 }catch{}
 return emptyState();
}
export function saveScheduler(state,storage=globalThis.localStorage){
 try{
  if(!storage)return false;
  const current=storage.getItem(SCHEDULER_STORE);
  // An invalid primary without a usable snapshot must not be overwritten by
  // the empty fallback: that would permanently erase the only salvageable copy.
  if(current!==null&&!parseStored(current)&&!SCHEDULER_RECOVERY_KEYS.some(k=>parseStored(storage.getItem(k))))return false;
  const value=JSON.stringify(state);
  if(!parseStored(value))return false;
  // Keep two *previous* verified versions; snapshots failing due to quota
  // cannot erase the primary, but the verified write is still mandatory.
  if(current&&parseStored(current)&&current!==value){
   const prior=storage.getItem(SCHEDULER_RECOVERY_KEYS[0]);
   try{
    if(prior&&parseStored(prior))storage.setItem(SCHEDULER_RECOVERY_KEYS[1],prior);
    storage.setItem(SCHEDULER_RECOVERY_KEYS[0],current);
   }catch{}
  }
  storage.setItem(SCHEDULER_STORE,value);
  return storage.getItem(SCHEDULER_STORE)===value;
 }catch{return false;}
}
export function restoreSchedulerSnapshot(storage=globalThis.localStorage){
 try{
  const existing=storage.getItem(SCHEDULER_STORE);
  for(const key of SCHEDULER_RECOVERY_KEYS){
   const raw=storage.getItem(key);
   if(!parseStored(raw))continue;
   storage.setItem(SCHEDULER_STORE,raw);
   if(storage.getItem(SCHEDULER_STORE)!==raw)throw Error('Failed to restore calendar records');
   return {restored:true,hadCorruptPrimary:existing!==null&&!parseStored(existing)};
  }
 }catch{}
 return {restored:false};
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
// Show saved appointments from historical app versions whose calendar was
// hidden or later deleted. Preserve appointment records and identifiers.
export function revealSavedCalendars(state){
 if(!state.calendars.length)state.calendars.push(copy(DEFAULT_CALENDARS[0]));
 const fallback=state.calendars.find(c=>c.id==='personal')||state.calendars[0];
 const ids=new Set(state.calendars.map(c=>c.id));
 for(const cal of state.calendars)cal.visible=true;
 for(const item of state.items)if(!ids.has(item.calendarId))item.calendarId=fallback.id;
 return state;
}
export function hiddenItemsForDay(state,day,years){
 const visible=visibleCalendars(state);
 return state.items.filter(item=>!visible.has(item.calendarId)&&occursOn(item,day,years));
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
function isStartOccurrence(item,day,years){
 if(day<item.startDay||(item.excludedDays||[]).includes(day))return false;
 const delta=day-item.startDay;
 if(item.repeat==='none')return day===item.startDay;
 if(item.repeat==='daily')return true;
 if(item.repeat==='weekly')return delta%7===0;
 if(item.repeat==='egy10')return delta%10===0;
 const base=toEgyptian(item.startDay,years),candidate=toEgyptian(day,years);
 if(item.repeat==='egyMonthly')return candidate.day===base.day&&monthSerial(candidate)>=monthSerial(base);
 if(item.repeat==='egyYearly')return candidate.year>=base.year&&candidate.month===base.month&&candidate.day===base.day;
 return false;
}
// A concrete recurrence start is identified separately from a day within
// a multi-day occurrence, so moving one event cannot delete the entire series.
export function occurrenceStartForDay(item,day,years){
 const duration=Math.max(0,(item.endDay??item.startDay)-item.startDay);
 for(let start=Math.max(item.startDay,day-duration);start<=day;start++)
  if(isStartOccurrence(item,start,years))return start;
 return null;
}
export function excludeOccurrence(item,start){
 if(item.repeat==='none'||!Number.isInteger(start))return false;
 item.excludedDays=[...new Set([...(item.excludedDays||[]),start])].sort((a,b)=>a-b);
 item.updatedAt=new Date().toISOString();
 return true;
}
export function occursOn(item,day,years){
 if(day<item.startDay)return false;
 return occurrenceStartForDay(item,day,years)!==null;
}

export function itemsForDay(state,day,years){
 const visible=visibleCalendars(state);
 return state.items.filter(item=>visible.has(item.calendarId)&&occursOn(item,day,years))
  .sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.startMinutes-b.startMinutes||a.title.localeCompare(b.title));
}

export function itemsInRange(state,start,endExclusive,years){
 const out=[];
 for(let day=start;day<endExclusive;day++)for(const item of itemsForDay(state,day,years))out.push({day,item});
 return out;
}

export function nextOccurrence(item,fromDay,years,maxDays=370){
 for(let d=Math.max(fromDay,item.startDay);d<Math.max(fromDay,item.startDay)+maxDays;d++)if(occursOn(item,d,years))return d;
 return null;
}

export function searchItems(state,query){
 const q=String(query||'').trim().toLocaleLowerCase();if(!q)return [];
 return state.items.filter(item=>[item.title,item.location,item.notes].some(v=>String(v||'').toLocaleLowerCase().includes(q)));
}

export function egyptianDateOptions(day,years){
 const e=toEgyptian(day,years),y=years.find(v=>v.year===e.year);
 return {year:e.year,month:e.month,day:e.day,daysInMonth:e.month===13?y.days-360:30};
}

export function dayFromEgyptian(year,month,day,years){return toGregorian({year:Number(year),month:Number(month),day:Number(day)},years);}
