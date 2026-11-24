/* Collector Cloud v0.19: account-scoped automatic two-way sync and private backups.
   Sync starts after local data and a signed-in account are ready. Guests remain local-only.
   Users can explicitly turn cloud sync off in their account settings. */
(()=>{
'use strict';
const API='https://nihheolmwvkgtvtmfzsv.supabase.co',KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0',BUCKET='collector-cloud-backups';
const DEVICE_KEY='collector-backup-device-v1';
let device=localStorage.getItem(DEVICE_KEY);
if(!/^[a-f0-9-]{36}$/.test(device||'')){device=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,device)}
const enc=new TextEncoder(),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={busy:false,auto:false,snapshots:[],notice:'',lastUpload:null,error:'',userId:'',loaded:false,refresh:null,uploadPending:false,syncPending:false,lastSynced:0,reconciling:false,autoStarted:false};
let timer=null,uploadChain=Promise.resolve(),syncChain=Promise.resolve();
const prefKey=id=>'collector-auto-cloud-'+id;
const lastKey=id=>'collector-last-cloud-'+id;
const userid=token=>{try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub}catch{return null}};
function available(){return !!window.CollectorLocal?.read&&!!window.CollectorCommunity?.getAccessToken}
function status(s){state.notice=s;state.refresh?.()}
function fail(err){state.error=String(err?.message||err);state.notice='';state.refresh?.()}
function syncUser(){
 const id=userid(window.CollectorCommunity?.getSession?.()?.access_token||'');
 if(id!==state.userId){
  state.userId=id||'';state.loaded=false;state.snapshots=[];state.error='';state.autoStarted=false;state.lastSynced=0;
  // Signed-in collectors sync by default; an explicit opt-out remains respected.
  state.auto=!!id&&localStorage.getItem(prefKey(id))!=='no';
  state.lastUpload=id?localStorage.getItem(lastKey(id)):null;
 }
 return id;
}
async function request(path,{method='GET',body,contentType='application/json',upsert=false}={}){
 const token=await window.CollectorCommunity.getAccessToken();
 if(!token)throw Error('Увійди до акаунта повторно — сеанс завершився.');
 const headers={apikey:KEY,Authorization:'Bearer '+token};
 if(body!==undefined)headers['Content-Type']=contentType;
 if(upsert)headers['x-upsert']='true';
 const res=await fetch(API+'/storage/v1/'+path,{method,headers,body,cache:'no-store'});
 if(!res.ok){let message='Помилка хмарного сховища ('+res.status+')';try{let j=await res.json();message=j.message||j.error||message}catch{}throw Error(message)}
 return res;
}
const objectName=(id,filename)=>id+'/snapshots/'+filename;
async function upload(){
 if(!available()||!syncUser())throw Error('Для хмари потрібно увійти в акаунт.');
 if(state.busy)throw Error('Завершується попередня операція. Повтори трохи пізніше.');
 state.busy=true;state.error='';status('Збереження приватної копії в хмару…');
 try{
  const snapshot={app:'moya-kolektsiya',version:1,device,created:new Date().toISOString(),data:window.CollectorLocal.read()};
  if(!Array.isArray(snapshot.data.items)||!Array.isArray(snapshot.data.folders))throw Error('Некоректна локальна колекція.');
  const payload=JSON.stringify(snapshot);
  const bytes=enc.encode(payload);
  if(bytes.length>45*1024*1024)throw Error('Копія завелика для одного файлу (понад 45 МБ). Зроби локальний експорт JSON; великі фотогалереї потребуватимуть окремої синхронізації.');
  await request('object/'+BUCKET+'/'+objectName(state.userId,device+'.json'),{method:'POST',body:bytes,upsert:true});
  state.lastUpload=new Date().toISOString();localStorage.setItem(lastKey(state.userId),state.lastUpload);
  status('✓ Хмарну копію збережено. Особисті колекції не стали публічними.');
  state.loaded=false;
 }catch(err){fail(err);throw err}finally{state.busy=false;state.refresh?.();if(state.uploadPending||state.syncPending){state.uploadPending=false;state.syncPending=false;if(state.auto)notifyLocalChange()}}
}
async function list(){
 if(!available()||!syncUser())return;
 state.error='';state.busy=true;
 try{
  const res=await request('object/list/'+BUCKET,{method:'POST',body:JSON.stringify({prefix:state.userId+'/snapshots',limit:100,offset:0,sortBy:{column:'updated_at',order:'desc'}})});
  const rows=await res.json();
  state.snapshots=(Array.isArray(rows)?rows:[]).filter(x=>/^[0-9a-f-]{36}(?:-before-\d{13})?\.json$/.test(x.name)).sort((a,b)=>String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at)));
  state.loaded=true;
 }catch(err){fail(err)}finally{state.busy=false;state.refresh?.()}
}

