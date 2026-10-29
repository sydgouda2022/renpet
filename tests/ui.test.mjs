import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('no old storage scheduler is embedded in the UI',async()=>{
 const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
 const scheduler=await readFile(new URL('../web/scheduler.js',import.meta.url),'utf8');
 const backup=await readFile(new URL('../web/backup.js',import.meta.url),'utf8');
 for(const [name,text] of [['app',app],['scheduler',scheduler],['backup',backup]]){
  assert.doesNotMatch(text,/localStorage|renpet\.scheduler\.v1|gregYearly|gregMonthly|SCHEDULER_RECOVERY_KEYS/,name);
 }
 assert.match(app,/readRecord\('scheduler'\)/);
 assert.match(app,/writeRecord\('scheduler',next\)/);
 assert.match(app,/name="reminders"/);
});
