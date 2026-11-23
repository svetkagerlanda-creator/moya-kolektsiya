/* Explicit opt-in photo proposals. Never changes catalog data or publishes by itself. */
(()=>{
'use strict';
const BASE='https://nihheolmwvkgtvtmfzsv.supabase.co';
const KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
const BUCKET='collector-catalog-proposals';
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const tokenUser=token=>{try{const payload=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(payload)).sub||''}catch{return ''}};
const sourcePhotoMissing=photo=>!photo||typeof photo!=='string'||!/^https:\/\//i.test(photo);
const getToken=async()=>await window.CollectorCommunity?.getAccessToken?.();
const asBlob=async src=>{
 if(typeof src!=='string'||!src.startsWith('data:image/'))throw Error('Спочатку додай особисте фото.');
 const response=await fetch(src);
 const blob=await response.blob();
 if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>3145728)throw Error('Фото має бути JPG, PNG або WEBP до 3 МБ.');
 return blob;
};
async function sendProposal({itemName,seriesName,reference,src}){
 const token=await getToken();const user=tokenUser(token||'');
 if(!token||!user)throw Error('Для надсилання фото потрібно увійти в акаунт.');
 const blob=await asBlob(src);
 const identifier=crypto.randomUUID();
 const ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';
 const path=user+'/catalog-proposals/'+identifier+'.'+ext;
 const headers={apikey:KEY,Authorization:'Bearer '+token};
 const url=BASE+'/storage/v1/object/'+BUCKET+'/'+path;
 const uploaded=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':blob.type,'x-upsert':'false'},body:blob});
 if(!uploaded.ok)throw Error('Не вдалося надіслати фото на перевірку ('+uploaded.status+').');
 try{
  const saved=await fetch(BASE+'/rest/v1/collector_catalog_photo_proposals',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({owner_id:user,item_name:String(itemName).slice(0,250),series_name:String(seriesName||'').slice(0,250),item_reference:String(reference||'').slice(0,500),image_path:path,consent_confirmed:true,status:'pending'})});
  if(!saved.ok)throw Error('Не вдалося зареєструвати пропозицію фото ('+saved.status+').');
 }catch(error){
  await fetch(url,{method:'DELETE',headers}).catch(()=>{});
  throw error;
 }
}
function offer(item,src,ctx={},isSeries=false){
 if(!src||!sourcePhotoMissing(isSeries?item?.catalogCoverPhoto:item?.photo))return false;
 const itemName=String(item?.name||'').trim(),seriesName=isSeries?itemName:String(ctx.seriesName||'').trim();
 if(!itemName)return false;
 const modal=ctx.modal,close=ctx.close,toast=ctx.toast;
 if(typeof modal!=='function')return false;
 const consent='catalogProposalConsent',submit='catalogProposalSend',skip='catalogProposalSkip';
 modal('💜 Допомогти каталогу?','<div class="form"><p>У загальному каталозі ще немає підтвердженого фото цього '+(isSeries?'набору / серії':'предмета')+'. Хочеш добровільно запропонувати своє зображення?</p><img src="'+escape(src)+'" alt="Фото для пропозиції" style="max-height:170px;max-width:100%;object-fit:contain;border-radius:12px"><p class="muted">Твоє фото буде передано в приватну чергу перевірки. Лише після схвалення воно може з’явитися в загальному каталозі з позначкою «Фото колекціонера». Оригінал у твоїй колекції не зміниться. Фото може бути доступним усім після схвалення. Обирай тільки власний знімок, на поширення якого маєш права.</p><label style="display:flex;align-items:start;gap:9px"><input id="'+consent+'" type="checkbox"> Я автор(ка) фото й дозволяю використати його в загальному каталозі після перевірки.</label><div class="row"><button id="'+submit+'" class="btn" type="button">Надіслати на перевірку</button><button id="'+skip+'" class="alt" type="button">Ні, залишити тільки собі</button></div></div>');
 const button=document.getElementById(submit);
 document.getElementById(skip).onclick=()=>close?.();
 button.onclick=async()=>{
  if(!document.getElementById(consent).checked){toast?.('Потрібна явна згода на публікацію.');return}
  button.disabled=true;
  try{await sendProposal({itemName,seriesName,reference:ctx.reference||'',src});close?.();toast?.('Дякуємо! Фото надіслано на перевірку, каталог поки без змін.')}
  catch(err){toast?.(err.message||'Не вдалося надіслати фото');button.disabled=false}
 };
 return true;
}
window.CollectorCatalogContributions={offer,sourcePhotoMissing};
})();
