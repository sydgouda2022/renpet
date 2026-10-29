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
 assert.deepEqual(REPEAT_RULES,['none','daily','egy10','egyMonthly','egyYearly']);
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
