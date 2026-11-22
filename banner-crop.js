/* Full-screen banner crop editor; opens immediately when a cover file is chosen. */
(()=>{
'use strict';
const translate=s=>window.CollectorI18n?.translate(s,document.documentElement.lang||'uk')||s;
const cap=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
let active=null;
function close(save=false){
 if(!active)return;
 const {overlay,form,original,file,object}=active;
 active=null;
 overlay.remove();
 if(object)URL.revokeObjectURL(object);
 if(save){form.elements.cover_position_x.value=String(original.doneX);form.elements.cover_position_y.value=String(original.doneY);form.requestSubmit()}
 else if(file){
  form.elements.cover.value='';
  form.elements.cover.dispatchEvent(new Event('change',{bubbles:true}));
 }
}
function editCover(file){
 const form=document.getElementById('scEdit');
 if(!form||!form.elements.cover_position_x||!form.elements.cover_position_y)return;
 if(active)close(false);
 const savedPreview=document.getElementById('scCoverPreview');
 let path=null,object=null;
 if(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3145728)return;
  object=URL.createObjectURL(file);path=object;
 }else{
  path=savedPreview?.style.backgroundImage?.match(/^url\(["']?(.*?)["']?\)$/)?.[1]||null;
  if(!path){const head=document.querySelector('.sc-profile .sc-cover');path=head?.style.backgroundImage?.match(/^url\(["']?(.*?)["']?\)$/)?.[1]||null}
  if(!path){alert(translate('Спочатку вибери фотографію банера.'));return}
 }
 const x0=cap(form.elements.cover_position_x.value),y0=cap(form.elements.cover_position_y.value);
 const overlay=document.createElement('div');overlay.className='collector-banner-overlay';
 const content=document.createElement('section');content.className='collector-banner-dialog';
 content.setAttribute('role','dialog');content.setAttribute('aria-modal','true');
 content.setAttribute('aria-labelledby','bannerCropHeading');
 content.innerHTML='<h2 id="bannerCropHeading">'+translate('Редактор банера')+'</h2>'
 +'<p class="muted">'+translate('Пересувай фотографію мишкою або пальцем, щоб вибрати потрібну частину.')+'</p>'
 +'<div class="collector-banner-viewport" role="img" tabindex="0" aria-label="'+translate('Попередній перегляд банера')+'"></div>'
 +'<div class="collector-banner-controls"><label>'+translate('Горизонтально')+' <output id="bannerX"></output><input type="range" min="0" max="100" step="1" id="bannerRangeX"></label>'
 +'<label>'+translate('Вертикально')+' <output id="bannerY"></output><input type="range" min="0" max="100" step="1" id="bannerRangeY"></label></div>'
 +'<div class="collector-banner-buttons"><button type="button" class="alt" data-banner-action="center">'+translate('Центрувати')+'</button>'
 +'<button type="button" class="alt" data-banner-action="cancel">'+translate('Скасувати')+'</button>'
 +'<button type="button" class="btn" data-banner-action="save">'+translate('Зберегти банер')+'</button></div>';
 overlay.appendChild(content);document.body.appendChild(overlay);
 const viewport=content.querySelector('.collector-banner-viewport'),rx=content.querySelector('#bannerRangeX'),ry=content.querySelector('#bannerRangeY');
 rx.value=x0;ry.value=y0;viewport.style.backgroundImage='url("'+path.replace(/"/g,'%22')+'")';
 active={overlay,form,file,object,original:{doneX:x0,doneY:y0}};
 const redraw=()=>{
  viewport.style.backgroundPosition=rx.value+'% '+ry.value+'%';
  content.querySelector('#bannerX').textContent=rx.value+'%';
  content.querySelector('#bannerY').textContent=ry.value+'%';
  if(active){active.original.doneX=cap(rx.value);active.original.doneY=cap(ry.value)}
 };
 redraw();
 rx.oninput=redraw;ry.oninput=redraw;
 content.querySelector('[data-banner-action="center"]').onclick=()=>{rx.value=50;ry.value=50;redraw()};
 content.querySelector('[data-banner-action="cancel"]').onclick=()=>close(false);
 content.querySelector('[data-banner-action="save"]').onclick=()=>close(true);
 overlay.onclick=e=>{if(e.target===overlay)close(false)};
 overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close(false)}};
 let drag=null;
 viewport.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  drag={id:e.pointerId,atX:e.clientX,atY:e.clientY,x:Number(rx.value),y:Number(ry.value)};
  viewport.setPointerCapture(e.pointerId);
 });
 viewport.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const rect=viewport.getBoundingClientRect();
  rx.value=cap(drag.x-(e.clientX-drag.atX)*100/Math.max(1,rect.width));
  ry.value=cap(drag.y-(e.clientY-drag.atY)*100/Math.max(1,rect.height));
  redraw();
 });
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>viewport.addEventListener(type,()=>{drag=null}));
 viewport.addEventListener('keydown',e=>{
  const delta=e.shiftKey?10:2;
  if(e.key==='ArrowLeft')rx.value=cap(Number(rx.value)-delta);
  else if(e.key==='ArrowRight')rx.value=cap(Number(rx.value)+delta);
  else if(e.key==='ArrowUp')ry.value=cap(Number(ry.value)-delta);
  else if(e.key==='ArrowDown')ry.value=cap(Number(ry.value)+delta);
  else return;
  e.preventDefault();redraw();
 });
 content.querySelector('[data-banner-action="save"]').focus();
}
document.addEventListener('change',e=>{
 if(e.target.matches?.('#scEdit input[name="cover"]')&&e.target.files?.[0]){
  // A file-picker selection now ALWAYS opens the editor in a separate dialog.
  editCover(e.target.files[0]);
 }
});
document.addEventListener('click',e=>{
 if(e.target.closest?.('[data-open-banner-editor]')){
  const form=document.getElementById('scEdit');
  if(!form){document.querySelector('.sc-profile [data-sc="edit"]')?.click();setTimeout(()=>editCover(null),0)}
  else editCover(form.elements.cover.files?.[0]||null);
 }
});
function enhance(){
 const form=document.getElementById('scEdit');
 if(form&&!form.querySelector('[data-open-banner-editor]')){
  const button=document.createElement('button');button.type='button';button.className='alt';
  button.setAttribute('data-open-banner-editor','');button.textContent='✎ '+translate('Відкрити редактор банера');
  const picker=form.querySelector('input[name="cover"]');picker?.closest('label')?.after(button);
 }
 const header=document.querySelector('.sc-profile .sc-cover');
 if(header&&!header.querySelector('[data-open-banner-editor]')&&document.querySelector('.sc-profile [data-sc="edit"]')&&header.style.backgroundImage){
  const button=document.createElement('button');button.type='button';button.className='collector-banner-edit';
  button.setAttribute('data-open-banner-editor','');button.textContent='✎ '+translate('Редагувати банер');
  header.appendChild(button);
 }
}
new MutationObserver(enhance).observe(document.body,{subtree:true,childList:true});
enhance();
const style=document.createElement('style');
style.textContent='.sc-cover{position:relative}.collector-banner-edit{position:absolute;right:12px;bottom:12px;border:1px solid #fff;background:#ffffffef;color:#442659;border-radius:12px;padding:8px 12px;font-weight:700;cursor:pointer}.collector-banner-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;overflow:auto;padding:14px;background:#000a}.collector-banner-dialog{width:min(880px,100%);max-height:calc(100dvh - 28px);overflow-y:auto;background:var(--panel);color:var(--fg);border-radius:18px;padding:20px;box-shadow:0 20px 60px #0007;display:grid;gap:14px}.collector-banner-dialog h2{margin:0}.collector-banner-viewport{width:100%;height:clamp(145px,24vw,260px);background-size:cover;background-repeat:no-repeat;background-position:center;border:2px solid var(--edge);border-radius:12px;cursor:grab;touch-action:none;user-select:none}.collector-banner-viewport:active{cursor:grabbing}.collector-banner-viewport:focus-visible{outline:3px solid var(--accent)}.collector-banner-controls{display:grid;grid-template-columns:1fr 1fr;gap:15px}.collector-banner-controls label{display:grid;gap:8px}.collector-banner-controls input{width:100%;accent-color:var(--accent)}.collector-banner-buttons{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}@media(max-width:600px){.collector-banner-dialog{padding:14px}.collector-banner-controls{grid-template-columns:1fr}.collector-banner-viewport{height:155px}}';
document.head.appendChild(style);
})();
