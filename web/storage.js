// Renpet stores personal data only in this device's IndexedDB.
// One database, three records, one atomic transaction per committed change.
const NAME='renpet';
const STORE='records';
const KEYS=new Set(['scheduler','preferences','alerts']);
let opening=null;
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
async function transaction(mode,operation){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode);
  const store=tx.objectStore(STORE);
  let result;
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error||new Error('Renpet storage transaction failed'));
  tx.onabort=()=>reject(tx.error||new Error('Renpet storage transaction aborted'));
  try{
   operation(store,value=>{result=value;});
  }catch(error){tx.abort();reject(error);}
 });
}
export async function readRecord(key){
 allowed(key);
 return transaction('readonly',(store,done)=>{
  const request=store.get(key);
  request.onsuccess=()=>done(request.result);
 });
}
export async function writeRecords(records){
 if(!records||typeof records!=='object'||Array.isArray(records))throw new TypeError('Invalid Renpet records');
 const entries=Object.entries(records);
 for(const [key] of entries)allowed(key);
 await transaction('readwrite',store=>{
  for(const [key,value] of entries)store.put(value,key);
 });
}
export async function writeRecord(key,value){await writeRecords({[allowed(key)]:value});}
export async function requestPersistentStorage(){
 if(!navigator.storage?.persist)return false;
 return navigator.storage.persist();
}
