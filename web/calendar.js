// Pure Alexandrian calendar. All dates are integer UTC days; the year count
// is the modern Egyptian convention, not a continuous pharaonic dating era.
export const DAY=86400000;
export const EPOCH_YEAR=6268;
export const EPOCH_DAY=Math.floor(Date.parse('2026-09-11T00:00:00Z')/DAY);
export const dayNumber=iso=>Math.floor(Date.parse(iso+'T00:00:00Z')/DAY);
export const isoDate=n=>new Date(n*DAY).toISOString().slice(0,10);
export const isLeapYear=year=>Number.isInteger(year)&&year%4===0;
export function yearStart(year){
 if(!Number.isInteger(year)||year<1||year>9999)throw new RangeError('Invalid Egyptian year');
 const leaps=Math.floor((year-1)/4)-Math.floor((EPOCH_YEAR-1)/4);
 return EPOCH_DAY+365*(year-EPOCH_YEAR)+leaps;
}
export function monthLength(year,month){
 if(!Number.isInteger(month)||month<1||month>13)throw new RangeError('Invalid Egyptian month');
 return month===13?5+Number(isLeapYear(year)):30;
}
export function toEgyptian(day){
 if(!Number.isInteger(day))throw new RangeError('Invalid day');
 let year=EPOCH_YEAR+Math.floor((day-EPOCH_DAY)/365.25);
 if(year<1||year>9999)throw new RangeError('Date outside supported calendar');
 while(yearStart(year)>day)year--;
 while(year<9999&&yearStart(year+1)<=day)year++;
 const offset=day-yearStart(year);
 if(offset<0||offset>=365+Number(isLeapYear(year)))throw new RangeError('Date outside supported calendar');
 return {year,month:offset<360?Math.floor(offset/30)+1:13,day:offset<360?offset%30+1:offset-359};
}
export function toGregorian({year,month,day}){
 const limit=monthLength(year,month);
 if(!Number.isInteger(day)||day<1||day>limit)throw new RangeError('Invalid Egyptian day');
 return yearStart(year)+(month===13?360:(month-1)*30)+day-1;
}
export function nativeNumber(n,lang){
 if(lang==='ar')return String(n).replace(/[0-9]/g,x=>'٠١٢٣٤٥٦٧٨٩'[Number(x)]);
 if(lang==='egy'){
  const groups=[[1000,'𓆼'],[100,'𓍢'],[10,'𓎆'],[1,'𓏺']];let s='';
  for(const [v,c] of groups){s+=c.repeat(Math.floor(n/v));n%=v;}return s;
 }
 const units=['','ⲁ','ⲃ','ⲅ','ⲇ','ⲉ','ⲋ','ⲍ','ⲏ','ⲑ'],tens=['','ⲓ','ⲕ','ⲗ','ⲙ','ⲛ','ⲝ','ⲟ','ⲡ','ϥ'],hundreds=['','ⲣ','ⲥ','ⲧ','ⲩ','ⲫ','ⲭ','ⲯ','ⲱ','ⳁ'];
 let s='';if(n>=1000){s='͵'+units[Math.floor(n/1000)]+'̅';n%=1000;}
 for(const [v,a] of [[100,hundreds],[10,tens],[1,units]]){const q=Math.floor(n/v);if(q)s+=a[q]+'̅';n%=v;}return s;
}

export function monthGrid(year,month,week){
 if(week!==7&&week!==10)throw new RangeError('Invalid week length');
 const start=toGregorian({year,month,day:1});
 const length=monthLength(year,month);
 const pad=week===7?(new Date(start*DAY).getUTCDay()+6)%7:0;
 const cells=Array(pad).fill(null);
 for(let d=1;d<=length;d++)cells.push({day:d,gregorian:start+d-1});
 while(cells.length%week)cells.push(null);
 return cells;
}
export function festivalHits(day,festivals){
 const e=toEgyptian(day),hits=[];
 for(const festival of festivals){
  for(const year of [e.year-1,e.year]){
   if(year<1)continue;
   let start;try{start=toGregorian({year,month:festival.month,day:festival.day});}
   catch{continue;} // Epagomenal day 6 is absent outside leap years.
   if(day>=start&&day<start+festival.duration){hits.push({...festival,start,end:start+festival.duration});break;}
  }
 }
 return hits;
}
