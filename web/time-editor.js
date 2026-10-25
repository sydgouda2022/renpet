// One script-aware appointment-time picker. Native iOS type=time inputs use
// the device locale (often English/AM-PM), so use explicit Unicode/SVG labels
// and retain ISO-compatible HH:MM in hidden form controls.
import {inputClock,timeHtml,timeText,clockPartHtml} from './clock.js';

const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function timeEditorFields(language,start,end,startLabel,endLabel){
 const field=(which,minutes,label)=>
  '<div class="local-time-field"><span class="local-time-label">'+safe(label)+'</span>'+
  '<button type="button" class="local-time-value" data-time-open="'+which+'" data-time-label="'+safe(label)+'" aria-label="'+safe(label)+' '+safe(timeText(minutes,language))+'">'+timeHtml(minutes,language)+'</button>'+
  '<input type="hidden" name="'+which+'" value="'+inputClock(minutes)+'"></div>';
 return '<div class="time-fields local-time-fields">'+field('start',start,startLabel)+field('end',end,endLabel)+'</div>'+
  '<section class="time-picker-host" hidden aria-label="'+safe(startLabel)+' / '+safe(endLabel)+'"></section>';
}

function parseClock(value){
 if(value==='24:00')return {hour:24,minute:0};
 const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(value||'');
 return m?{hour:Number(m[1]),minute:Number(m[2])}:{hour:9,minute:0};
}
const makeChoices=(kind,max,selected,language)=>{
 return Array.from({length:max},(_,n)=>'<button type="button" class="time-choice'+(n===selected?' selected':'')+'" data-time-'+kind+'="'+n+'" aria-pressed="'+(n===selected)+'" aria-label="'+safe(timeText(kind==='hour'?n*60:n,language))+'">'+clockPartHtml(n,language)+'</button>').join('');
};

export function openTimeEditor(form,which,language,startLabel,endLabel){
 if(!form||!['start','end'].includes(which))return;
 const input=form.elements.namedItem(which);
 const host=form.querySelector('.time-picker-host');
 if(!input||!host)return;
 const {hour,minute}=parseClock(input.value);
 host.dataset.field=which;
 host.dataset.hour=hour;
 host.dataset.minute=minute;
 const name=which==='start'?startLabel:endLabel;
 host.innerHTML='<div class="time-picker-top"><button type="button" data-time-dismiss aria-label="Close">×</button>'+
  '<strong>'+safe(name)+'</strong><span class="time-picker-preview">'+timeHtml(hour*60+minute,language)+'</span></div>'+
  '<div class="time-picker-columns" dir="ltr"><div class="time-picker-column" data-time-hours role="group" aria-label="Hours">'+makeChoices('hour',which==='end'?25:24,hour,language)+'</div>'+
  '<div class="time-picker-column" data-time-minutes role="group" aria-label="Minutes">'+makeChoices('minute',60,minute,language)+'</div></div>'+
  '<div class="time-picker-foot"><button type="button" data-time-confirm aria-label="Confirm time">✓</button></div>';
 host.hidden=false;
 requestAnimationFrame(()=>{
  if(host.hidden)return;
  for(const kind of ['hour','minute']){
   const scroll=host.querySelector(kind==='hour'?'[data-time-hours]':'[data-time-minutes]');
   const item=scroll?.querySelector('.time-choice.selected');
   if(scroll&&item)scroll.scrollTop=Math.max(0,item.offsetTop-scroll.offsetTop-(scroll.clientHeight-item.clientHeight)/2);
  }
 });
}

export function updateTimeChoice(form,kind,n,language){
 const host=form?.querySelector('.time-picker-host');
 if(!host||host.hidden||!['hour','minute'].includes(kind))return;
 const hoursLimit=host.dataset.field==='end'?25:24;
 if(!Number.isInteger(n)||n<0||n>=(kind==='hour'?hoursLimit:60))return;
 if(kind==='minute'&&Number(host.dataset.hour)===24&&n>0)return;
 if(kind==='hour'&&n===24)host.dataset.minute='0';
 host.dataset[kind]=String(n);
 const group=host.querySelector(kind==='hour'?'[data-time-hours]':'[data-time-minutes]');
 group?.querySelectorAll('.time-choice').forEach(btn=>{
  const chosen=Number(btn.getAttribute('data-time-'+kind))===n;
  btn.classList.toggle('selected',chosen);
  btn.setAttribute('aria-pressed',String(chosen));
 });
 const hour=Number(host.dataset.hour),minute=Number(host.dataset.minute);
 const minChoices=host.querySelectorAll('[data-time-minute]');
 minChoices.forEach(btn=>{
  const n=Number(btn.dataset.timeMinute);
  const disable=hour===24&&n>0;
  btn.disabled=disable;
  btn.classList.toggle('selected',n===minute);
  btn.setAttribute('aria-pressed',String(n===minute));
 });
 const preview=host.querySelector('.time-picker-preview');
 if(preview)preview.innerHTML=timeHtml(hour*60+minute,language);
}

export function closeTimeEditor(form,confirm,language){
 const host=form?.querySelector('.time-picker-host');
 if(!host||host.hidden)return;
 if(confirm){
  const field=host.dataset.field;
  if(!['start','end'].includes(field))return;
  const total=Number(host.dataset.hour)*60+Number(host.dataset.minute);
  const input=form.elements.namedItem(field);
  const button=form.querySelector('[data-time-open="'+field+'"]');
  if(input)input.value=inputClock(total);
  if(button){
   button.innerHTML=timeHtml(total,language);
   button.setAttribute('aria-label',(button.dataset.timeLabel||field)+' '+timeText(total,language));
  }
 }
 host.hidden=true;
 host.innerHTML='';
}
