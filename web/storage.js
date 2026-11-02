// Local, transaction-safe Renpet records. Each tab tracks revisions read
// from IndexedDB; a stale tab may not overwrite a newer saved appointment.
const NAME='renpet';
const STORE='records';
const KEYS=new Set(['scheduler','preferences','alerts','restoreSnapshot']);
const REVISION=key=>'revision:'+key;
const revisions=new Map();
let opening=null;

export class StorageConflictError extends Error {
 constructor(key){
  super('Renpet data changed in another tab: '+key+'. Reload before saving.');
  this.name='StorageConflictError';
 }
}

function database(){
 if(!opening){
  opening=new Promise((resolve,reject)=>{
   if(!('indexedDB' in globalThis)){reject(new Error('IndexedDB is unavailable'));return;}
   const request=indexedDB.open(NAME,1);
   request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
   request.onerror=()=>reject(request.error||new Error('Unable to open Renpet database'));
   request.onblocked=()=>reject(new Error('Renpet database is blocked by another tab'));
   request.onsuccess=()=>{
    const db=request.result;
    db.onversionchange=()=>{db.close();opening=null;};
    resolve(db);
   };
  }).catch(error=>{opening=null;throw error;});
 }
 return opening;
}
function allowed(key){
 if(!KEYS.has(key))throw new TypeError('Unknown Renpet record: '+key);
 return key;
}

export function recordRevision(key){return revisions.get(allowed(key));}

export async function readRecord(key){
 allowed(key);
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);
  const valueRequest=store.get(key),revisionRequest=store.get(REVISION(key));
  let value,revision=0;
  valueRequest.onsuccess=()=>{value=valueRequest.result;};
  revisionRequest.onsuccess=()=>{revision=revisionRequest.result??0;};
  tx.oncomplete=()=>{revisions.set(key,revision);resolve(value);};
  tx.onerror=()=>reject(tx.error||new Error('Unable to read Renpet data'));
  tx.onabort=()=>reject(tx.error||new Error('Renpet data read aborted'));
 });
}

export async function writeRecords(records,{expectedRevisions={}}={}){
 if(!records||typeof records!=='object'||Array.isArray(records))throw new TypeError('Invalid Renpet records');
 const entries=Object.entries(records);
 if(!entries.length)return;
 for(const [key] of entries)allowed(key);
 // Every writer must have read the version it intends to replace.
 // This includes backups, imports, and preference changes.
 const expected=entries.map(([key])=>{
  if(Object.hasOwn(expectedRevisions,key))return expectedRevisions[key];
  if(!revisions.has(key))throw new Error('Read Renpet record before writing: '+key);
  return revisions.get(key);
 });
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  let pending=entries.length,conflict=null,committed=false;
  tx.oncomplete=()=>{
   if(!committed){reject(new Error('Renpet write did not complete'));return;}
   entries.forEach(([key],i)=>revisions.set(key,expected[i]+1));
   resolve();
  };
  tx.onerror=()=>reject(tx.error||new Error('Renpet write failed'));
  tx.onabort=()=>reject(conflict||tx.error||new Error('Renpet write aborted'));
  entries.forEach(([key],i)=>{
   const request=store.get(REVISION(key));
   request.onsuccess=()=>{
    if((request.result??0)!==expected[i])conflict=new StorageConflictError(key);
    if(--pending!==0)return;
    if(conflict){tx.abort();return;}
    for(let index=0;index<entries.length;index++){
     const [name,value]=entries[index];
     store.put(value,name);
     store.put(expected[index]+1,REVISION(name));
    }
    committed=true;
   };
  });
 });
}

export async function writeRecord(key,value,expectedRevision){
 const name=allowed(key);
 await writeRecords({[name]:value},expectedRevision===undefined?{}:{expectedRevisions:{[name]:expectedRevision}});
}

export async function requestPersistentStorage(){
 if(!navigator.storage?.persist)return false;
 return navigator.storage.persist();
}
