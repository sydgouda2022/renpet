import { nativeNumber } from './calendar.js';

// Egyptian and Coptic numerals are additive: neither script has a historical zero.
// The hollow circle below is a neutral UI placeholder for zero, not an ancient sign.
const ZERO='○';
const pair=n=>String(n).padStart(2,'0');
const numeric=(n,language)=>{
 if(language==='ar')return pair(n).replace(/[0-9]/g,d=>'٠١٢٣٤٥٦٧٨٩'[Number(d)]);
 return n===0?ZERO:nativeNumber(n,language);
};
const parts=total=>({hour:Math.floor(total/60),minute:total%60});
const hiero=n=>n===0?'<span class="clock-zero" aria-label="zero">'+ZERO+'</span>':'<img class="clock-glyph" src="assets/numerals/'+n+'.svg" alt="'+nativeNumber(n,'egy')+'">';

// Reuse the same numeral rendering for both the Day timeline and time editor.
export function clockPartHtml(n,language){
 return language==='egy'?hiero(n):'<span class="clock-text" dir="ltr">'+numeric(n,language)+'</span>';
}
export function inputClock(total){
 const {hour,minute}=parts(total);
 return pair(hour)+':'+pair(minute);
}
export function timeText(total,language){
 const {hour,minute}=parts(total);
 return numeric(hour,language)+':'+numeric(minute,language);
}
export function timeHtml(total,language){
 if(language!=='egy')return '<span class="clock-text" dir="ltr">'+timeText(total,language)+'</span>';
 const {hour,minute}=parts(total);
 return '<span class="clock-text" dir="ltr"><span class="clock-part">'+hiero(hour)+'</span><span class="clock-separator">:</span><span class="clock-part">'+hiero(minute)+'</span></span>';
}
export function localMinutes(date=new Date()){
 return date.getHours()*60+date.getMinutes()+date.getSeconds()/60+date.getMilliseconds()/60000;
}
export function nowLineTop(date=new Date()){
 return localMinutes(date)*64/60;
}
