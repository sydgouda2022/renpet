/** Local-first, self-repairing Coptic lexicon installation for browser PWAs.
 *  Uses its own IndexedDB database: no access to documents, appointments or learning.
 *  SHA-256 verifies payload bytes against the pinned manifest on each open.
 *  This is byte-integrity checking, not a digital signature of the publisher.
 */
export const DB_NAME='coptic-lexicon-install-v1';
export const MANIFEST_URL=new URL('./coptic-lexicon/manifest.json',import.meta.url).href;
export const PAYLOAD_URL=new URL('./coptic-lexicon/lexicon.json',import.meta.url).href;
const FORMAT='coptic-lexicon-install-v1';
let inFlight=null;
const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
const native=s=>typeof s==='string'&&[...s].some(c=>{const n=c.codePointAt(0);return (n>=0x2c80&&n<=0x2cff)||(n>=0x03e2&&n<=0x03ef)||(n>=0x0370&&n<=0x03ff)||(n>=0x1f00&&n<=0x1fff);});

export function validateCatalog(payload){
 if(!payload||payload.format!=='coptic-predict-v1'||payload.language!=='cop'||!Array.isArray(payload.rows)||!payload.rows.length||!payload.metadata||!payload.popularity||typeof payload.popularity!=='object'||Array.isArray(payload.popularity))throw Error('Invalid Coptic lexicon format');
 if(!Array.isArray(payload.dialects)||payload.dialects.join(',')!=='Sahidic,Bohairic')throw Error('Unsupported Coptic dialect inventory');
 const forms=new Set();
 for(const row of payload.rows){
  if(!Array.isArray(row)||row.length!==2||!native(row[0])||!Number.isInteger(row[1])||row[1]<0||row[1]>3||forms.has(row[0]))throw Error('Invalid or duplicate Coptic word form');
  forms.add(row[0]);
 }
 for(const [form,value] of Object.entries(payload.popularity)){
  if(!forms.has(form)||!Number.isSafeInteger(value)||value<0)throw Error('Invalid Coptic frequency record');
 }
 if(payload.metadata.spelling_records!==payload.rows.length||typeof payload.metadata.complete!=='boolean')throw Error('Invalid Coptic counts or completeness');
 return payload;
}
export function validateManifest(m){
 if(!m||m.format!==FORMAT||m.language!=='cop'||!Array.isArray(m.dialects)||m.dialects.join(',')!=='Sahidic,Bohairic'||
   typeof m.release!=='string'||!m.release||!Number.isSafeInteger(m.bytes)||m.bytes<=0||
   !Number.isSafeInteger(m.spelling_records)||m.spelling_records<1||
   !/^[a-f0-9]{64}$/.test(m.sha256)||(m.sqlite_sha256!=null&&!/^[a-f0-9]{64}$/.test(m.sqlite_sha256))||typeof m.complete!=='boolean')throw Error('Invalid Coptic lexicon manifest');
 return m;
}
export async function validateSlot(slot){
 if(!slot)return null;
 try{
  validateManifest(slot.manifest);
  const data=slot.bytes;
  if(!(data instanceof ArrayBuffer)||data.byteLength!==slot.manifest.bytes)return null;
  if(await hash(data)!==slot.manifest.sha256)return null;
  const payload=validateCatalog(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)));
  if(payload.rows.length!==slot.manifest.spelling_records||payload.metadata.complete!==slot.manifest.complete)return null;
  return {slot,payload};
 }catch{return null;}
}

