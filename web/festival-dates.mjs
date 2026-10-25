// Julian ecclesiastical computus mapped to proleptic Gregorian day number.
// For Coptic Orthodox Pascha (not a prediction of state-granted days off).
export function orthodoxEasterDay(year){
 if(!Number.isInteger(year)||year<1900||year>2200)throw Error('Unsupported Easter year');
 const a=year%4,b=year%7,c=year%19;
 const d=(19*c+15)%30,e=(2*a+4*b-d+34)%7;
 const month=Math.floor((d+e+114)/31),day=(d+e+114)%31+1;
 // Julian civil date -> Julian day number -> UTC Unix day.
 const shift=Math.floor((14-month)/12),Y=year+4800-shift,M=month+12*shift-3;
 return day+Math.floor((153*M+2)/5)+365*Y+Math.floor(Y/4)-32083-2440588;
}
