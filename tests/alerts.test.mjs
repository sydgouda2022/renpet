import test from 'node:test';
import assert from 'node:assert/strict';
import {dayNumber} from '../web/calendar.js';
import {createItem,emptyState,upsertItem,excludeOccurrence} from '../web/scheduler.js';
import {dueAlerts} from '../web/alerts.js';
const years=[{year:6282,start:'2026-09-11',days:365},{year:6283,start:'2027-09-11',days:365}];
const day=dayNumber('2026-10-14');
test('local alerts trigger only at their configured foreground due time',()=>{
 const state=emptyState();
 upsertItem(state,createItem({title:'Near reminder',startDay:day,startMinutes:540,alert:'5min'}));
 assert.equal(dueAlerts(state,years,new Date(2026,9,14,8,55,30)).length,1);
 assert.equal(dueAlerts(state,years,new Date(2026,9,14,8,53)).length,0);
 assert.equal(dueAlerts(state,years,new Date(2026,9,14,8,58)).length,0);
});
test('repeat exception and completed reminder suppress alerts',()=>{
 const state=emptyState();
 const repeating=createItem({title:'Ten-day',startDay:day,startMinutes:540,alert:'atTime',repeat:'egy10'});
 upsertItem(state,repeating);
 excludeOccurrence(repeating,day+10);
 assert.equal(dueAlerts(state,years,new Date(2026,9,24,9,0,20)).length,0);
 assert.equal(dueAlerts(state,years,new Date(2026,10,3,9,0,20)).length,1);
 const done=createItem({kind:'reminder',title:'Done',startDay:day,startMinutes:540,alert:'atTime',completed:true});
 const completed=emptyState();upsertItem(completed,done);
 assert.equal(dueAlerts(completed,years,new Date(2026,9,14,9,0,20)).length,0);
});
