import assert from 'node:assert/strict';
import {dayNumber} from '../web/calendar.js';
import {parseICS} from '../web/ics-import.mjs';
const multi='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:local-1\r\nDTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261028\r\nSUMMARY:Three-day\\nfestival\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:local-2\r\nDTSTART:20261026T090000\r\nDTEND:20261026T100000\r\nRRULE:FREQ=DAILY;INTERVAL=10\r\nEXDATE:20261105T090000\r\nSUMMARY:Ten-day reminder\r\nEND:VEVENT\r\nEND:VCALENDAR';
let x=parseICS(multi,{minDay:dayNumber('1900-01-01'),maxDay:dayNumber('2200-12-31')});
assert.equal(x.imported,2);assert.equal(x.items[0].endDay-x.items[0].startDay,2);
assert.equal(x.items[0].title,'Three-day\nfestival');
assert.equal(x.items[1].repeat,'egy10');assert.deepEqual(x.items[1].excludedDays,[dayNumber('2026-11-05')]);
x=parseICS(multi,{knownUIDs:['local-1']});assert.equal(x.imported,1);assert.equal(x.duplicate,1);
const unsupported=multi.replace('DTSTART:20261026T090000','DTSTART;TZID=America/New_York:20261026T090000');
x=parseICS(unsupported);assert.equal(x.unsupported,1);assert.equal(x.imported,1);
const bad=multi.replace('RRULE:FREQ=DAILY;INTERVAL=10','RRULE:FREQ=MONTHLY;BYDAY=MO');
x=parseICS(bad);assert.equal(x.unsupported,1);assert.equal(x.imported,1);
assert.throws(()=>parseICS('not a calendar'),/Invalid/);
const midnight='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:midnight\r\nDTSTART:20261025T090000\r\nDTEND:20261026T000000\r\nSUMMARY:Midnight\r\nEND:VEVENT\r\nEND:VCALENDAR';
x=parseICS(midnight);assert.equal(x.imported,1);
assert.equal(x.items[0].endDay,x.items[0].startDay);
assert.equal(x.items[0].endMinutes,1440);
x=parseICS(midnight.replace('DTEND:20261026T000000','DTEND:20261026T000000Z'));
assert.equal(x.unsupported,1);assert.equal(x.imported,0);
const badExdate=multi.replace('EXDATE:20261105T090000','EXDATE:20261105T090000,notadate');
x=parseICS(badExdate);assert.equal(x.unsupported,1);assert.equal(x.imported,1);
console.log('ICS UTC, midnight and invalid exclusion regression tests passed');

// Standard IANA time zones convert to local device wall time, without silently
// treating foreign-zone appointments as floating times.
const tzEvent='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:zone-1\r\nDTSTART;TZID=America/New_York:20260115T090000\r\nDTEND;TZID=America/New_York:20260115T100000\r\nSUMMARY:New York appointment\r\nEND:VEVENT\r\nEND:VCALENDAR';
const zoned=parseICS(tzEvent);
assert.equal(zoned.imported,1);
const unknownZone=tzEvent.replaceAll('America/New_York','Not_A_Real_Zone');
assert.equal(parseICS(unknownZone).invalid,1,'Unknown IANA timezones cannot shift appointment times');

// Gregorian recurrence rules are distinct from Egyptian monthly/yearly cycles.
for(const [rule,repeat] of [['FREQ=MONTHLY','gregMonthly'],['FREQ=YEARLY','gregYearly']]){
 const entry=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:greg-'+repeat,'DTSTART:20260115T090000','DTEND:20260115T100000','RRULE:'+rule,'SUMMARY:Gregorian recurrence','END:VEVENT','END:VCALENDAR'].join('\r\n');
 assert.equal(parseICS(entry).items[0].repeat,repeat);
}
