/**
 * Pure Coptic Unicode input and prefix prediction. No DOM, storage, network,
 * framework, font, or browser API dependencies. This is the single algorithm
 * behind the modern package and the legacy Renpet adapter.
 *
 * "attested" is a deprecated compatibility label for source-listed surface,
 * NOT evidence of an individual manuscript witness or unique TEI lemma.
 */
export const LANGUAGE = 'cop';
export const PREDICTION_API_VERSION = 2;
export const COPTIC_KEYS = Object.freeze([...'ⲁⲃⲅⲇⲉⲋⲍⲏⲑⲓⲕⲗⲙⲛⲝⲟⲡⲣⲥⲧⲩⲫⲭⲯⲱϣϥϧϩϫϭϯ']);
const LETTER = /[\p{Script=Coptic}\p{Script=Greek}]/u;
const SINGLE_WORD = /^[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+$/u;
const PHRASE = /^[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+(?: +[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+)+$/u;
const DISALLOWED = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const DIALECTS = Object.freeze(['all','sahidic','bohairic']);
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const count = x => Number.isFinite(Number(x)) && Number(x) > 0 ? Math.min(Number(x),1000000) : 0;

export function keyboardKey(input, language = LANGUAGE) {
  if(language !== LANGUAGE) throw new RangeError('Coptic-only keyboard API');
  if(typeof input !== 'string') throw new TypeError('Text must be a string');
  return input.normalize('NFD').toLowerCase().replace(/\p{Mark}/gu,'').normalize('NFC');
}
export function isInsertableSurface(text,{includeEditorial=false,includePhrases=false}={}) {
  if(typeof text!=='string'||!LETTER.test(text)||DISALLOWED.test(text)) return false;
  if(SINGLE_WORD.test(text))return true;
  if(includePhrases&&PHRASE.test(text))return true;
  return includeEditorial && text.length <= 256;
}
/** Compatibility with the standalone PWA's previous pure helper. */
export function keyboardReady(text){return isInsertableSurface(text);}
export function prepareKeyboardIndex(language, pack) {
  if(language!==LANGUAGE)throw new RangeError('Coptic-only lexicon');
  if(!pack||!Array.isArray(pack.rows))throw new TypeError('Expected Coptic rows');
  const seen=new Set();
  const rows=pack.rows.map(row=>{
    if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||
       !LETTER.test(row[0])||DISALLOWED.test(row[0])||
       !Number.isInteger(row[1])||row[1]<0||row[1]>3||seen.has(row[0]))
      throw new TypeError('Invalid/duplicate Coptic row');
    const text=row[0];seen.add(text);
    return {text,key:keyboardKey(text),id:'cop:'+text,
      dialects:row[1],frequency:count(pack.popularity?.[text]),
      source:'COMPILED-COPTIC',lexicalIdentityVerified:false};
  });
  rows.sort((a,b)=>compare(a.key,b.key)||compare(a.text,b.text));
  return {language:LANGUAGE,rows};
}
function lowerBound(rows,key){
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].key<key)lo=mid+1;else hi=mid;}
  return lo;
}
function allows(mask,dialect){
  return dialect==='all'||Boolean(mask & (dialect==='sahidic'?1:2));
}
/** Raw typed input is always first. Ranking only affects later suggestions.
 * Word forms are returned verbatim; no generated/artificial morphology.
 */
export function predictKeyboard(index,raw,{
  dialect='all',learned={},previous='',limit=4,includeEditorial=false,
  includePhrases=false,includePersonal=true,balanced=false
}={}){
  if(!index||index.language!==LANGUAGE||!Array.isArray(index.rows))
    throw new TypeError('Expected prepared Coptic index');
  if(typeof raw!=='string')throw new TypeError('Typed text must be a string');
  if(!DIALECTS.includes(dialect))throw new RangeError('Unsupported Coptic dialect');
  if(!Number.isInteger(limit)||limit<1||limit>80)throw new RangeError('limit must be 1..80');
  if(raw.length===0)return [];
  const lookup=keyboardKey(raw),found=new Map();
  let exact=false;
  const getUsage=k=>learned&&typeof learned==='object'&&Object.hasOwn(learned,k)
    ? count(learned[k]):0;
  const consider=(row,personal=false)=>{
    if(!row.key.startsWith(lookup)||row.text===raw||
       !isInsertableSurface(row.text,{includeEditorial,includePhrases}))return;
    if(!personal&&!allows(row.dialects,dialect))return;
    const learnedN=getUsage('cop:'+row.text);
    const contextN=previous?getUsage('ctx:cop:'+previous+':'+row.text):0;
    const score=Math.log1p(row.frequency)*8+Math.log1p(learnedN)*45+
      Math.log1p(contextN)*30-[...row.text].length*.05;
    const candidate={text:row.text,raw:false,personal,
      attested:!personal,inLexicon:!personal,dialects:personal?0:row.dialects,
      frequency:personal?0:row.frequency,lexicalIdentityVerified:false,
      lemma:null,source:personal?'PERSONAL':row.source,lexicon_ref:null,
      record_key:personal?null:row.id,score};
    const prior=found.get(row.text);
    if(!prior||(!prior.inLexicon&&candidate.inLexicon)||
       (prior.inLexicon===candidate.inLexicon&&candidate.score>prior.score))
      found.set(row.text,candidate);
  };
  for(let i=lowerBound(index.rows,lookup);i<index.rows.length;i++){
    const row=index.rows[i];if(!row.key.startsWith(lookup))break;
    if(!allows(row.dialects,dialect))continue;
    if(row.text===raw){exact=true;continue;}
    consider(row);
  }
  // Personal data is caller owned and is never promoted to a sourced lemma.
  if(includePersonal&&learned&&typeof learned==='object'){
    for(const [key,value] of Object.entries(learned)){
      if(!key.startsWith('cop:')||count(value)===0)continue;
      const text=key.slice(4);
      if(!text||text===raw||found.has(text))continue;
      consider({text,key:keyboardKey(text),dialects:0,frequency:0,id:null},true);
    }
  }
  const ranked=[...found.values()].sort((a,b)=>b.score-a.score||compare(a.text,b.text));
  const picked=[];
  if(balanced&&dialect==='all'&&limit>2){
    const s=ranked.find(x=>x.inLexicon&&(x.dialects&1));
    const b=ranked.find(x=>x.inLexicon&&(x.dialects&2)&&x!==s);
    if(s)picked.push(s);if(b)picked.push(b);
  }
  for(const row of ranked){
    if(picked.length>=limit-1)break;
    if(!picked.includes(row))picked.push(row);
  }
  return [{text:raw,raw:true,personal:false,attested:exact,
    inLexicon:exact,lexicalIdentityVerified:false,lexicon_ref:null},
    ...picked.slice(0,limit-1).map(({score,...rest})=>rest)];
}
/** One-time preparation; no I/O or UI. Exposes immutable configuration only. */
export function createCopticKeyboard(pack,{dialect='all',limit=4}={}){
  const index=prepareKeyboardIndex(LANGUAGE,pack);
  if(!DIALECTS.includes(dialect))throw new RangeError('Unsupported dialect');
  if(!Number.isInteger(limit)||limit<1||limit>80)throw new RangeError('Invalid limit');
  return Object.freeze({
    language:LANGUAGE,version:PREDICTION_API_VERSION,
    keys:COPTIC_KEYS,
    suggest:(prefix,options={})=>predictKeyboard(index,prefix,{dialect,limit,...options})
  });
}