async function fetchDeviceSnapshots(){
 // Safety backups share the same directory. Paging must occur before filtering
 // or >100 backups can hide an older device's current snapshot.
 const files=[];
 for(let offset=0;offset<2000;offset+=100){
  const response=await request('object/list/'+BUCKET,{method:'POST',body:JSON.stringify({prefix:state.userId+'/snapshots',limit:100,offset,sortBy:{column:'name',order:'asc'}})});
  const rows=await response.json();
  if(!Array.isArray(rows))throw Error('Не вдалося отримати список хмарних копій.');
  files.push(...rows.filter(x=>/^[0-9a-f-]{36}\.json$/.test(x.name)));
  if(rows.length<100)return files;
 }
 throw Error('У хмарі забагато резервних копій. Синхронізацію зупинено, щоб не пропустити інший пристрій.');
}
async function reconcileDevices(){
 if(!available()||!syncUser())throw Error('Для синхронізації увійди до акаунта.');
 if(state.busy){state.syncPending=true;return}
 state.busy=true;state.error='';status('Синхронізація колекцій з іншими пристроями…');
 let totalFolders=0,totalItems=0,totalUpdated=0,needsBackup=false;
 try{
  const files=await fetchDeviceSnapshots();
  const remote=[];
  for(const entry of files){
   const response=await request('object/authenticated/'+BUCKET+'/'+objectName(state.userId,entry.name));
   const content=await response.text();
   if(content.length>65*1024*1024)throw Error('Копія з іншого пристрою завелика.');
   const snapshot=JSON.parse(content);
   summary(snapshot);
   if(!snapshot.device||snapshot.device!==entry.name.replace(/\.json$/,''))throw Error('Некоректна прив’язка копії до пристрою.');
   remote.push({snapshot,entry});
  }
  // Before touching local data, create a recoverable backup in this account.
  const local=window.CollectorLocal.read();
  let ids=new Set(local.items.map(x=>String(x.id))),folders=new Set(local.folders.map(x=>String(x.id)));
  const tombstonedFolders=new Set(Object.keys(local.deletedFolders||{}));
  const tombstonedItems=new Set(Object.keys(local.deletedItems||{}));
  let dates=new Map(local.items.map(x=>[String(x.id),Date.parse(x.updated||'')||0]));
  const folderDates=new Map(local.folders.map(x=>[String(x.id),Date.parse(x.updated||'')||0]));
  for(const {snapshot} of remote){
   for(const f of snapshot.data.folders){
    const key=String(f.id),stamp=Date.parse(f.updated||'')||0;
    if(!folders.has(key)&&!tombstonedFolders.has(key)){needsBackup=true;folders.add(key);folderDates.set(key,stamp)}
    else if(stamp>(folderDates.get(key)||0)){needsBackup=true;folderDates.set(key,stamp)}
   }
   for(const key of Object.keys(snapshot.data.deletedFolders||{}))if(folders.has(key)&&!tombstonedFolders.has(key))needsBackup=true;
   for(const key of Object.keys(snapshot.data.deletedItems||{}))if(ids.has(key)&&!tombstonedItems.has(key))needsBackup=true;
   for(const item of snapshot.data.items){
    const key=String(item.id),stamp=Date.parse(item.updated||'')||0;
    if(!ids.has(key)){needsBackup=true;ids.add(key);dates.set(key,stamp)}
    else if(stamp>(dates.get(key)||0)){needsBackup=true;dates.set(key,stamp)}
   }
  }
  if(needsBackup)await saveSafetyCopy();
  state.reconciling=true;
  // Merge in ascending snapshot time, using per-item timestamps to choose updates.
  remote.sort((a,b)=>String(a.entry.updated_at||'').localeCompare(String(b.entry.updated_at||'')));
  for(const {snapshot} of remote){
   const outcome=await window.CollectorLocal.merge(snapshot.data,{applyUpdates:true});
   totalFolders+=outcome.addedFolders;totalItems+=outcome.addedItems;totalUpdated+=outcome.updatedItems;
  }
  // Upload a consolidated copy for this device only. Never overwrite the other device's backup.
  const snapshot={app:'moya-kolektsiya',version:1,device,created:new Date().toISOString(),data:window.CollectorLocal.read()};
  const bytes=enc.encode(JSON.stringify(snapshot));
  if(bytes.length>45*1024*1024)throw Error('Об’єднана колекція завелика для хмари (понад 45 МБ). Зроби JSON-копію локально.');
  await request('object/'+BUCKET+'/'+objectName(state.userId,device+'.json'),{method:'POST',body:bytes,upsert:true});
  state.lastUpload=new Date().toISOString();localStorage.setItem(lastKey(state.userId),state.lastUpload);
  state.lastSynced=Date.now();state.loaded=false;
  status('✓ Синхронізовано. Додано '+totalFolders+' папок, '+totalItems+' предметів; оновлено '+totalUpdated+' карток. Для другого пристрою теж запусти синхронізацію.');
 }catch(e){fail(e);throw e}
 finally{
  state.reconciling=false;state.busy=false;state.refresh?.();
  if(state.syncPending||state.uploadPending){state.syncPending=false;state.uploadPending=false;if(state.auto)notifyLocalChange()}
 }
}
function syncNow(){syncChain=syncChain.catch(()=>{}).then(()=>reconcileDevices());return syncChain}
function startIfReady(){
 // Never upload the default empty collection before IndexedDB has finished loading.
 if(!window.CollectorLocalReady||!available()||!syncUser()||!state.auto||state.autoStarted)return;
 state.autoStarted=true;
 syncNow().catch(err=>console.warn('Automatic collection sync:',err));
}
async function saveSafetyCopy(){
 const backup={app:'moya-kolektsiya',version:1,device,created:new Date().toISOString(),data:window.CollectorLocal.read()};
 const bytes=enc.encode(JSON.stringify(backup));
 if(bytes.length>45*1024*1024)throw Error('Неможливо створити страховочну копію: понад 45 МБ. Перед об’єднанням зроби локальний експорт JSON.');
 const name=device+'-before-'+Date.now()+'.json';
 await request('object/'+BUCKET+'/'+objectName(state.userId,name),{method:'POST',body:bytes});
}
function summary(snapshot){
 const data=snapshot?.data;
 if(snapshot?.app!=='moya-kolektsiya'||!data||!Array.isArray(data.folders)||!Array.isArray(data.items)||data.items.length>100000||data.folders.length>100000)throw Error('Невірний формат хмарної копії.');
 if(data.items.some(x=>typeof x!=='object'||!x||!x.id)||data.folders.some(x=>typeof x!=='object'||!x||!x.id))throw Error('Хмарна копія має некоректні записи.');
 return {folders:data.folders.length,items:data.items.length,photos:data.items.reduce((n,x)=>n+(Array.isArray(x.personalPhotos)?x.personalPhotos.length:0),0)};
}
async function mergeFrom(name){
 if(!syncUser()||!/^[0-9a-f-]{36}(?:-before-\d{13})?\.json$/.test(name))throw Error('Неправильна резервна копія.');
 if(state.busy)throw Error('Інша операція ще виконується.');
 state.busy=true;state.error='';let merged=false;
 try{
  const res=await request('object/authenticated/'+BUCKET+'/'+objectName(state.userId,name));
  const text=await res.text();if(text.length>65*1024*1024)throw Error('Файл занадто великий для відновлення.');
  const snapshot=JSON.parse(text),info=summary(snapshot);
  const local=window.CollectorLocal.read();
  const localIds=new Set(local.items.map(x=>String(x.id))),folderIds=new Set(local.folders.map(x=>String(x.id)));
  const missingItems=snapshot.data.items.filter(x=>!localIds.has(String(x.id)));
  const missingFolders=snapshot.data.folders.filter(x=>!folderIds.has(String(x.id)));
  const localItems=new Map(local.items.map(x=>[String(x.id),x]));
  const newer=snapshot.data.items.filter(remote=>{
   const old=localItems.get(String(remote.id));if(!old)return false;
   const theirDate=Date.parse(remote.updated||''),ourDate=Date.parse(old.updated||'');
   return Number.isFinite(theirDate)&&theirDate>(Number.isFinite(ourDate)?ourDate:0);
  });
  if(!confirm('Об’єднати хмарну копію з локальною колекцією?\n\nУ хмарі: '+info.folders+' папок, '+info.items+' предметів, '+info.photos+' фото.\n\nНових папок: '+missingFolders.length+'. Нових предметів: '+missingItems.length+'. Новіших версій наявних предметів: '+newer.length+'.'))return;
  let applyUpdates=false;
  if(newer.length)applyUpdates=confirm('У хмарі є '+newer.length+' новіших змін уже наявних предметів.\n\nОК — застосувати їх після створення окремої страховочної хмарної копії.\nСкасувати — додати лише відсутні предмети, НЕ змінюючи наявні.');
  // Back up local data before any manual merge, including deletion markers.
  await saveSafetyCopy();
  const outcome=await window.CollectorLocal.merge(snapshot.data,{applyUpdates});merged=true;
  status('✓ Хмару об’єднано: '+outcome.addedFolders+' папок, '+outcome.addedItems+' предметів, '+outcome.updatedItems+' оновлених карток.');state.loaded=false;
 }catch(err){fail(err)}finally{state.busy=false;state.refresh?.();if(merged)notifyLocalChange()}
}
function notifyLocalChange(){
 const id=syncUser();
 if(!id||!state.auto||state.reconciling)return;
 if(state.busy){state.uploadPending=true;return}
 if(timer)clearTimeout(timer);
 timer=setTimeout(()=>{timer=null;syncNow().catch(err=>console.warn('Collection sync after change:',err))},1200);
}
function render(){
 if(!syncUser())return '';
 return '<section class="card collector-cloud"><h2>☁️ Моя хмара</h2>'
 +'<p class="muted">Приватні резервні копії для кожного пристрою. Вони містять папки, предмети та особисті фото, але ніколи не публікуються у стрічці.</p>'
 +'<label class="cloud-switch"><input type="checkbox" id="cloudAuto" '+(state.auto?'checked':'')+'> Автоматична синхронізація між пристроями</label>'
 +'<p class="muted">Синхронізація автоматично працює на всіх пристроях, де відкрито цей акаунт: зміни папок, статусів «Маю», «Хочу», «Замовлено» та карток надсилаються у приватну хмару після збереження. При відкритті чи оновленні сторінки зміни з інших пристроїв завантажуються автоматично. Потрібне інтернет-з’єднання; великі фото можуть затримувати збереження. За потреби синхронізацію можна вимкнути тут.</p>'
 +'<div class="row"><button class="btn" id="cloudSync" type="button" '+(state.busy?'disabled':'')+'>↻ Синхронізувати зараз</button><button class="alt" id="cloudUpload" type="button" '+(state.busy?'disabled':'')+'>↑ Зберегти в хмарі</button><button class="alt" id="cloudList" type="button" '+(state.busy?'disabled':'')+'>↓ Мої хмарні копії</button></div>'
 +(state.lastUpload?'<p class="muted">Остання копія цього пристрою: '+esc(new Date(state.lastUpload).toLocaleString('uk-UA'))+'</p>':'')
 +(state.notice?'<div class="banner">'+esc(state.notice)+'</div>':'')
 +(state.error?'<div class="banner cloud-error">'+esc(state.error)+'</div>':'')
 +(state.loaded?'<div class="cloud-copies"><h3>Копії з моїх пристроїв</h3>'+(state.snapshots.length?state.snapshots.map(x=>'<div class="cloud-copy"><div><b>'+(x.name.includes('-before-')?'Страховочна копія':x.name===device+'.json'?'Цей пристрій':'Інший пристрій')+'</b><small>'+esc(x.updated_at?new Date(x.updated_at).toLocaleString('uk-UA'):'Дата невідома')+'</small></div><button class="alt" type="button" data-cloud-merge="'+esc(x.name)+'">Об’єднати</button></div>').join(''):'<p class="muted">Хмарних копій поки немає.</p>')+'</div>':'')+'</section>';
}
function attach(refresh){
 state.refresh=refresh;syncUser();
 startIfReady();
 const toggle=document.getElementById('cloudAuto');
 if(toggle)toggle.onchange=e=>{state.auto=!!e.target.checked;localStorage.setItem(prefKey(state.userId),state.auto?'yes':'no');if(!state.auto&&timer){clearTimeout(timer);timer=null}if(state.auto){if(state.autoStarted)notifyLocalChange();else startIfReady()}refresh()};
 const syncButton=document.getElementById('cloudSync');
 if(syncButton)syncButton.onclick=()=>syncNow().catch(()=>{});
 const uploadButton=document.getElementById('cloudUpload');
 if(uploadButton)uploadButton.onclick=()=>upload().catch(()=>{});
 const listButton=document.getElementById('cloudList');
 if(listButton)listButton.onclick=()=>list();
 document.querySelectorAll('[data-cloud-merge]').forEach(el=>el.onclick=()=>mergeFrom(el.dataset.cloudMerge));
}
function signedOut(){state.userId='';state.loaded=false;state.snapshots=[];state.uploadPending=false;state.syncPending=false;if(timer){clearTimeout(timer);timer=null}}
window.addEventListener('online',()=>{startIfReady();if(state.auto&&state.autoStarted)notifyLocalChange()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;startIfReady();if(state.auto&&Date.now()-state.lastSynced>45000)notifyLocalChange()});
window.addEventListener('focus',()=>{startIfReady();if(state.auto&&state.autoStarted&&Date.now()-state.lastSynced>45000)notifyLocalChange()});
window.CollectorCloud={render,attach,notifyLocalChange,syncNow,signedOut,start:startIfReady};
document.addEventListener('DOMContentLoaded',startIfReady);
window.addEventListener('load',startIfReady);
const style=document.createElement('style');style.textContent='.collector-cloud{margin-top:20px;display:grid;gap:12px}.collector-cloud h2{margin:0}.cloud-switch{display:flex;align-items:center;gap:12px;font-weight:650}.cloud-switch input{width:20px;height:20px}.cloud-copies{display:grid;gap:10px}.cloud-copies h3{margin:0}.cloud-copy{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--edge);border-radius:12px;padding:10px}.cloud-copy small{display:block;color:var(--sub);margin-top:5px}.cloud-error{border:1px solid #d88696}';document.head.appendChild(style);
})();