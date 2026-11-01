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
 assert.doesNotMatch(app,/name="reminders"|requestAlertPermission|startForegroundAlerts/);
});


test('server HTML describes Renpet before JavaScript runs',async()=>{
 const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
 assert.match(html,/<main class="loading" id="main-content" tabindex="-1" aria-busy="true">/);
 assert.match(html,/<h1>رنبت — التقويم المصري<\/h1>/);
 assert.match(html,/<div id="renpet-status" class="loading-sr" role="status" aria-live="polite" aria-atomic="true" lang="ar">/);
 assert.match(html,/<noscript><style>#app>\.loading,#renpet-status,\.skip-to-calendar\{display:none\}<\/style><main class="nojs-fallback"/);
 assert.match(html,/class="skip-to-calendar" href="#main-content"/);
 assert.doesNotMatch(html,/class="skip-to-calendar"[^>]*lang="ar"/);
 for(const property of ['og:title','og:description','og:image','og:url']){
  assert.ok(html.includes('property="'+property+'"'),'missing '+property);
 }
 assert.match(html,/<link rel="canonical" href="https:\/\/renpet\.sydgouda\.workers\.dev\/">/);
 assert.match(html,/<meta name="description"/);
 assert.match(html,/type="image\/svg\+xml" sizes="any"/);
});
