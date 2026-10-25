/** Modal keyboard focus policy; no observers and no duplicate dialog rendering. */
let previous=null;
let activeDialog=null;
const findDialog=()=>document.querySelector('.renpet-backup-panel, .festival-detail-sheet, #event-editor, .ux-panel');
const targets=dialog=>[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(el=>
 !el.disabled&&!el.hidden&&el.getAttribute('tabindex')!=='-1'&&el.getClientRects().length>0);
export function syncModalFocus(){
 if(typeof document==='undefined')return;
 const dialog=findDialog();
 if(dialog){
  if(!activeDialog)previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  activeDialog=dialog;
  if(!dialog.contains(document.activeElement))targets(dialog)[0]?.focus({preventScroll:true});
 }else if(activeDialog){
  activeDialog=null;
  const back=previous?.isConnected?previous:document.querySelector('[data-new],.ux-nav-item');
  previous=null;
  back?.focus?.({preventScroll:true});
 }
}
if(typeof document!=='undefined'){
 document.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const dialog=findDialog();if(!dialog)return;
  const nodes=targets(dialog);if(!nodes.length){event.preventDefault();return;}
  const at=nodes.indexOf(document.activeElement);
  if(event.shiftKey&&at<=0){event.preventDefault();nodes.at(-1).focus();}
  else if(!event.shiftKey&&(at<0||at===nodes.length-1)){event.preventDefault();nodes[0].focus();}
 },true);
 document.addEventListener('focusin',event=>{
  const dialog=findDialog();if(dialog&&!dialog.contains(event.target))
   targets(dialog)[0]?.focus({preventScroll:true});
 },true);
}
