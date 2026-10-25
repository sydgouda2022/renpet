// RFC 5545 export for Apple Calendar, Google Calendar and other calendar apps.
// No network calls: the caller passes its local Renpet data and Egyptian-year table.
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
function calendarEvents(state,years,occursOn,today,maxOccurrences=5000){
  if(!Array.isArray(state?.items))throw Error('No calendar items');
  if(!Array.isArray(years)||!years.length)throw Error('Calendar years missing');
  const calendars=new Map((state.calendars||[]).map(c=>[c.id,c]));
  const endOfYears=Math.floor(Date.parse(years.at(-1).start+'T00:00:00Z')/DAY_MS)+years.at(-1).days-1;
  const startOfYears=Math.floor(Date.parse(years[0].start+'T00:00:00Z')/DAY_MS);
  const out=[];
  for(const item of state.items){
    if(!item || !validDay(item.startDay)||!validDay(item.endDay))continue;
    const span=Math.max(0,item.endDay-item.startDay);
    const repeat=item.repeat||'none';
    let starts=[];
    // Genuine Gregorian-interval recurrences should survive beyond two years.
    // Egyptian month/year recurrence dates are expanded separately.
    const rule=repeat==='daily'?'FREQ=DAILY':repeat==='weekly'?'FREQ=WEEKLY':
      repeat==='egy10'?'FREQ=DAILY;INTERVAL=10':null;
    if(repeat==='none'||rule){starts=[item.startDay];}
    else {
      const first=Math.max(item.startDay,today,startOfYears);
      const last=Math.min(endOfYears, today+730);
      // Test only the recurrence start, not the trailing days of a multi-day event.
      const anchor={...item,endDay:item.startDay};
      for(let day=first;day<=last;day++){
        if(occursOn(anchor,day,years))starts.push(day);
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
        uid:String(item.id||'renpet').replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+start+'@renpet.local',
        start,end:actualEnd,startMinutes,endMinutes:exportEndMinutes,allDay,summary,rrule:rule,exdates,
        location:String(item.location||''),notes:String(item.notes||''),
        calendar:String(cal?.name?.ar||cal?.name||'Renpet'),
        kind:item.kind||'event',completed:Boolean(item.completed),
        createdAt:item.createdAt,updatedAt:item.updatedAt
      });
    }
  }
  return out.sort((a,b)=>a.start-b.start||a.startMinutes-b.startMinutes);
}
export function exportICS(state,years,occursOn,{today=Math.floor(Date.now()/DAY_MS),now=new Date(),maxOccurrences=5000}={}){
  if(typeof occursOn!=='function')throw Error('Recurrence resolver required');
  const entries=calendarEvents(state,years,occursOn,today,maxOccurrences);
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
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return {text:lines.map(fold).join('\r\n')+'\r\n',count:entries.length};
}
