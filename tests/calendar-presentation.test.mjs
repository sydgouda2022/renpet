import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SEASONS,seasonForMonth,seasonName,gregorianText} from '../web/calendar-presentation.mjs';
import {toGregorian,dayNumber} from '../web/calendar.js';

const data=JSON.parse(await readFile(new URL('../web/data.json',import.meta.url),'utf8'));
// Verify each boundary using actual dates, including the sixth year-end day
// and the following new year. No independent calendar/leap arithmetic here.
const year=data.years.find(y=>y.year===6282);
assert.equal(year.days,366);
for(const [month,id] of [[1,'akhet'],[4,'akhet'],[5,'peret'],[8,'peret'],[9,'shemu'],[12,'shemu'],[13,'shemu']]){
 assert.equal(seasonForMonth(month).id,id);
 assert.doesNotThrow(()=>toGregorian({year:6282,month,day:month===13?6:30},data.years));
}
assert.equal(seasonForMonth(1).id,'akhet','A new year returns to Akhet');
for(const month of [0,14,1.5,NaN])assert.throws(()=>seasonForMonth(month),RangeError);
assert.deepEqual(SEASONS.map(s=>seasonName(s,'cop')),['Ⲁⲭⲉⲧ','Ⲡⲉⲣⲉⲧ','Ⲥⲙⲟⲩ']);
assert.ok(SEASONS.every(s=>!/[\u0600-\u06ff]/u.test(seasonName(s,'cop')+seasonName(s,'egy'))));

const date=dayNumber('2026-10-25');
for(const language of ['cop','egy']){
 assert.equal(gregorianText(date,language,{day:'numeric'}),'25','Small calendar labels must stay compact');
 assert.equal(gregorianText(dayNumber('2026-11-01'),language,{day:'numeric'}),'1');
 assert.equal(gregorianText(date,language,{weekday:'long',day:'numeric',month:'long',year:'numeric'}),'2026-10-25');
 assert.equal(gregorianText(dayNumber('2027-02-08'),language),'02-08');
}
assert.equal(gregorianText(date,'ar',{day:'numeric'}),'٢٥');
assert.ok(/[\u0600-\u06ff]/u.test(gregorianText(date,'ar',{day:'numeric',month:'long'})));

// These are real runtime assets; a broken or oversized image must fail the
// release before its service worker attempts an atomic offline installation.
let total=0;
for(const {id} of SEASONS){
 const bytes=await readFile(new URL('../web/assets/seasons/'+id+'.webp',import.meta.url));
 assert.equal(bytes.subarray(0,4).toString(),'RIFF');
 assert.equal(bytes.subarray(8,12).toString(),'WEBP');
 assert.ok(bytes.length>20000&&bytes.length<700000,'Web artwork must be complete and compressed: '+id);
 total+=bytes.length;
}
assert.ok(total<1500000,'All three offline backgrounds must stay under 1.5 MB together');
console.log('Season boundaries, sixth epagomenal day, native date labels and web artwork verified');
