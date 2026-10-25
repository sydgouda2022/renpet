// Shared seasonal identity and date labels; the calendar's date arithmetic
// remains in calendar.js. Artwork never contains calendar text or controls.
export const SEASONS=Object.freeze([
 {id:'akhet',names:{ar:'آخت',cop:'Ⲁⲭⲉⲧ',egy:'𓈗'}},
 {id:'peret',names:{ar:'برت',cop:'Ⲡⲉⲣⲉⲧ',egy:'𓆤'}},
 {id:'shemu',names:{ar:'شمو',cop:'Ⲥⲙⲟⲩ',egy:'𓇳'}}
]);

export function seasonForMonth(month){
 if(!Number.isInteger(month)||month<1||month>13)throw new RangeError('Invalid Egyptian month');
 // The separate year-end period keeps the last season's visual setting.
 return SEASONS[Math.min(2,Math.floor((month-1)/4))];
}

export function seasonName(season,language){
 return season.names[language]||season.names.ar;
}

export function gregorianText(day,language,options={day:'numeric',month:'short'}){
 const date=new Date(day*86400000);
 if(language==='ar')return new Intl.DateTimeFormat('ar-EG-u-nu-arab',{
  ...options,timeZone:'UTC'
 }).format(date);
 // Gregorian overlays are numeric in the Coptic/hieroglyphic interfaces.
 // A one-day cell stays one or two digits; full dates use ISO ordering.
 const parts=[];
 if(options.year)parts.push(String(date.getUTCFullYear()));
 if(options.month)parts.push(String(date.getUTCMonth()+1).padStart(2,'0'));
 if(options.day)parts.push(parts.length?String(date.getUTCDate()).padStart(2,'0'):String(date.getUTCDate()));
 return parts.join('-')||date.toISOString().slice(0,10);
}
