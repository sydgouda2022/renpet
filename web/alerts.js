// Device-local, foreground reminder delivery. Browsers cannot guarantee
// notifications after a PWA closes without a server-backed push subscription.
// Renpet never claims that saving an alert schedules a background alarm.
import {isoDate,dayNumber} from './calendar.js';
import {occurrenceStartForDay,isCompleted} from './scheduler.js';

const OFFSET={atTime:0,'5min':5,'15min':15,'1hour':60,'1day':1440};
const FIRED='renpet.alerts.fired.v1';
const LAST_CHECK='renpet.alerts.last-check.v1';
const MAX_CATCHUP=12*60*60*1000;
let interval=null;
export function dueAlerts(state,years,now=new Date(),lookbackMs=90000){
 if(!state||!Array.isArray(state.items)||!Array.isArray(years)||!years.length)return [];
 const today=dayNumber([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'));
 const results=[];
 for(const item of state.items){
  if(!Object.hasOwn(OFFSET,item.alert)||!Number.isInteger(item.startMinutes))continue;
  for(let day=today-1;day<=today+2;day++){
   const start=day>=item.startDay&&dayNumber(years[0].start)<=day&&
    day<=dayNumber(years.at(-1).start)+years.at(-1).days-1?
    occurrenceStartForDay(item,day,years):null;
   if(start!==day||isCompleted(item,day))continue;
   const [y,m,d]=isoDate(day).split('-').map(Number);
   const timestamp=new Date(y,m-1,d,0,item.allDay?540:item.startMinutes).getTime()-OFFSET[item.alert]*60000;
   if(timestamp<=now.getTime()&&now.getTime()-timestamp<=lookbackMs)
    results.push({key:item.id+':'+day+':'+item.alert,id:item.id,title:item.title||'Renpet',day,at:timestamp});
  }
 }
 return results;
}
export function startForegroundAlerts(getState,getYears){
 if(typeof window==='undefined'||interval!==null)return;
 const check=async()=>{
  if(document.hidden)return;
  const years=getYears();if(!years?.length)return;
  let history={};
  try{history=JSON.parse(localStorage.getItem(FIRED)||'{}')||{};}catch{}
  if(typeof history!=='object'||Array.isArray(history))history={};
  const now=new Date();
  let previous=0;try{previous=Number(localStorage.getItem(LAST_CHECK)||0);}catch{}
  const elapsed=previous>0&&previous<=now.getTime()?now.getTime()-previous:90000;
  const possible=dueAlerts(getState(),years,now,Math.min(MAX_CATCHUP,Math.max(90000,elapsed+60000)));
  for(const alert of possible){
   if(history[alert.key])continue;
   history[alert.key]=now.getTime();
   let delivered=false;
   try{
    if('Notification'in window&&Notification.permission==='granted'){
     const reg=await navigator.serviceWorker?.getRegistration?.();
     if(reg?.showNotification){await reg.showNotification('Renpet',{body:(now.getTime()-alert.at>120000?'Missed reminder · ':'')+alert.title,tag:alert.key});delivered=true;}
     else{new Notification('Renpet',{body:alert.title,tag:alert.key});delivered=true;}
    }
   }catch{}
   if(!delivered){
    const toast=document.createElement('div');toast.className='renpet-reminder-toast';toast.setAttribute('role','alert');
    const label=document.createElement('span');label.textContent='⏰ '+(now.getTime()-alert.at>120000?'Missed · ':'')+alert.title;
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Dismiss');
    close.addEventListener('click',()=>toast.remove());toast.append(label,close);document.body.append(toast);
    setTimeout(()=>toast.remove(),15000);
   }
  }
  const records=Object.entries(history).filter(([,ms])=>Number(ms)>now.getTime()-14*86400000).slice(-1000);
  try{localStorage.setItem(FIRED,JSON.stringify(Object.fromEntries(records)));localStorage.setItem(LAST_CHECK,String(now.getTime()));}catch{}
 };
 interval=setInterval(()=>void check(),30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
 void check();
}
export function requestAlertPermission(){
 if(typeof window==='undefined'||!('Notification'in window)||Notification.permission!=='default')return;
 try{void Notification.requestPermission().catch(()=>{});}catch{}
}
