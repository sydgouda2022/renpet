import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackup,parseBackup,BACKUP_FORMAT} from '../web/backup-core.mjs';
import {emptyState,createItem,upsertItem} from '../web/scheduler.js';
import {dayNumber} from '../web/calendar.js';
test('backup is a standalone local-only document',()=>{
 const scheduler=emptyState();upsertItem(scheduler,createItem({title:'Home',startDay:dayNumber('2026-10-30')}));
 const preferences={language:'ar',gregorian:false,reminders:false,weeks:{ar:10},festivalSources:[]};
 const body=createBackup({scheduler,preferences},new Date('2026-10-30T00:00:00Z'));
 const raw=JSON.parse(body);
 assert.equal(raw.format,BACKUP_FORMAT);
 assert.equal(raw.exportedAt,'2026-10-30T00:00:00.000Z');
 assert.deepEqual(parseBackup(body),{scheduler,preferences});
});
test('reject malformed data and obsolete schemas',()=>{
 for(const input of ['{bad','{}','{"format":"renpet.backup.v1"}',
 JSON.stringify({format:BACKUP_FORMAT,scheduler:{items:[]},preferences:{}})])
  assert.throws(()=>parseBackup(input));
});
