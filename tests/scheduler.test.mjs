import test from 'node:test';
import assert from 'node:assert/strict';
import {dayNumber,toGregorian} from '../web/calendar.js';
import {
 emptyState,validateSchedulerData,createItem,upsertItem,removeItem,itemsForDay,
 createCalendar,updateCalendar,removeCalendar,ensureSavedItemVisible,
 toggleCompleted,isCompleted,excludeOccurrence,occurrenceStartForDay,nextOccurrence,REPEAT_RULES
} from '../web/scheduler.js';
const day=dayNumber('2026-10-14');
test('empty local calendar state is valid',()=>{
 const state=emptyState();
 assert.equal(state.calendars.length,3);
 assert.equal(state.items.length,0);
 assert.equal(validateSchedulerData(state),true);
 assert.deepEqual(REPEAT_RULES,['none','daily','egy10','egyMonthly','egyYearly','custom']);
});
test('appointments and calendars are edited without persistence side effects',()=>{
 const s=emptyState(),a=createItem({title:'Egyptian appointment',startDay:day,calendarId:'personal'});
 upsertItem(s,a);
 assert.equal(itemsForDay(s,day).length,1);
 assert.equal(validateSchedulerData(s),true);
 const c=createCalendar(s,'Family','#123456');
 a.calendarId=c.id;
 updateCalendar(s,c.id,{visible:false});
 assert.equal(itemsForDay(s,day).length,0);
 ensureSavedItemVisible(s,a);
 assert.equal(itemsForDay(s,day).length,1);
 assert.ok(removeCalendar(s,c.id,'personal'));
 assert.equal(a.calendarId,'personal');
 removeItem(s,a.id);
 assert.equal(s.items.length,0);
});
test('all recurrences follow Egyptian days, months or years',()=>{
 const original=toGregorian({year:6268,month:2,day:26});
 for(const [repeat,expected] of [
  ['daily',original+1],
  ['egy10',original+10],
  ['egyMonthly',toGregorian({year:6268,month:3,day:26})],
  ['egyYearly',toGregorian({year:6269,month:2,day:26})]
 ]){
  const e=createItem({title:repeat,repeat,startDay:original});
  assert.equal(nextOccurrence(e,original+1),expected,repeat);
  excludeOccurrence(e,expected);
  assert.equal(occurrenceStartForDay(e,expected),null);
 }
});
test('sixth epagomenal day is never fabricated in common years',()=>{
 const day6=toGregorian({year:6268,month:13,day:6});
 const event=createItem({title:'Sixth day',startDay:day6,repeat:'egyYearly'});
 assert.equal(nextOccurrence(event,day6+1,365*5),toGregorian({year:6272,month:13,day:6}));
});
test('reminder completion and invalid data',()=>{
 const s=emptyState(),e=createItem({kind:'reminder',title:'Reminder',startDay:day,repeat:'egy10'});
 upsertItem(s,e);toggleCompleted(e,day);
 assert.equal(isCompleted(e,day),true);
 assert.equal(isCompleted(e,day+10),false);
 assert.equal(validateSchedulerData(s),true);
 e.repeat='gregYearly';
 assert.equal(validateSchedulerData(s),false);
});

test('custom every 6 days crosses the Egyptian month and year boundary',()=>{
 const start=toGregorian({year:6268,month:12,day:28});
 const event=createItem({title:'Buy food for the shift',startDay:start,repeat:'custom',repeatEvery:6,repeatUnit:'day'});
 assert.equal(validateSchedulerData({...emptyState(),items:[event]}),true);
 assert.equal(nextOccurrence(event,start+1),start+6);
 assert.equal(nextOccurrence(event,start+7),start+12);
 for(let i=1;i<=3;i++)assert.equal(occurrenceStartForDay(event,start+6*i),start+6*i);
 assert.equal(occurrenceStartForDay(event,start+5),null);
 excludeOccurrence(event,start+6);
 assert.equal(occurrenceStartForDay(event,start+6),null);
 assert.equal(occurrenceStartForDay(event,start+12),start+12);
});
test('custom intervals work across Egyptian decades, months, years and short epagomenal months',()=>{
 const start=toGregorian({year:6268,month:12,day:6});
 const decan=createItem({title:'Rotation',startDay:start,repeat:'custom',repeatEvery:2,repeatUnit:'decan'});
 assert.equal(nextOccurrence(decan,start+1),start+20);
 const monthly=createItem({title:'Household',startDay:start,repeat:'custom',repeatEvery:2,repeatUnit:'month'});
 assert.equal(nextOccurrence(monthly,start+1,200),toGregorian({year:6269,month:1,day:6}));
 const years=createItem({title:'Review',startDay:start,repeat:'custom',repeatEvery:2,repeatUnit:'year'});
 assert.equal(nextOccurrence(years,start+1,900),toGregorian({year:6270,month:12,day:6}));
 const epagomenal=toGregorian({year:6268,month:13,day:6});
 const leapDay=createItem({title:'Leap day',startDay:epagomenal,repeat:'custom',repeatEvery:2,repeatUnit:'year'});
 assert.equal(nextOccurrence(leapDay,epagomenal+1,5*366),toGregorian({year:6272,month:13,day:6}));
});
test('invalid custom intervals are rejected without silently changing the schedule',()=>{
 for(const [repeatEvery,repeatUnit] of [[0,'day'],[366,'month'],[1.5,'day'],[6,'gregorianWeek'],[null,'day']]){
  const item=createItem({title:'Invalid',startDay:day,repeat:'custom',repeatEvery,repeatUnit});
  assert.equal(validateSchedulerData({...emptyState(),items:[item]}),false);
 }
});
