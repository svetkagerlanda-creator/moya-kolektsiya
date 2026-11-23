(()=>{'use strict';
const ROOT='https://nihheolmwvkgtvtmfzsv.supabase.co/rest/v1/';
const KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
const state={rows:[],filter:'pending',loaded:false,busy:false,error:'',refresh:null};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function api(path,method='GET',body){
 const token=await window.CollectorCommunity?.getAccessToken?.();
 if(!token)throw Error('Увійдіть в акаунт модератора');
 const response=await fetch(ROOT+path,{method,headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.message||'Помилка сервера');
 return data;
}
function render(){
 const rows=state.rows.filter(x=>state.filter==='all'||x.status===state.filter);
 return '<section class="card form"><h2>🧸 Модерація серій</h2><p class="muted">Заявки колекціонерів. Статус «Прийнято й додано» став лише після додавання серії до каталогу.</p>'
 +'<div class="row"><button class="alt" data-sm-refresh type="button">↻ Оновити</button><select id="smFilter" class="field" style="width:auto">'+[['pending','Очікують'],['accepted','Прийняті'],['deferred','Відкладені'],['rejected','Відмовлені'],['all','Усі']].map(([v,l])=>'<option value="'+v+'"'+(state.filter===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'
 +(state.error?'<div class="banner">'+esc(state.error)+'</div>':'')
 +(rows.map(x=>'<article class="card" style="display:grid;gap:9px"><b>'+esc(x.series_name)+'</b><small>'+esc(x.created_at?.slice(0,10))+' · '+esc(x.status)+'</small>'
 +(x.fandom?'<div>Фандом: '+esc(x.fandom)+'</div>':'')+(x.manufacturer?'<div>Виробник: '+esc(x.manufacturer)+'</div>':'')+(x.details?'<p>'+esc(x.details)+'</p>':'')
 +(x.moderator_note?'<p>Коментар: '+esc(x.moderator_note)+'</p>':'')
 +'<div class="row">'+[['accepted','✅ Прийнято й додано'],['pending','🟡 Очікує'],['deferred','⏸ Відкласти'],['rejected','❌ Відмовити']].map(([v,l])=>'<button type="button" class="alt" data-sm-id="'+esc(x.id)+'" data-sm-status="'+v+'">'+l+'</button>').join('')+'</div></article>').join('')||'<div class="empty">Заявок із цим статусом немає.</div>')+'</section>';
}
async function load(){
 if(state.busy)return;state.busy=true;
 try{state.rows=await api('collector_series_requests?select=id,user_id,series_name,fandom,manufacturer,details,status,moderator_note,created_at&order=created_at.desc&limit=500')||[];state.loaded=true;state.error=''}
 catch(e){state.error=String(e.message||e)}finally{state.busy=false;state.refresh?.()}
}
async function review(id,status){
 if(state.busy)return;
 if(status==='accepted'&&!confirm('Підтвердити, що серію вже додано до каталогу?'))return;
 const previous=state.rows.find(x=>x.id===id);if(!previous)return;
 const note=prompt('Коментар модератора:',previous.moderator_note||'');if(note===null)return;
 state.busy=true;
 try{
  const token=await window.CollectorCommunity?.getAccessToken?.();
  const identity=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub;
  const result=await api('collector_series_requests?id=eq.'+encodeURIComponent(id),'PATCH',{status,moderator_note:note.slice(0,1000),reviewed_at:new Date().toISOString(),reviewed_by:identity});
  if(!Array.isArray(result)||!result.length)throw Error('Не вдалося оновити статус');
  state.busy=false;await load();
 }catch(e){state.error=String(e.message||e);state.busy=false;state.refresh?.()}
}
function attach(refresh){
 state.refresh=refresh;
 if(!state.loaded&&!state.busy){load();return}
 document.querySelector('[data-sm-refresh]')?.addEventListener('click',load);
 const f=document.getElementById('smFilter');if(f)f.onchange=()=>{state.filter=f.value;refresh()};
 document.querySelectorAll('[data-sm-id]').forEach(el=>el.onclick=()=>review(el.dataset.smId,el.dataset.smStatus));
}
window.CollectorSeriesModeration={render,attach};
})();