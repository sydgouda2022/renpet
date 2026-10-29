// Optional device-local foreground reminders. No push server or remote endpoint.
import {isoDate,dayNumber} from './calendar.js';
import {occurrenceStartForDay,isCompleted} from './scheduler.js';
import {readRecord,writeRecord} from './storage.js';

const OFFSET={atTime:0,'5min':5,'15min':15,'1hour':60,'1day':1440};
let started=false;
export function dueAlerts(state,now=new Date(),lookbackMs=90000){
 if(!state||!Array.isArray(state.items))return [];
 const day=dayNumber([now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'));
 const matches=[];
 for(const item of state.items){
  if(!Object.hasOwn(OFFSET,item.alert)||!Number.isInteger(item.startMinutes))continue;
  for(let date=day-2;date<=day+1;date++){
   if(date<item.startDay||occurrenceStartForDay(item,date)!==date||isCompleted(item,date))continue;
   const [y,m,d]=isoDate(date).split('-').map(Number);
   const timestamp=new Date(y,m-1,d,0,item.allDay?540:item.startMinutes).getTime()-OFFSET[item.alert]*60000;
   if(timestamp<=now.getTime()&&now.getTime()-timestamp<=lookbackMs)
    matches.push({key:item.id+':'+date+':'+item.alert,title:item.title,at:timestamp});
  }
 }
 return matches;
}
function toast(message){
 const element=document.createElement('div');element.className='renpet-reminder-toast';element.setAttribute('role','alert');
 const label=document.createElement('span');label.textContent='⏰ '+message;
 const button=document.createElement('button');button.type='button';button.textContent='×';button.setAttribute('aria-label','Dismiss reminder');
 button.addEventListener('click',()=>element.remove());element.append(label,button);document.body.append(element);
 setTimeout(()=>element.remove(),15000);
}
export function startForegroundAlerts(getState,enabled){
 if(typeof document==='undefined'||started)return;
 started=true;
 let checking=false;
 const check=async()=>{
  if(checking||document.hidden||!enabled())return;
  checking=true;
  try{
   const now=new Date();
   const history=await readRecord('alerts')??{lastCheck:0,fired:{}};
   const elapsed=Math.min(12*3600000,Math.max(90000,now.getTime()-(history.lastCheck||now.getTime()-90000)));
   const due=dueAlerts(getState(),now,elapsed);
   const fired={...history.fired};
   for(const entry of due){
    if(fired[entry.key])continue;
    let delivered=false;
    if('Notification'in window&&Notification.permission==='granted'){
     try{
      const registration=await navigator.serviceWorker?.getRegistration?.();
      if(registration?.showNotification){await registration.showNotification('Renpet',{body:entry.title,tag:entry.key});delivered=true;}
     }catch(error){console.warn('Renpet notification failed',error);}
    }
    if(!delivered)toast(entry.title);
    fired[entry.key]=now.getTime();
   }
   for(const [key,time] of Object.entries(fired))if(time<now.getTime()-14*86400000)delete fired[key];
   await writeRecord('alerts',{lastCheck:now.getTime(),fired});
  }catch(error){console.error('Renpet reminder processing failed',error);}
  finally{checking=false;}
 };
 setInterval(()=>void check(),30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
 void check();
}
export async function requestAlertPermission(){
 if('Notification'in window&&Notification.permission==='default')return Notification.requestPermission();
 return 'unsupported';
}
