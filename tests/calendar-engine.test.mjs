import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 dayNumber,isoDate,EPOCH_YEAR,EPOCH_DAY,
 yearStart,isLeapYear,monthLength,toEgyptian,toGregorian,monthGrid
} from '../web/calendar.js';

test('modern Egyptian year 6268 begins on 11 September 2026',()=>{
 assert.equal(EPOCH_YEAR,6268);
 assert.equal(EPOCH_DAY,dayNumber('2026-09-11'));
 assert.deepEqual(toEgyptian(dayNumber('2026-10-29')),{year:6268,month:2,day:19});
 assert.equal(yearStart(6269),dayNumber('2027-09-12'));
 assert.equal(monthLength(6268,13),6);
 assert.equal(monthLength(6269,13),5);
 assert.equal(isLeapYear(6268),true);
 assert.equal(isLeapYear(6269),false);
 assert.deepEqual(toEgyptian(dayNumber('2027-09-11')),{year:6268,month:13,day:6});
 assert.deepEqual(toEgyptian(dayNumber('2027-09-12')),{year:6269,month:1,day:1});
 assert.throws(()=>toGregorian({year:6269,month:13,day:6}),RangeError);
});

test('every supported Gregorian day round-trips through Egyptian dates',()=>{
 const start=dayNumber('1900-01-01'),end=dayNumber('2200-12-31');
 for(let day=start;day<=end;day++){
  const egyptian=toEgyptian(day);
  assert.equal(toGregorian(egyptian),day,'Round trip failed for '+isoDate(day));
 }
});

test('ten-day grouping preserves native Egyptian months and epagomenal days',()=>{
 assert.equal(monthGrid(6268,2,10).length,30);
 assert.equal(monthGrid(6268,13,10).filter(Boolean).length,6);
 assert.equal(monthGrid(6269,13,10).filter(Boolean).length,5);
 assert.equal(monthGrid(6268,1,7).filter(Boolean).length,30);
});

test('packaged calendar contains no precomputed year table',async()=>{
 const source=JSON.parse(await readFile(new URL('../web/data.json',import.meta.url),'utf8'));
 assert.equal(Object.hasOwn(source,'years'),false);
 assert.deepEqual(source.epoch,{date:'2026-09-11',year:6268});
});
