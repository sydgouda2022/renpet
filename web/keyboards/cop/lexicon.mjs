/** Pure validation of source-backed Coptic JSON/manifest bytes.
 * No fetch, IndexedDB, CacheStorage, filesystem or implicit update policy.
 */
const HEX64=/^[a-f0-9]{64}$/;
const HAS_LETTER=/[\p{Script=Coptic}\p{Script=Greek}]/u;
const FORMAT='coptic-lexicon-install-v1';
export function validateCatalog(catalog){
  if(!catalog||catalog.format!=='coptic-predict-v1'||catalog.language!=='cop'||
     !Array.isArray(catalog.dialects)||catalog.dialects.join(',')!=='Sahidic,Bohairic'||
     !Array.isArray(catalog.rows)||catalog.rows.length===0||
     !catalog.popularity||typeof catalog.popularity!=='object'||Array.isArray(catalog.popularity)||
     !catalog.metadata||catalog.metadata.spelling_records!==catalog.rows.length||
     catalog.metadata.complete!==false)throw new TypeError('Invalid Coptic catalog');
  const seen=new Set();
  for(const row of catalog.rows){
    if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||
       !HAS_LETTER.test(row[0])||!Number.isInteger(row[1])||row[1]<0||
       row[1]>3||seen.has(row[0]))throw new TypeError('Invalid Coptic surface');
    seen.add(row[0]);
  }
  for(const [word,weight] of Object.entries(catalog.popularity)){
    if(!seen.has(word)||!Number.isSafeInteger(weight)||weight<0)
      throw new TypeError('Invalid source popularity hint');
  }
  return catalog;
}
export function validateManifest(m){
  if(!m||m.format!==FORMAT||m.language!=='cop'||!Array.isArray(m.dialects)||
     m.dialects.join(',')!=='Sahidic,Bohairic'||typeof m.release!=='string'||!m.release||
     !Number.isSafeInteger(m.bytes)||m.bytes<1||
     !Number.isSafeInteger(m.spelling_records)||m.spelling_records<1||
     typeof m.sha256!=='string'||!HEX64.test(m.sha256)||
     (m.sqlite_sha256!=null&&(typeof m.sqlite_sha256!=='string'||!HEX64.test(m.sqlite_sha256)))||
     m.complete!==false)throw new TypeError('Invalid Coptic manifest');
  return m;
}
function hex(bytes){return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
/** Verify exact bytes against a caller-trusted manifest; does not authenticate
 * where the manifest originated. Caller controls fetching/storage/pinning.
 */
export async function verifyReleaseBytes(manifest,bytes){
  validateManifest(manifest);
  const buf=bytes instanceof ArrayBuffer ? bytes :
    ArrayBuffer.isView(bytes) ? bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) : null;
  if(!buf||buf.byteLength!==manifest.bytes)throw new Error('Coptic payload length mismatch');
  if(!globalThis.crypto?.subtle)throw new Error('WebCrypto required for SHA-256 verification');
  const digest=hex(await globalThis.crypto.subtle.digest('SHA-256',buf));
  if(digest!==manifest.sha256)throw new Error('Coptic payload SHA-256 mismatch');
  const catalog=validateCatalog(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf)));
  if(catalog.rows.length!==manifest.spelling_records||
     catalog.metadata.complete!==manifest.complete)
    throw new Error('Catalog/manifest metadata mismatch');
  return catalog;
}
