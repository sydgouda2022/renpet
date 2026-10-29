// RFC 5545 export for Apple Calendar, Google Calendar and other calendar apps.
// All recurrence expansion is local and uses the native Egyptian calendar engine.
const DAY_MS = 86400000;
const stamp = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const ymd = day => new Date(day*DAY_MS).toISOString().slice(0,10).replace(/-/g,'');
const dateTime = (day,minutes) => ymd(day)+'T'+String(Math.floor(minutes/60)).padStart(2,'0')+String(minutes%60).padStart(2,'0')+'00';
const escape = s => String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\n|\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line) {
  // Fold UTF-8 at 75 octets without splitting a Unicode code point.
  const encoder=new TextEncoder();
  const parts=[];let part='',bytes=0;
  for(const ch of line){const n=encoder.encode(ch).length;
    if(bytes+n>75){parts.push(part);part=' ';bytes=1;}
    part+=ch;bytes+=n;
  }
  parts.push(part);return parts.join('\r\n');
}
const validDay = n => Number.isInteger(n) && n >= -25567 && n <= 100000;
const ALARMS={atTime:'PT0S','5min':'-PT5M','15min':'-PT15M','1hour':'-PT1H','1day':'-P1D'};
// Shared identity keeps an exported local event from being duplicated on re-import.
export const eventUID=(item,start=item.startDay)=>String(item.id||'renpet').replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+start+'@renpet.local';
function calendarEvents(state,occursOn,today,maxOccurrences=100000){
  if(!Array.isArray(state?.items))throw Error('No calendar items');
  const calendars=new Map((state.calendars||[]).map(c=>[c.id,c]));
  const out=[];
  for(const item of state.items){
    if(!item || !validDay(item.startDay)||!validDay(item.endDay))continue;
    const span=Math.max(0,item.endDay-item.startDay);
    const repeat=item.repeat||'none';
    let starts=[];
    // Standard iCalendar interval recurrence rules are exported directly.
    // Egyptian month/year recurrence dates are expanded separately.
    const rule=repeat==='daily'?'FREQ=DAILY':repeat==='egy10'?'FREQ=DAILY;INTERVAL=10':
      repeat==='custom'&&['day','decan'].includes(item.repeatUnit)?
       'FREQ=DAILY;INTERVAL='+(item.repeatEvery*(item.repeatUnit==='decan'?10:1)):null;
    if(repeat==='none'||rule){starts=[item.startDay];}
    else {
      // Expand the complete remaining supported Egyptian calendar range.
      // Expand Egyptian month/year rules over a declared ten-year export horizon.
      const first=Math.max(item.startDay,today-366);
      const last=today+366*10;
      // Test only the recurrence start, not the trailing days of a multi-day event.
      const anchor={...item,endDay:item.startDay};
      for(let day=first;day<=last;day++){
        if(occursOn(anchor,day))starts.push(day);
        if(out.length+starts.length>maxOccurrences)throw Error('Too many occurrences for ICS export');
      }
    }
    for(const start of starts){
      if(out.length>=maxOccurrences)throw Error('Too many occurrences for ICS export');
      const allDay=Boolean(item.allDay);
      const startMinutes=Math.max(0,Math.min(1439,Number(item.startMinutes)||0));
      const endMinutes=Math.max(0,Math.min(1440,Number(item.endMinutes)||0));
      const endDay=start+span;
      // Timed end is exclusive; if it is not after start, advance to next day.
      // 24:00 in the editor is next-day 00:00 in RFC 5545.
      const actualEnd=allDay?endDay+1:
       endMinutes===1440?endDay+1:
       endDay===start&&endMinutes<=startMinutes?endDay+1:endDay;
      const exportEndMinutes=endMinutes===1440?0:endMinutes;
      const exdates=(rule&&Array.isArray(item.excludedDays)?
        item.excludedDays.filter(d=>Number.isInteger(d)&&d>=item.startDay).map(d=>
         allDay?ymd(d):dateTime(d,startMinutes)):[]);
      const cal=calendars.get(item.calendarId);
      const summary=String(item.title|| (item.kind==='reminder'?'Reminder':'Event')).trim();
      out.push({
        uid:eventUID(item,start),
        start,end:actualEnd,startMinutes,endMinutes:exportEndMinutes,allDay,summary,rrule:rule,exdates,
        location:String(item.location||''),notes:String(item.notes||''),
        calendar:String(cal?.name?.ar||cal?.name||'Renpet'),
        kind:item.kind||'event',alert:ALARMS[item.alert]||null,completed:Boolean(item.completed),
        createdAt:item.createdAt,updatedAt:item.updatedAt
      });
    }
  }
  return out.sort((a,b)=>a.start-b.start||a.startMinutes-b.startMinutes);
}
export function exportICS(state,occursOn,{today=Math.floor(Date.now()/DAY_MS),now=new Date(),maxOccurrences=100000}={}){
  if(typeof occursOn!=='function')throw Error('Recurrence resolver required');
  const entries=calendarEvents(state,occursOn,today,maxOccurrences);
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Renpet//Egyptian Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Renpet'];
  for(const e of entries){
    lines.push('BEGIN:VEVENT','UID:'+e.uid,'DTSTAMP:'+stamp(now),'SUMMARY:'+escape(e.summary));
    if(e.allDay){lines.push('DTSTART;VALUE=DATE:'+ymd(e.start),'DTEND;VALUE=DATE:'+ymd(e.end));}
    else {lines.push('DTSTART:'+dateTime(e.start,e.startMinutes),'DTEND:'+dateTime(e.end,e.endMinutes));}
    if(e.rrule)lines.push('RRULE:'+e.rrule);
    if(e.exdates?.length)lines.push('EXDATE'+(e.allDay?';VALUE=DATE':'')+':'+e.exdates.join(','));
    if(e.location)lines.push('LOCATION:'+escape(e.location));
    const notes=[e.notes,'Renpet calendar: '+e.calendar].filter(Boolean).join('\n');
    if(notes)lines.push('DESCRIPTION:'+escape(notes));
    if(e.kind==='reminder')lines.push('CATEGORIES:REMINDER');
    if(e.alert)lines.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escape(e.summary),'TRIGGER:'+e.alert,'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return {text:lines.map(fold).join('\r\n')+'\r\n',count:entries.length};
}
