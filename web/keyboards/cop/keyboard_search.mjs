/** Single native-script prediction kernel for Renpet and shared lexicon clients.
 *  Lexical rows are indexed once (binary prefix lookup), not rescanned on every key.
 *  An unassigned Coptic dialect is NOT treated as either Sahidic or Bohairic.
 *  This engine never transliterates, auto-corrects, or creates attested spellings.
 */
const collate=(a,b)=>a<b?-1:a>b?1:0;
export function keyboardKey(value,language){
 if(typeof value!=='string')throw new TypeError('Unicode string required');
 if(language==='egy')return value.normalize('NFC');
 if(language==='cop')return value.normalize('NFD').toLocaleLowerCase('und').replace(/\p{Mark}/gu,'').normalize('NFC');
 throw new RangeError('Unsupported keyboard language');
}
export function prepareKeyboardIndex(language,pack){
 if(!pack||!['cop','egy'].includes(language))throw Error('Invalid keyboard pack');
 const rows=[];
 if(language==='cop'){
  if(!Array.isArray(pack.rows))throw Error('Missing Coptic dictionary rows');
  for(const entry of pack.rows){
   if(!Array.isArray(entry)||entry.length<2||typeof entry[0]!=='string'||!entry[0]||![0,1,2,3].includes(entry[1]))throw Error('Invalid Coptic word or dialect mask');
   const surface=entry[0];
   rows.push({text:surface,key:keyboardKey(surface,language),id:'cop:'+surface,
     dialects:entry[1],frequency:Number(pack.popularity?.[surface])||0,source:'COP'});
  }
 }else{
  const entries=pack.entries||pack.rows;
  if(!Array.isArray(entries))throw Error('Missing Late Egyptian spellings');
  for(const item of entries){
   const legacy=Array.isArray(item),text=legacy?item[0]:item.signs;
   if(typeof text!=='string'||!text)throw Error('Invalid Late Egyptian Unicode spelling');
   rows.push({text,key:keyboardKey(text,language),id:legacy?'egy:'+text:(item.ref||'egy:'+text),
    source:!legacy&&item.source==='RAMSES-WORD-MODEL-2023'?'RAMSES-CORPUS':'LATE',
    lexicalIdentityVerified:legacy||item.lexical_identity_verified!==false,
    dialects:0,frequency:Math.max(0,Number(legacy?item[1]:item.attestations)||0),
    lemma:legacy?item[2]:item.lemma,sourceRef:legacy?item[3]:(item.ref||null)});
  }
 }
 rows.sort((a,b)=>collate(a.key,b.key)||collate(a.id,b.id));
 return {language,rows};
}
function bisect(rows,value){
 let lo=0,hi=rows.length;
 while(lo<hi){const m=(lo+hi)>>>1;if(rows[m].key<value)lo=m+1;else hi=m;}return lo;
}
function permitted(row,language,dialect){
 if(language!=='cop'||dialect==='all')return true;
 if(dialect==='sahidic')return (row.dialects&1)!==0;
 if(dialect==='bohairic')return (row.dialects&2)!==0;
 throw RangeError('Invalid Coptic dialect');
}
function count(obj,key){
 const x=Number(obj?.[key]||0);
 return Number.isFinite(x)?Math.min(10000,Math.max(0,x)):0;
}
export function predictKeyboard(index,raw,{dialect='all',learned={},previous='',limit=4}={}){
 if(!index||!['egy','cop'].includes(index.language)||!Array.isArray(index.rows))throw Error('Invalid keyboard index');
 if(typeof raw!=='string')throw TypeError('Expected Unicode signs/letters');
 if(!Number.isInteger(limit)||limit<1||limit>80)throw RangeError('Invalid suggestion count');
 if(!raw)return [];
 const language=index.language,lookup=keyboardKey(raw,language);
 const found=new Map();
 let exact=false;
 const insert=(row,personal=false)=>{
  if(row.text===raw){exact ||= !personal;return;}
  if(!row.key.startsWith(lookup))return;
  if(!permitted(row,language,dialect))return;
  const learnedN=count(learned,language+':'+row.text);
  const contextN=previous?count(learned,'ctx:'+language+':'+previous+':'+row.text):0;
  const sourceWeight=row.source==='RAMSES-CORPUS'?-12:0;
  const score=(personal?0:Math.log1p(row.frequency)*8)+sourceWeight+Math.log1p(learnedN)*45+
      Math.log1p(contextN)*30-(Array.from(row.text).length*0.05)+
      (language==='cop'&&row.dialects===3?3:0);
  const candidate={text:row.text,raw:false,personal,attested:!personal,
   dialects:row.dialects,frequency:row.frequency,lemma:row.lemma??null,
   lexicalIdentityVerified:personal?false:row.lexicalIdentityVerified!==false,
   source:personal?'PERSONAL':row.source,lexicon_ref:personal?null:(row.sourceRef||row.id),
   score};
  const old=found.get(candidate.text);
  if(!old||(!old.attested&&candidate.attested)||candidate.score>old.score&&old.attested===candidate.attested)
   found.set(candidate.text,candidate);
 };
 for(let i=bisect(index.rows,lookup);i<index.rows.length;i++){
  const row=index.rows[i];if(!row.key.startsWith(lookup))break;
  if(permitted(row,language,dialect)){if(row.text===raw)exact=true;else insert(row);}
 }
 for(const [k,n] of Object.entries(learned)){
  if(!k.startsWith(language+':')||!(Number(n)>0))continue;
  const text=k.slice(language.length+1);
  if(!text||text===raw||found.has(text))continue;
  insert({text,key:keyboardKey(text,language),id:null,dialects:0,frequency:0,source:'PERSONAL'},true);
 }
 const list=[...found.values()];
 list.sort((a,b)=>b.score-a.score||collate(a.text,b.text));
 // In the combined Coptic view, show useful examples from both dialects
 // without overriding user frequency/context preferences on later slots.
 let chosen=[];
 if(language==='cop'&&dialect==='all'){
  const s=list.find(x=>x.dialects&1),b=list.find(x=>x.dialects&2);
  if(s)chosen.push(s);
  if(b&&b.text!==s?.text)chosen.push(b);
 }
 for(const x of list){
  if(chosen.length>=limit-1)break;
  if(!chosen.some(y=>y.text===x.text))chosen.push(x);
 }
 return [{text:raw,raw:true,personal:false,attested:exact,lexicon_ref:null},...chosen.slice(0,limit-1).map(({score,...x})=>x)];
}
