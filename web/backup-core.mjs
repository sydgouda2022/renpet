import {validateSchedulerData} from './scheduler.js';

export const BACKUP_FORMAT='renpet.backup';
export function createBackup({scheduler,preferences},now=new Date()){
 if(!validateSchedulerData(scheduler))throw new TypeError('Invalid calendar data');
 if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))throw new TypeError('Invalid preferences');
 return JSON.stringify({format:BACKUP_FORMAT,exportedAt:now.toISOString(),scheduler,preferences},null,2);
}
export function parseBackup(text){
 let backup;
 try{backup=JSON.parse(text);}catch{throw new Error('Backup is not valid JSON');}
 if(!backup||backup.format!==BACKUP_FORMAT||!validateSchedulerData(backup.scheduler)||
 !backup.preferences||typeof backup.preferences!=='object'||Array.isArray(backup.preferences))
  throw new Error('Invalid Renpet backup');
 return {scheduler:backup.scheduler,preferences:backup.preferences};
}
