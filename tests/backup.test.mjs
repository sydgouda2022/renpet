import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackup,parseBackup,BACKUP_FORMAT} from '../web/backup-core.mjs';
import {emptyState,createItem,upsertItem} from '../web/scheduler.js';
import {dayNumber} from '../web/calendar.js';
test('backup is a standalone local-only document',()=>{
 const scheduler=emptyState();upsertItem(scheduler,createItem({title:'Home',startDay:dayNumber('2026-10-30')}));
 const preferences={language:'ar',gregorian:false,dynamicLighting:true,showHolidays:false,weeks:{ar:10}};
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

test('reject invalid language, preference values and recurrence settings in backups',()=>{
 const scheduler=emptyState();
 const defaults={language:'ar',gregorian:true,dynamicLighting:true,showHolidays:true,weeks:{ar:7}};
 const invalid=[
  {...defaults,language:'english'},
  {...defaults,gregorian:'false'},
  {...defaults,weeks:{ar:9}},
  {...defaults,weeks:{unknown:7}},
  {...defaults,unexpected:true},
  {...defaults,weeks:[]}
 ];
 for(const preferences of invalid){
  assert.throws(()=>createBackup({scheduler,preferences}),/preferences/i);
  assert.throws(()=>parseBackup(JSON.stringify({format:BACKUP_FORMAT,scheduler,preferences})),/backup/i);
 }
});
