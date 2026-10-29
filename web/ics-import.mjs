// Offline, deliberately conservative RFC 5545 import.
// Supported: DATE, local/floating and UTC DATE-TIME, event text, three
// recurrence intervals shared with Renpet, and simple EXDATE exclusions.
// Unsupported zones/rules are counted and skipped rather than moved silently.
import {dayNumber} from './calendar.js';
const DISPLAY_ALARMS={'PT0S':'atTime','-PT5M':'5min','-PT15M':'15min','-PT1H':'1hour','-P1D':'1day'};
const unescapeICS=text=>String(text||'').replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1');
const dayISO=(y,m,d)=>String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
const timeZoneOf=field=>field.params.find(p=>p.startsWith('TZID='))?.slice(5)||'';
// Convert IANA TZID wall-clock times to the device-local time used by Renpet.
// Reject DST gaps and ambiguous fall-back hours rather than silently shifting.
function ianaDate(y,m,d,h,minute,sec,zone){
 let fmt;
 try{fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}
 catch{return null;}
 const target=Date.UTC(y,m-1,d,h,minute,sec);
 const parts=millis=>Object.fromEntries(fmt.formatToParts(new Date(millis))
  .filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const stamp=p=>Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
 let instant=target;
 for(let i=0;i<4;i++){const diff=target-stamp(parts(instant));instant+=diff;if(diff===0)break;}
 if(stamp(parts(instant))!==target)return null;
 // Reject an overlap where either adjacent hour has the same wall time.
 if(stamp(parts(instant-3600000))===target||stamp(parts(instant+3600000))===target)return null;
 const local=new Date(instant);
 return {day:dayNumber(dayISO(local.getFullYear(),local.getMonth()+1,local.getDate())),
  minutes:local.getHours()*60+local.getMinutes()};
}
const dateValue=(v,allDay=false,zone='')=>{
 const m=/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?)?(Z)?$/.exec(v||'');
 if(!m||(!allDay&&!m[4])||(allDay&&m[4]))return null;
 const y=+m[1],month=+m[2],date=+m[3],hour=+(m[4]||0),minute=+(m[5]||0),second=+(m[6]||0);
 if(month<1||month>12||date<1||date>31||hour>23||minute>59||second>59)return null;
 const utc=new Date(Date.UTC(y,month-1,date,hour,minute,second));
 if(utc.getUTCFullYear()!==y||utc.getUTCMonth()+1!==month||utc.getUTCDate()!==date)return null;
 if(zone&&m[7])return null;
 if(zone&&!allDay)return ianaDate(y,month,date,hour,minute,second,zone);
 if(m[7]){
  const d=new Date(utc.getTime());
  return {day:dayNumber(dayISO(d.getFullYear(),d.getMonth()+1,d.getDate())),minutes:d.getHours()*60+d.getMinutes()};
 }
 return {day:dayNumber(dayISO(y,month,date)),minutes:hour*60+minute};
};
const properties=lines=>{
 const map=new Map();
 for(const line of lines){
  const colon=line.indexOf(':');if(colon<1)continue;
  const descriptor=line.slice(0,colon).split(';').map(s=>s.trim().toUpperCase());
  const key=descriptor[0];const list=map.get(key)||[];
  list.push({value:line.slice(colon+1),params:descriptor.slice(1)});
  map.set(key,list);
 }
 return map;
};
export function parseICS(text,{minDay=-Infinity,maxDay=Infinity,knownUIDs=[],knownSeriesIds=[]}={}){
 if(typeof text!=='string'||text.length>5*1024*1024||!/^BEGIN:VCALENDAR\r?$/m.test(text))throw Error('Invalid or oversized ICS calendar');
 const lines=text.replace(/\r\n?/g,'\n').split('\n').reduce((a,line)=>{
  if(/^[ \t]/.test(line)&&a.length)a[a.length-1]+=line.slice(1);
  else a.push(line);
  return a;
 },[]);
 const found=[],cancellations=[],known=new Set(knownUIDs),series=new Set(knownSeriesIds.map(id=>String(id).replace(/[^a-zA-Z0-9_-]/g,'-'))),counts={imported:0,duplicate:0,unsupported:0,invalid:0};
 let event=null,total=0;
 for(const line of lines){
  if(line==='BEGIN:VEVENT'){if(event)throw Error('Invalid nested ICS event');event=[];total++;if(total>10000)throw Error('Too many ICS records');continue;}
  if(line==='END:VEVENT'){
   if(!event){counts.invalid++;continue;}
   const components=event;
   const p=properties(components);event=null;
   const prop=k=>p.get(k)?.[0],uid=unescapeICS(prop('UID')?.value||'').slice(0,240);
   // An explicit full-series cancellation may omit DTSTART and DTEND.
   // Instance cancellations need RECURRENCE-ID semantics and are not guessed.
   if(prop('STATUS')?.value==='CANCELLED'){
    if(uid&&!p.has('RECURRENCE-ID'))cancellations.push(uid);
    else counts.unsupported++;
    continue;
   }
   const start=prop('DTSTART'),end=prop('DTEND');
   if(!start||!uid||!end){counts.invalid++;continue;}
   // A recurrence expanded for Egyptian calendar export has one UID per date.
   // Recognize all occurrences of a locally owned series, not just its first.
   const suffix=/^(.+)-(\d+)@renpet\.local$/.exec(uid);
   if(known.has(uid)||(suffix&&series.has(suffix[1]))){counts.duplicate++;continue;}
   // Only standard IANA timezone IDs can be converted; custom calendars and
   // cancellation/recurrence overrides require a richer recurrence model.
   if([start,end,...(p.get('EXDATE')||[])].some(x=>x.params.some(y=>y.startsWith('VALUE=PERIOD')))||
    p.has('RECURRENCE-ID')||p.has('RDATE')||p.get('STATUS')?.[0]?.value==='CANCELLED'){
    counts.unsupported++;continue;
   }
   const allDay=start.params.includes('VALUE=DATE');
   const zone=timeZoneOf(start);
   if(timeZoneOf(end)!==zone||(zone&&allDay)){counts.unsupported++;continue;}
   if(!allDay&&start.value.endsWith('Z')!==end.value.endsWith('Z')){counts.unsupported++;continue;}
   if(allDay!==end.params.includes('VALUE=DATE')){counts.unsupported++;continue;}
   const a=dateValue(start.value,allDay,zone),b=dateValue(end.value,allDay,zone);
   if(!a||!b){counts.invalid++;continue;}
   // DTEND is exclusive; next-day midnight is the previous day's ending.
   const midnightEnd=!allDay&&b.day>a.day&&b.minutes===0;
   const last=allDay||midnightEnd?b.day-1:b.day;
   if(a.day<minDay||last>maxDay||last<a.day||(!allDay&&(b.day<a.day||(b.day===a.day&&b.minutes<=a.minutes)))){
    counts.invalid++;continue;
   }
   const rule=prop('RRULE')?.value,parts=Object.fromEntries((rule||'').split(';').filter(Boolean).map(s=>s.split('=')));
   let repeat='none',customInterval=null;
   if(rule){
    const fields=Object.keys(parts);
    const interval=parts.INTERVAL===undefined?1:Number(parts.INTERVAL);
    if(fields.some(k=>!['FREQ','INTERVAL'].includes(k))||parts.FREQ!=='DAILY'||
      !/^[1-9][0-9]*$/.test(String(parts.INTERVAL??'1'))||!Number.isSafeInteger(interval)||
      interval<1||interval>3650){counts.unsupported++;continue;}
    if(interval===1)repeat='daily';
    else if(interval===10)repeat='egy10';
    else{
     const decan=interval>365&&interval%10===0;
     if(interval>365&&!decan){counts.unsupported++;continue;}
     repeat='custom';
     customInterval={repeatEvery:decan?interval/10:interval,repeatUnit:decan?'decan':'day'};
    }
   }
   const alarmCount=components.filter(line=>line==='BEGIN:VALARM').length;
   let alert='none';
   if(alarmCount){
    const trigger=prop('TRIGGER')?.value;
    const actions=p.get('ACTION')||[];
    if(alarmCount!==1||actions.length!==1||actions[0].value!=='DISPLAY'||!Object.hasOwn(DISPLAY_ALARMS,trigger)){
     counts.unsupported++;continue;
    }
    alert=DISPLAY_ALARMS[trigger];
   }
   const excludedDays=[];let invalidExclusion=false;
   for(const exclusion of p.get('EXDATE')||[]){
    for(const value of exclusion.value.split(',')){
     if(timeZoneOf(exclusion)!==zone||(!allDay&&value.endsWith('Z')!==start.value.endsWith('Z'))){invalidExclusion=true;break;}
     const ex=dateValue(value,allDay,zone);
     if(!ex){invalidExclusion=true;break;}
     excludedDays.push(ex.day);
    }
    if(invalidExclusion)break;
   }
   if(invalidExclusion){counts.unsupported++;continue;}
   const title=unescapeICS(prop('SUMMARY')?.value||'Imported event').slice(0,200).trim()||'Imported event';
   found.push({importUID:uid,title,startDay:a.day,endDay:last,startMinutes:allDay?540:a.minutes,
    endMinutes:allDay?600:midnightEnd?1440:b.minutes,allDay,location:unescapeICS(prop('LOCATION')?.value||'').slice(0,300),
    notes:unescapeICS(prop('DESCRIPTION')?.value||'').slice(0,4000),repeat,...(customInterval||{}),alert,excludedDays:[...new Set(excludedDays)]});
   counts.imported++;known.add(uid);continue;
  }
  if(event!==null)event.push(line);
 }
 return {items:found,cancellations,...counts,cancelled:cancellations.length,total};
}
