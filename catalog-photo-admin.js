/* Moderator-only catalog photo review panel. Permissions enforced by database policies. */
(()=>{
'use strict';
const BASE='https://nihheolmwvkgtvtmfzsv.supabase.co';
const KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
const HEADERS={apikey:KEY};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={userId:'',checked:false,admin:false,loading:false,rows:[],error:'',notices:'',filter:'pending',refresh:null,previews:new Map(),busy:null};
async function token(){return await window.CollectorCommunity?.getAccessToken?.()}
async function request(url,{method='GET',body,contentType='application/json'}={}){
 const t=await token();if(!t)throw Error('Увійди в акаунт.');
 const headers={...HEADERS,Authorization:'Bearer '+t};
 if(body!==undefined)headers['Content-Type']=contentType;
 const response=await fetch(BASE+url,{method,headers,body,cache:'no-store'});
 if(!response.ok){const detail=await response.text().catch(()=>'');throw Error('Помилка сервера ('+response.status+'): '+detail.slice(0,180))}
 return response;
}
async function check(userId,refresh){
 if(!userId)return;
 if(state.userId!==userId){
  for(const src of state.previews.values())URL.revokeObjectURL(src);
  state={userId,checked:false,admin:false,loading:false,rows:[],error:'',notices:'',filter:'pending',refresh,previews:new Map(),busy:null};
 }
 state.refresh=refresh;
 if(state.checked||state.loading)return;
 state.loading=true;
 try{
  const res=await request('/rest/v1/collector_catalog_admins?select=user_id&user_id=eq.'+encodeURIComponent(userId)+'&limit=1');
  const data=await res.json();
  state.admin=Array.isArray(data)&&data.some(x=>x.user_id===userId);
  state.checked=true;
 }catch(error){state.error=error.message;state.checked=true}
 finally{state.loading=false;state.refresh?.()}
}
function enabled(){return state.admin}
function tabButton(){return enabled()?'<button type="button" data-sc-tab="photos">🖼 Модерація фото</button>':''}
function render(){
 if(!enabled())return '<div class="empty">Доступ має лише адміністратор каталогу.</div>';
 const rows=state.rows.filter(x=>state.filter==='all'||x.status===state.filter);
 return '<section class="card form"><h2>🖼 Модерація фотографій</h2><p class="muted">Добровільні пропозиції колекціонерів. Фото не стає публічним до твого схвалення. Після публікації воно показується як «Фото колекціонера», а не заводський знімок.</p>'
 +'<div class="row"><button type="button" class="alt" data-cpa-refresh>↻ Оновити</button><select id="cpaFilter" class="field" aria-label="Статус фото"><option value="pending"'+(state.filter==='pending'?' selected':'')+'>Очікують</option><option value="approved"'+(state.filter==='approved'?' selected':'')+'>Схвалені</option><option value="rejected"'+(state.filter==='rejected'?' selected':'')+'>Відхилені</option><option value="all"'+(state.filter==='all'?' selected':'')+'>Усі</option></select></div>'
 +(state.error?'<div class="banner">'+escape(state.error)+'</div>':'')+(state.notices?'<p class="muted">'+escape(state.notices)+'</p>':'')
 +'<p class="muted">Усього пропозицій: '+state.rows.length+'. Очікують: '+state.rows.filter(x=>x.status==='pending').length+'.</p>'
 +(state.loading?'<div class="empty">Завантаження…</div>':rows.length?'<div class="sc-people">'+rows.map(x=>'<article class="card form"><b>'+escape(x.item_name)+'</b><small>'+escape(x.series_name||'Без зазначеної серії')+'</small><div class="cpa-preview" data-cpa-photo="'+escape(x.id)+'">'+(state.previews.has(x.id)?'<img src="'+escape(state.previews.get(x.id))+'" alt="Фото для модерації" style="width:100%;height:195px;object-fit:contain">':'Завантаження фото…')+'</div><small>Подано: '+escape(new Date(x.created_at).toLocaleString('uk-UA'))+' · '+escape(x.status)+'</small>'+(x.status==='pending'?'<div class="row"><button type="button" class="btn" data-cpa-decision="approved" data-cpa-id="'+escape(x.id)+'" '+(state.busy?'disabled':'')+'>✓ Схвалити</button><button type="button" class="alt" data-cpa-decision="rejected" data-cpa-id="'+escape(x.id)+'" '+(state.busy?'disabled':'')+'>✕ Відхилити</button></div>':'')+'</article>').join('')+'</div>':'<div class="empty">Пропозицій за вибраним статусом поки немає.</div>')+'</section>';
}
async function load(){
 if(!enabled()||state.loading)return;
 state.loading=true;state.error='';state.refresh?.();
 try{
  const res=await request('/rest/v1/collector_catalog_photo_proposals?select=id,owner_id,item_name,series_name,item_reference,image_path,consent_confirmed,status,created_at,published_path&order=created_at.desc&limit=150');
  state.rows=await res.json();
  if(!Array.isArray(state.rows))state.rows=[];
 }catch(error){state.error=error.message}
 finally{state.loading=false;state.refresh?.()}
}
async function preview(row){
 if(!enabled()||state.previews.has(row.id)||row.status==='rejected')return;
 try{
  const res=await request('/storage/v1/object/authenticated/collector-catalog-proposals/'+row.image_path);
  const blob=await res.blob();
  if(!blob.type.startsWith('image/'))throw Error('Це не фото');
  state.previews.set(row.id,URL.createObjectURL(blob));
  state.refresh?.();
 }catch(error){state.error='Фото '+row.item_name+': '+error.message;state.refresh?.()}
}
async function jpgFromPrivate(row){
 const res=await request('/storage/v1/object/authenticated/collector-catalog-proposals/'+row.image_path);
 const blob=await res.blob();
 if(blob.type==='image/jpeg'&&blob.size<3145728)return blob;
 const source=URL.createObjectURL(blob);
 try{
  const picture=new Image();
  await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=()=>reject(Error('Не вдалося відкрити фото'));picture.src=source});
  const canvas=document.createElement('canvas');const scale=Math.min(1,1600/Math.max(picture.naturalWidth,picture.naturalHeight));canvas.width=Math.max(1,Math.round(picture.naturalWidth*scale));canvas.height=Math.max(1,Math.round(picture.naturalHeight*scale));
  canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);
  const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
  if(!jpeg||jpeg.size>3145728)throw Error('Фото завелике для каталогу');
  return jpeg;
 }finally{URL.revokeObjectURL(source)}
}
async function review(id,decision){
 if(!enabled()||state.busy)return;
 const row=state.rows.find(x=>x.id===id&&x.status==='pending');
 if(!row)return;
 if(!confirm(decision==='approved'?'Схвалити фото та зробити його доступним усім у загальному каталозі?':'Відхилити цю пропозицію?'))return;
 state.busy=id;state.error='';state.refresh?.();
 let published=null;
 let uploaded=false;
 try{
  if(decision==='approved'){
   const blob=await jpgFromPrivate(row);
   published='approved/'+row.id+'.jpg';
   await request('/storage/v1/object/collector-catalog-media/'+published,{method:'POST',body:blob,contentType:'image/jpeg'});
   uploaded=true;
  }
  await request('/rest/v1/rpc/collector_review_catalog_photo',{method:'POST',body:JSON.stringify({p_id:row.id,p_decision:decision,p_published_path:published})});
  state.notices=decision==='approved'?'Фото схвалено та опубліковано. Каталог покаже його після оновлення.':'Пропозицію відхилено.';
  await load();
 }catch(error){
  if(uploaded&&published)await request('/storage/v1/object/collector-catalog-media/'+published,{method:'DELETE'}).catch(()=>{});
  state.error=error.message;
 }
 finally{state.busy=null;state.refresh?.()}
}
function attach(refresh){
 if(!enabled())return;
 state.refresh=refresh;
 if(!state.rows.length&&!state.loading&&!state.loaded){state.loaded=true;load();return}
 document.querySelector('[data-cpa-refresh]')?.addEventListener('click',load);
 const filter=document.getElementById('cpaFilter');if(filter)filter.onchange=()=>{state.filter=filter.value;state.refresh?.()};
 document.querySelectorAll('[data-cpa-decision]').forEach(button=>button.onclick=()=>review(button.dataset.cpaId,button.dataset.cpaDecision));
 for(const row of state.rows.filter(x=>state.filter==='all'||x.status===state.filter))if(!state.previews.has(row.id))preview(row);
}
window.CollectorPhotoAdmin={check,enabled,isChecked:()=>state.checked,tabButton,render,attach};
})();
