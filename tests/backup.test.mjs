import assert from 'node:assert/strict';
import { createBackup, parseBackup, restoreBackup, BACKUP_FORMAT } from '../web/backup-core.mjs';
class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
const s = new MemoryStorage();
s.setItem('renpet.settings.v1', '{"language":"ar","gregorian":true}');
s.setItem('renpet.scheduler.v1', '{"events":[{"title":"مناسبة"}],"calendars":[]}');
s.setItem('renpet.keyboard.personal.v1', '{"egy:𓄿":7}');
s.setItem('renpet.keyboard.coptic-dialect.v1', 'sahidic');
s.setItem('unrelated.app', '{"private":"must not export"}');
const raw = createBackup(s, new Date('2026-10-14T00:00:00Z'));
const data = parseBackup(raw);
assert.equal(JSON.parse(raw).format, BACKUP_FORMAT);
assert.equal(JSON.parse(raw).created_at, '2026-10-14T00:00:00.000Z');
assert.equal(Object.keys(data.entries).length, 4);
assert.equal(raw.includes('unrelated.app'), false);
const destination = new MemoryStorage();
destination.setItem('renpet.settings.v1', '{"language":"cop"}');
assert.equal(restoreBackup(destination, data), 4);
assert.equal(destination.getItem('renpet.settings.v1'), s.getItem('renpet.settings.v1'));
assert.equal(destination.getItem('renpet.scheduler.v1'), s.getItem('renpet.scheduler.v1'));
assert.equal(destination.getItem('renpet.keyboard.personal.v1'), s.getItem('renpet.keyboard.personal.v1'));
assert.equal(destination.getItem('renpet.keyboard.coptic-dialect.v1'), 'sahidic');
assert.equal(JSON.parse(raw).entries['renpet.keyboard.coptic-dialect.v1'],'sahidic');
const older={...data,entries:{...data.entries,'renpet.keyboard.coptic-dialect.v1':'"bohairic"'}};
restoreBackup(destination,older);
assert.equal(destination.getItem('renpet.keyboard.coptic-dialect.v1'),'bohairic');
assert.throws(()=>parseBackup(JSON.stringify({format:BACKUP_FORMAT,entries:{'renpet.keyboard.coptic-dialect.v1':'unsafe'}})),/Invalid Coptic dialect/);
assert.throws(() => parseBackup('{"format":"bad","entries":{}}'));
assert.throws(() => parseBackup('{"format":"renpet.backup.v1","entries":{"evil":"{}"}}'));
assert.throws(() => parseBackup('{"format":"renpet.backup.v1","entries":{"renpet.settings.v1":"oops"}}'));
assert.throws(() => parseBackup('x'.repeat(6 * 1024 * 1024)));
class FailingStorage extends MemoryStorage {
  setItem(key, value) {
    if (key === 'renpet.scheduler.v1') throw new Error('Quota exceeded');
    super.setItem(key, value);
  }
}
const f = new FailingStorage();
f.data.set('renpet.settings.v1', '{"language":"cop"}');
assert.throws(() => restoreBackup(f, data), /Quota exceeded/);
assert.equal(f.getItem('renpet.settings.v1'), '{"language":"cop"}');
console.log('Renpet backup tests passed');