// Separate authority from all personal documents and scheduler data.
export function idbStore(name=DB_NAME){
 let open=null;
 async function db(){
  if(!open)open=new Promise((resolve,reject)=>{
   const request=indexedDB.open(name,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('releases'))request.result.createObjectStore('releases');};
   request.onsuccess=()=>{const d=request.result;d.onversionchange=()=>{d.close();open=null;};resolve(d);};
   request.onerror=()=>{open=null;reject(request.error||Error('Lexicon storage unavailable'));};
   request.onblocked=()=>{open=null;reject(Error('Lexicon database blocked by another tab'));};
  });return open;
 }
 function transaction(mode,fn){return db().then(d=>new Promise((resolve,reject)=>{
  const tx=d.transaction('releases',mode);const store=tx.objectStore('releases');
  let result;try{result=fn(store,tx);}catch(e){try{tx.abort();}catch{}reject(e);return;}
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||Error('Lexicon write failed'));
  tx.onabort=()=>reject(tx.error||Error('Lexicon write aborted'));
 }));}
 return {
  read:async()=>{const d=await db();return new Promise((resolve,reject)=>{
   const tx=d.transaction('releases','readonly'),s=tx.objectStore('releases');
   const a=s.get('active'),p=s.get('previous');
   tx.oncomplete=()=>resolve({active:a.result||null,previous:p.result||null});
   tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Lexicon read aborted'));
  });},
  activate:async(next,prior)=>transaction('readwrite',s=>{s.put(next,'active');if(prior)s.put(prior,'previous');else s.delete('previous');}),
  restore:async(valid)=>transaction('readwrite',s=>{s.put(valid,'active');s.delete('previous');})
 };
}
async function withTimeout(url,fetcher,timeoutMs,readBody){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('Lexicon asset unavailable: '+response.status);
  // Scope the timeout over the complete network body, not just headers.
  return await readBody(response);
 }finally{clearTimeout(timer);}
}
async function download(manifest,fetcher,timeoutMs){
 const bytes=await withTimeout(PAYLOAD_URL,fetcher,timeoutMs,r=>r.arrayBuffer());
 if(bytes.byteLength!==manifest.bytes||await hash(bytes)!==manifest.sha256)throw Error('Downloaded lexicon checksum mismatch');
 const slot={manifest,bytes};
 if(!await validateSlot(slot))throw Error('Downloaded lexicon failed structural verification');
 return slot;
}
/** Dependency injection used for no-browser regression and simulated-corruption tests.
 *  Remote failure with a verified local release never prevents startup.
 */
export async function ensureCopticLexiconImpl({
 store=idbStore(),fetcher=fetch,online=true,timeoutMs=3000
}={}){
 let saved={active:null,previous:null},storageError=null,updateError=null;
 try{saved=await store.read();}
 catch(e){storageError=String(e?.message||e);}
 let active=await validateSlot(saved.active),previous=await validateSlot(saved.previous);
 let recovered=false,volatile=false;
 if(!active&&previous){
  active=previous;recovered=true;
  if(!storageError){
   try{await store.restore(previous.slot);}
   catch(e){storageError=String(e?.message||e);volatile=true;}
  }else volatile=true;
 }
 let remote=null;
 if(online||!active){
  // Cached manifests remain available during PWA offline recovery.
  try{remote=validateManifest(await withTimeout(
   MANIFEST_URL,fetcher,active?1600:timeoutMs,r=>r.json()));}
  catch(e){
   updateError=String(e?.message||e);
   if(!active)throw Error('Lexicon unavailable and no verified local copy: '+updateError);
  }
 }
 if(remote&&(!active||remote.sha256!==active.slot.manifest.sha256)){
  try{
   const next=await download(remote,fetcher,timeoutMs);
   const verified=await validateSlot(next);
   if(!verified)throw Error('Downloaded catalog failed structural verification');
   if(!storageError){
    try{await store.activate(next,active?.slot||null);}
    catch(e){storageError=String(e?.message||e);volatile=true;}
   }else volatile=true;
   active=verified;recovered=false;
  }catch(e){
   updateError=String(e?.message||e);
   if(!active)throw Error('Lexicon download/repair failed: '+updateError);
  }
 }
 if(!active)throw Error('No verified local Coptic lexicon; connect once to install');
 return {payload:active.payload,bytes:active.slot.bytes,manifest:active.slot.manifest,
  status:volatile||storageError?'memory-only':recovered?'recovered':updateError?'offline':
    remote&&active.slot.manifest.sha256===remote.sha256?'verified':'offline',
  complete:active.slot.manifest.complete,storageError,updateError};
}
/** Runtime entry: one operation per page/worker. */
export function ensureCopticLexicon(options={}){
 const opts={...options,online:options.online??(typeof navigator==='undefined'||navigator.onLine!==false)};
 // Custom injected stores/fetchers cannot share an unrelated in-flight call.
 if(Object.keys(options).length)return ensureCopticLexiconImpl(opts);
 if(!inFlight)inFlight=ensureCopticLexiconImpl(opts).finally(()=>{inFlight=null;});
 return inFlight;
}