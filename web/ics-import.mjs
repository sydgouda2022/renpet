// Offline, deliberately conservative RFC 5545 import.
// Supported: DATE, local/floating and UTC DATE-TIME, event text, three
// recurrence intervals shared with Renpet, and simple EXDATE exclusions.
// Unsupported zones/rules are counted and skipped rather than moved silently.
import {dayNumber} from './calendar.js';
const unescapeICS=text=>String(text||'').replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1');
const dayISO=(y,m,d)=>String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
const dateValue=(v,allDay=false)=>{
 const m=/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?)?(Z)?$/.exec(v||'');
 if(!m||(!allDay&&!m[4])||(allDay&&m[4]))return null;
 const y=+m[1],month=+m[2],date=+m[3],hour=+(m[4]||0),minute=+(m[5]||0),second=+(m[6]||0);
 if(month<1||month>12||date<1||date>31||hour>23||minute>59||second>59)return null;
 const utc=new Date(Date.UTC(y,month-1,date,hour,minute,second));
 if(utc.getUTCFullYear()!==y||utc.getUTCMonth()+1!==month||utc.getUTCDate()!==date)return null;
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
export function parseICS(text,{minDay=-Infinity,maxDay=Infinity,knownUIDs=[]}={}){
 if(typeof text!=='string'||text.length>5*1024*1024||!/^BEGIN:VCALENDAR\r?$/m.test(text))throw Error('Invalid or oversized ICS calendar');
 const lines=text.replace(/\r\n?/g,'\n').split('\n').reduce((a,line)=>{
  if(/^[ \t]/.test(line)&&a.length)a[a.length-1]+=line.slice(1);
  else a.push(line);
  return a;
 },[]);
 const found=[],known=new Set(knownUIDs),counts={imported:0,duplicate:0,unsupported:0,invalid:0};
 let event=null,total=0;
 for(const line of lines){
  if(line==='BEGIN:VEVENT'){if(event)throw Error('Invalid nested ICS event');event=[];total++;if(total>800)throw Error('Too many ICS records');continue;}
  if(line==='END:VEVENT'){
   if(!event){counts.invalid++;continue;}
   const p=properties(event);event=null;
   const prop=k=>p.get(k)?.[0],uid=unescapeICS(prop('UID')?.value||'').slice(0,240);
   const start=prop('DTSTART'),end=prop('DTEND');
   if(!start||!uid||!end){counts.invalid++;continue;}
   if(known.has(uid)){counts.duplicate++;continue;}
   // TZID, mixed floating/UTC, cancellations and unsupported recurrence rules
   // require a real timezone and recurrence engine; do not import incorrectly.
   if([start,end,...(p.get('EXDATE')||[])].some(x=>x.params.some(y=>y.startsWith('TZID=')||y.startsWith('VALUE=PERIOD')))||
    p.has('RECURRENCE-ID')||p.has('RDATE')||p.get('STATUS')?.[0]?.value==='CANCELLED'){
    counts.unsupported++;continue;
   }
   const allDay=start.params.includes('VALUE=DATE');
   if(allDay!==end.params.includes('VALUE=DATE')){counts.unsupported++;continue;}
   const a=dateValue(start.value,allDay),b=dateValue(end.value,allDay);
   if(!a||!b){counts.invalid++;continue;}
   const last=allDay?b.day-1:b.day;
   if(a.day<minDay||last>maxDay||last<a.day||(last===a.day&&!allDay&&b.minutes<=a.minutes)){
    counts.invalid++;continue;
   }
   const rule=prop('RRULE')?.value,parts=Object.fromEntries((rule||'').split(';').filter(Boolean).map(s=>s.split('=')));
   let repeat='none';
   if(rule){
    const fields=Object.keys(parts);
    if(fields.some(k=>!['FREQ','INTERVAL'].includes(k))){counts.unsupported++;continue;}
    if(parts.FREQ==='DAILY'&&(!parts.INTERVAL||parts.INTERVAL==='1'))repeat='daily';
    else if(parts.FREQ==='DAILY'&&parts.INTERVAL==='10')repeat='egy10';
    else if(parts.FREQ==='WEEKLY'&&(!parts.INTERVAL||parts.INTERVAL==='1'))repeat='weekly';
    else{counts.unsupported++;continue;}
   }
   const excludedDays=[];
   for(const exclusion of p.get('EXDATE')||[]){
    for(const value of exclusion.value.split(',')){
     const ex=dateValue(value,allDay);
     if(!ex){counts.unsupported++;break;}
     excludedDays.push(ex.day);
    }
   }
   if(p.get('EXDATE')?.length&&counts.unsupported&&excludedDays.length===0)continue;
   const title=unescapeICS(prop('SUMMARY')?.value||'Imported event').slice(0,200).trim()||'Imported event';
   found.push({importUID:uid,title,startDay:a.day,endDay:last,startMinutes:allDay?540:a.minutes,
    endMinutes:allDay?600:b.minutes,allDay,location:unescapeICS(prop('LOCATION')?.value||'').slice(0,300),
    notes:unescapeICS(prop('DESCRIPTION')?.value||'').slice(0,4000),repeat,excludedDays:[...new Set(excludedDays)]});
   counts.imported++;known.add(uid);continue;
  }
  if(event!==null)event.push(line);
 }
 return {items:found,...counts,total};
}
