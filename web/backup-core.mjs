import {validateSchedulerData} from './scheduler.js';

export const BACKUP_FORMAT='renpet.backup';
const PREFERENCE_KEYS=new Set(['language','gregorian','dynamicLighting','showHolidays','weeks']);
export function validatePreferences(preferences){
 if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))return false;
 if(Object.keys(preferences).some(key=>!PREFERENCE_KEYS.has(key)))return false;
 if(preferences.language!==undefined&&!['ar','cop','egy'].includes(preferences.language))return false;
 for(const key of ['gregorian','dynamicLighting','showHolidays'])
  if(preferences[key]!==undefined&&typeof preferences[key]!=='boolean')return false;
 if(preferences.weeks!==undefined){
  const weeks=preferences.weeks;
  if(!weeks||typeof weeks!=='object'||Array.isArray(weeks))return false;
  for(const [language,days] of Object.entries(weeks))
   if(!['ar','cop','egy'].includes(language)||![7,10].includes(days))return false;
 }
 return true;
}
export function createBackup({scheduler,preferences},now=new Date()){
 if(!validateSchedulerData(scheduler))throw new TypeError('Invalid calendar data');
 if(!validatePreferences(preferences))throw new TypeError('Invalid preferences');
 return JSON.stringify({format:BACKUP_FORMAT,exportedAt:now.toISOString(),scheduler,preferences},null,2);
}
export function parseBackup(text){
 let backup;
 try{backup=JSON.parse(text);}catch{throw new Error('Backup is not valid JSON');}
 if(!backup||backup.format!==BACKUP_FORMAT||!validateSchedulerData(backup.scheduler)||
 !validatePreferences(backup.preferences))throw new Error('Invalid Renpet backup');
 return {scheduler:backup.scheduler,preferences:backup.preferences};
}
