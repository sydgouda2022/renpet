import test from 'node:test';
import assert from 'node:assert/strict';
import {dayNumber,toGregorian} from '../web/calendar.js';
import {createItem,emptyState,occursOn} from '../web/scheduler.js';
import {exportICS} from '../web/ics-core.mjs';
import {parseICS} from '../web/ics-import.mjs';

const d=dayNumber,now=new Date('2026-11-02T12:00:00Z');
const state=item=>({...emptyState(),items:[item]});
const exportAndImport=item=>{
 const exported=exportICS(state(item),occursOn,{today:d('2026-11-02'),now});
 return {exported,parsed:parseICS(exported.text)};
};

test('February 29 personal birthday round-trips as one true Gregorian yearly recurrence',()=>{
 const birthday=createItem({
  title:'Birthday in leap year',kind:'event',calendarId:'personal',
  startDay:d('2024-02-29'),endDay:d('2024-02-29'),
  allDay:true,startMinutes:0,endMinutes:1440,
  occasionType:'birthday',occasionCalendar:'gregorian',repeat:'gregYearly',
  notes:'Bring cake'
 });
 const {exported,parsed}=exportAndImport(birthday);
 assert.equal(exported.count,1);
 assert.match(exported.text,/RRULE:FREQ=YEARLY/);
 assert.match(exported.text,/X-RENPET-OCCASION-TYPE:BIRTHDAY/);
 assert.match(exported.text,/X-RENPET-OCCASION-CALENDAR:GREGORIAN/);
 assert.equal(parsed.imported,1);
 assert.deepEqual(parsed.items.map(({repeat,occasionType,occasionCalendar,notes,allDay,startMinutes,endMinutes})=>
  ({repeat,occasionType,occasionCalendar,notes,allDay,startMinutes,endMinutes})),
 [{repeat:'gregYearly',occasionType:'birthday',occasionCalendar:'gregorian',
   notes:'Bring cake',allDay:true,startMinutes:0,endMinutes:1440}]);
 assert.doesNotMatch(exported.text,/Renpet calendar:/);
});

test('reminders preserve their type, alarm interval, and exact notes',()=>{
 const reminder=createItem({title:'Shift',kind:'reminder',repeat:'none',startDay:d('2026-11-03'),
  startMinutes:540,endMinutes:600,notes:'Check food quantities',alert:'15min'});
 const {exported,parsed}=exportAndImport(reminder);
 assert.match(exported.text,/CATEGORIES:REMINDER/);
 assert.match(exported.text,/X-RENPET-KIND:REMINDER/);
 assert.equal(parsed.imported,1);
 assert.equal(parsed.items[0].kind,'reminder');
 assert.equal(parsed.items[0].alert,'15min');
 assert.equal(parsed.items[0].notes,'Check food quantities');
 const external=exported.text.replace(/X-RENPET-KIND:REMINDER\r\n/,'');
 assert.equal(parseICS(external).items[0].kind,'reminder','Standard CATEGORIES fallback');
});

test('custom two-decan interval survives ICS without becoming twenty ordinary days',()=>{
 const event=createItem({title:'Rotation',repeat:'custom',repeatEvery:2,repeatUnit:'decan',
  startDay:d('2026-11-02'),startMinutes:630,endMinutes:690});
 const {exported,parsed}=exportAndImport(event);
 assert.match(exported.text,/RRULE:FREQ=DAILY;INTERVAL=20/);
 assert.match(exported.text,/X-RENPET-REPEAT-UNIT:DECAN/);
 assert.equal(parsed.imported,1);
 assert.equal(parsed.items[0].repeat,'custom');
 assert.equal(parsed.items[0].repeatEvery,2);
 assert.equal(parsed.items[0].repeatUnit,'decan');
});

test('unknown nonrepresentable yearly rules are reported rather than silently reinterpreted',()=>{
 const source=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:rfc-yearly',
  'DTSTART;VALUE=DATE:20240229','DTEND;VALUE=DATE:20240301',
  'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29','SUMMARY:External leap birthday',
  'END:VEVENT','END:VCALENDAR'
 ].join('\r\n');
 const result=parseICS(source);
 assert.equal(result.imported,0);
 assert.equal(result.unsupported,1);
 assert.equal(result.total,1);
});

test('invalid native metadata is reported as unsupported, not imported inaccurately',()=>{
 const source=exportAndImport(createItem({title:'Simple',startDay:d('2026-11-02')})).exported.text;
 const tampered=source.replace('END:VEVENT','X-RENPET-OCCASION-TYPE:BIRTHDAY\r\nEND:VEVENT');
 const parsed=parseICS(tampered);
 assert.equal(parsed.imported,0);
 assert.equal(parsed.unsupported,1);
});
