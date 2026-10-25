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

// Regression: an exclusive midnight DTEND must not create a phantom next-day appointment.
const midnight='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:midnight\r\nDTSTART:20261025T230000\r\nDTEND:20261026T000000\r\nSUMMARY:Late meeting\r\nEND:VEVENT\r\nEND:VCALENDAR';
const mid=parseICS(midnight);assert.equal(mid.imported,1);
assert.equal(mid.items[0].startDay,mid.items[0].endDay);
// Different DTSTART/DTEND time interpretations must not be silently combined.
const mixed=midnight.replace('DTSTART:20261025T230000','DTSTART:20261025T230000Z');
assert.equal(parseICS(mixed).unsupported,1);
// Invalid exclusion invalidates the occurrence rather than importing a partial exception list.
const invalidExdate=multi.replace('EXDATE:20261105T090000','EXDATE:20261105T090000,NOT_A_DATE');
const badExceptions=parseICS(invalidExdate);
assert.equal(badExceptions.imported,1);assert.equal(badExceptions.unsupported,1);

console.log('ICS one-way import and conflict handling verified');
