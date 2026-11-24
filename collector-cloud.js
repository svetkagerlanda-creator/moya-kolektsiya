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
const state={busy:false,auto:false,snapshots:[],notice:'',lastUpload:null,error:'',userId:'',loaded:false,refresh:null,uploadPending:false,syncPending:false,lastSynced:0,reconciling:false,autoStarted:false,hpDiagnostic:null};
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
  state.userId=id||'';state.loaded=false;state.snapshots=[];state.hpDiagnostic=null;state.error='';state.autoStarted=false;state.lastSynced=0;
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

function harryPotterDiagnostic(data){
 const folders=Array.isArray(data?.folders)?data.folders:[];
 const items=Array.isArray(data?.items)?data.items:[];
 const byId=new Map(folders.filter(f=>f?.id).map(f=>[String(f.id),f]));
 const isHpFolder=folder=>{
  const visited=new Set();
  for(let current=folder;current&&!visited.has(String(current.id));current=byId.get(String(current.parent||''))){
   visited.add(String(current.id));
   const text=[current.name,current.fandomKey,current.source,current.group].filter(Boolean).join(' ').toLocaleLowerCase('uk-UA');
   if(/harry\s*potter|гарр[іи]\s*поттер/.test(text))return true;
  }
  return false;
 };
 const hpFolders=folders.filter(isHpFolder),hpIds=new Set(hpFolders.map(x=>String(x.id)));
 const hpItems=items.filter(i=>hpIds.has(String(i.folder))||/harry\s*potter|гарр[іи]\s*поттер/i.test([i.fandom,i.fandomKey,i.seriesName].filter(Boolean).join(' ')));
 return {folders:hpFolders.length,items:hpItems.length,owned:hpItems.filter(i=>i.status==='owned'&&Number(i.quantity)>0).length,ordered:hpItems.filter(i=>i.status==='ordered').length,wanted:hpItems.filter(i=>i.status==='wish').length};
}
// Show the real folder ancestry for every marked Harry Potter card.
// The top-line HP diagnostic intentionally counts all branches; this audit makes
// hidden branches, duplicate roots, and orphaned card references visible.
function hpFolderAudit(data){
 const folders=Array.isArray(data?.folders)?data.folders:[];
 const items=Array.isArray(data?.items)?data.items:[];
 const byId=new Map(folders.filter(f=>f?.id).map(f=>[String(f.id),f]));
 const hp=/harry\s*potter|гарр[іи]\s*поттер/i;
 const pathOf=id=>{
  const names=[],seen=new Set();let current=byId.get(String(id||''));
  while(current&&!seen.has(String(current.id))){
   seen.add(String(current.id));names.unshift(String(current.name||'Без назви'));
   current=byId.get(String(current.parent||''));
  }
  return names.join(' / ');
 };
 const groups=new Map();
 const markedOutside=[];
 for(const item of items){
  const path=pathOf(item.folder);
  const explicit=[item.fandom,item.fandomKey,item.seriesName].filter(Boolean).join(' ');
  if(!hp.test(path)&&!hp.test(explicit))continue;
  const fid=String(item.folder||''),f=byId.get(fid);
  const groupKey=fid||'(без папки)';
  if(!groups.has(groupKey))groups.set(groupKey,{folderId:fid,path:path||(f?'(без назви)':'⚠ Немає папки'),count:0,owned:0,wish:0,ordered:0,skip:0,names:[]});
  const g=groups.get(groupKey);g.count++;
  if(item.status==='owned'&&Number(item.quantity)>0)g.owned++;
  if(item.status==='wish')g.wish++;
  if(item.status==='ordered')g.ordered++;
  if(item.status==='skip')g.skip++;
  if(['owned','wish','ordered','skip'].includes(item.status)&&g.names.length<12)g.names.push(String(item.name||'Без назви')+' ('+({owned:'Маю',wish:'Хочу',ordered:'Замовлено',skip:'Не хочу'}[item.status])+')');
  if(!f&&['owned','wish','ordered','skip'].includes(item.status)&&markedOutside.length<15)markedOutside.push(String(item.name||'Без назви'));
 }
 const rootBranches=folders.filter(f=>hp.test([f.name,f.fandomKey].join(' '))&&!f.parent).map(f=>({id:String(f.id),name:f.name,children:folders.filter(x=>String(x.parent||'')===String(f.id)).length}));
 return {groups:[...groups.values()].sort((a,b)=>b.owned-a.owned||b.count-a.count),roots:rootBranches,orphaned:markedOutside};
}
async function auditHarryPotterFolders(){
 if(!available()||!syncUser())throw Error('Увійди до акаунта.');
 if(state.busy)throw Error('Зачекай завершення синхронізації.');
 state.busy=true;state.error='';status('Звіряємо всі папки Harry Potter та місця збереження позначок…');
 try{
  const local=hpFolderAudit(window.CollectorLocal.read());
  const files=await fetchDeviceSnapshots();
  const results=[];
  for(const entry of files){
   const res=await request('object/authenticated/'+BUCKET+'/'+objectName(state.userId,entry.name));
   const raw=await res.text();if(raw.length>65*1024*1024)throw Error('Завелика копія.');
   const snap=JSON.parse(raw);summary(snap);
   results.push({label:entry.name===device+'.json'?'Цей пристрій, хмара':'Інший пристрій, хмара',date:entry.updated_at||'',audit:hpFolderAudit(snap.data)});
  }
  state.hpFolderAudit={local,results};
  status('✓ Знайдено шляхи збереження карток Harry Potter. Порівняй папки з позначками нижче.');
 }catch(err){fail(err)}finally{state.busy=false;state.refresh?.()}
}
function renderHpFolderAudit(){
 const report=state.hpFolderAudit;if(!report)return '';
 const section=(label,audit)=>
 '<div class="card"><b>'+esc(label)+'</b><p class="muted">Кореневих папок Harry Potter: '+audit.roots.length+'. '+audit.roots.map(x=>esc(x.name)+' ('+x.children+' дочірніх)').join('; ')+'</p>'+
 (audit.groups.length?audit.groups.map(g=>'<div class="cloud-folder-report"><b>'+esc(g.path)+'</b><small>Карток: '+g.count+' · Маю: '+g.owned+' · Хочу: '+g.wish+' · Замовлено: '+g.ordered+' · Не хочу: '+g.skip+'</small>'+(g.names.length?'<details><summary>Позначені картки ('+Math.min(g.names.length,12)+' з '+(g.owned+g.wish+g.ordered+g.skip)+')</summary><div class="muted">'+g.names.map(esc).join(' · ')+'</div></details>':'')+'</div>').join(''):'<p class="muted">Карток Harry Potter не знайдено</p>')+
 (audit.orphaned.length?'<p class="muted">⚠ Позначки без наявної папки: '+audit.orphaned.map(esc).join(' · ')+'</p>':'')+'</div>';
 return '<section class="card cloud-diagnostic"><h3>🔎 Де насправді збережені мої позначки Harry Potter?</h3><p class="muted">Діагностика нічого не видаляє та не переносить. Показано шлях кожної серії у структурі папок.</p>'+
 section('Локально на цьому пристрої',report.local)+report.results.map((x,i)=>section(x.label+' '+(i+1)+(x.date?' · '+new Date(x.date).toLocaleString('uk-UA'):''),x.audit)).join('')+'</section>';
}
async function diagnoseHarryPotter(){
 if(!available()||!syncUser())throw Error('Увійди до акаунта для діагностики.');
 if(state.busy)throw Error('Дочекайся завершення синхронізації.');
 state.busy=true;state.error='';status('Перевіряємо Harry Potter у копіях різних пристроїв…');
 try{
  const files=await fetchDeviceSnapshots();
  const local=harryPotterDiagnostic(window.CollectorLocal.read());
  const rows=[];
  for(const entry of files){
   const res=await request('object/authenticated/'+BUCKET+'/'+objectName(state.userId,entry.name));
   const snapshot=JSON.parse(await res.text());
   summary(snapshot);
   rows.push({name:entry.name,updated:entry.updated_at||entry.created_at||null,own:entry.name===device+'.json',...harryPotterDiagnostic(snapshot.data)});
  }
  rows.sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||'')));
  state.hpDiagnostic={local,rows,checkedAt:new Date().toISOString()};
  state.notice='✓ Перевірено копії Harry Potter на сервері; дивись порівняння нижче.';
 }catch(err){fail(err)}
 finally{state.busy=false;state.refresh?.()}
}
// Read-only preview by default; only user-confirmed marks from the same private account
// are copied. Match unique cards within uniquely named HP series; never guess duplicates.
function hpRecoveryPlan(local,remote){
 const key=x=>String(x??'').trim().normalize('NFKC').toLocaleLowerCase('uk-UA').replace(/\s+/g,' ');
 const folderPath=(folder,byId)=>{
  const path=[],visited=new Set();
  for(let f=folder;f&&!visited.has(String(f.id));f=byId.get(String(f.parent||''))){
   visited.add(String(f.id));path.unshift(key(f.name));
  }
  return path.join('/');
 };
 const build=data=>{
  const folders=new Map((data.folders||[]).filter(f=>f?.id).map(f=>[String(f.id),f]));
  const indexed=new Map();
  for(const item of data.items||[]){
   const f=folders.get(String(item.folder));if(!f)continue;
   const path=folderPath(f,folders);
   if(!/harry\s*potter|гарр[іи]\s*поттер/.test(path))continue;
   const ident=key(item.figureNumber||item.number||item.sku||'');
   const name=key(item.name);
   if(!name&&!ident)continue;
   const signature=path+'|'+name+'|'+ident;
   if(!indexed.has(signature))indexed.set(signature,[]);
   indexed.get(signature).push(item);
  }
  return indexed;
 };
 const source=build(remote),target=build(local),patches=[],conflicts=[];
 for(const [sig,items] of source){
  const matches=target.get(sig)||[];
  if(items.length!==1||matches.length!==1){if(matches.length)conflicts.push(sig);continue}
  const from=items[0],to=matches[0];
  if(!['owned','wish','ordered','skip'].includes(from.status))continue;
  if(['owned','wish','ordered','skip'].includes(to.status))continue;
  patches.push({id:to.id,expectedStatus:to.status,expectedQuantity:to.quantity,status:from.status,quantity:from.quantity,name:to.name,series:sig.split('|')[0]});
 }
 return {patches,conflicts};
}
async function restoreHarryPotter(){
 if(!available()||!syncUser())throw Error('Увійди до акаунта.');
 if(state.busy)throw Error('Дочекайся завершення попередньої операції.');
 state.busy=true;state.error='';status('Шукаємо позначки Harry Potter у приватних копіях…');
 let applied=false;
 try{
  const files=await fetchDeviceSnapshots();
  const local=window.CollectorLocal.read();
  const candidates=[];
  for(const entry of files){
   const res=await request('object/authenticated/'+BUCKET+'/'+objectName(state.userId,entry.name));
   const raw=await res.text();if(raw.length>65*1024*1024)throw Error('Копія занадто велика.');
   const snapshot=JSON.parse(raw);summary(snapshot);
   if(snapshot.device!==entry.name.replace(/\.json$/,''))throw Error('Неправильна прив’язка копії.');
   const plan=hpRecoveryPlan(local,snapshot.data);
   candidates.push({entry,plan});
  }
  candidates.sort((a,b)=>b.plan.patches.length-a.plan.patches.length||String(b.entry.updated_at||'').localeCompare(String(a.entry.updated_at||'')));
  const best=candidates[0];
  if(!best||!best.plan.patches.length){
   status('Позначок для безпечного перенесення не знайдено. У копіях вони можуть уже існувати, але відображатись у неправильних папках. Нічого не змінено.');
   return;
  }
  const counts=best.plan.patches.reduce((acc,x)=>(acc[x.status]=(acc[x.status]||0)+1,acc),{});
  const detail=Object.entries(counts).map(([k,v])=>({owned:'Маю',wish:'Хочу',ordered:'Замовлено',skip:'Не хочу'}[k]+': '+v)).join(', ');
  if(!confirm('Відновити Harry Potter з копії '+new Date(best.entry.updated_at||best.entry.created_at).toLocaleString('uk-UA')+'?\\n\\nЗнайдено '+best.plan.patches.length+' однозначних карток: '+detail+'.\\nНеоднозначних збігів: '+best.plan.conflicts.length+'.\\n\\nПапки, фото та вже встановлені позначки не зміняться. Перед дією буде створено страховочну копію.'))return;
  await saveSafetyCopy();
  const changed=await window.CollectorLocal.restoreStatusMarks(best.plan.patches);
  applied=true;
  status('✓ Відновлено '+changed+' позначок Harry Potter. Перевір прогрес серій у Колекціях.');
 }catch(err){fail(err)}
 finally{state.busy=false;state.refresh?.();if(applied)notifyLocalChange()}
}
// Compare two sibling HP roots without deleting or moving any cards.
// Only exact unambiguous item signatures are eligible for copying marks.
function duplicateHpPlan(data){
 const key=x=>String(x??'').trim().normalize('NFKC').toLocaleLowerCase('uk-UA').replace(/\s+/g,' ');
 const hp=x=>/^(harry potter|гаррі поттер|гарри поттер)$/.test(key(x));
 const folders=(data.folders||[]).filter(f=>f?.id);
 const roots=folders.filter(f=>hp(f.name)&&!f.parent);
 const pairs=[];
 const pathsFor=root=>{
  const children=folders.filter(f=>String(f.parent||'')===String(root.id));
  const ids=new Set([String(root.id),...children.map(x=>String(x.id))]);
  // Only flat roots for now; recursive hierarchy needs separate review.
  if(children.some(ch=>folders.some(x=>String(x.parent||'')===String(ch.id))))return null;
  const rows=new Map();
  for(const item of data.items||[]){
   if(!ids.has(String(item.folder)))continue;
   const folder=folders.find(f=>String(f.id)===String(item.folder));
   const series=folder===root?'':key(folder?.name);
   const signature=series+'|'+key(item.name)+'|'+key(item.figureNumber||'')+'|'+key(item.catalogPosition||'');
   if(!rows.has(signature))rows.set(signature,[]);
   rows.get(signature).push(item);
  }
  return {rows,children};
 };
 for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++){
  const left=pathsFor(roots[i]),right=pathsFor(roots[j]);
  if(!left||!right)continue;
  const patches=[],conflicts=[],missing=[];
  const signatures=new Set([...left.rows.keys(),...right.rows.keys()]);
  let matched=0;
  for(const signature of signatures){
   const a=left.rows.get(signature)||[],b=right.rows.get(signature)||[];
   if(a.length!==1||b.length!==1){
    (a.length&&b.length?conflicts:missing).push(signature);continue;
   }
   matched++;
   const marked=x=>['owned','wish','ordered','skip'].includes(x.status)&&(x.status!=='owned'||Number(x.quantity)>0);
   const am=marked(a[0]),bm=marked(b[0]);
   if(am&&bm){
    if(a[0].status!==b[0].status||a[0].status==='owned'&&Number(a[0].quantity)!==Number(b[0].quantity))
     conflicts.push(signature+' ('+a[0].status+' / '+b[0].status+')');
   }else if(am!==bm){
    const from=am?a[0]:b[0],to=am?b[0]:a[0];
    if(!['unset','',undefined,null].includes(to.status)){conflicts.push(signature);continue}
    patches.push({id:to.id,expectedStatus:to.status,expectedQuantity:to.quantity,status:from.status,quantity:from.quantity,name:to.name});
   }
  }
  pairs.push({a:roots[i],b:roots[j],matched,patches,conflicts,missing,left:left.rows.size,right:right.rows.size});
 }
 return pairs.sort((a,b)=>b.matched-a.matched);
}
async function reconcileDuplicateHp(){
 if(!available()||!syncUser())throw Error('Увійди до акаунта.');
 if(state.busy)throw Error('Зачекай завершення іншої операції.');
 state.busy=true;state.error='';status('Порівнюємо дублікати Harry Potter на цьому пристрої…');
 let applied=false;
 try{
  const plans=duplicateHpPlan(window.CollectorLocal.read());
  if(!plans.length){status('Не знайдено двох кореневих папок Harry Potter з простою структурою для звірки. Нічого не змінено.');return}
  const p=plans[0],details='Зіставлено карток: '+p.matched+'. Без пари: '+p.missing.length+'. Конфліктів: '+p.conflicts.length+'. Позначок для копіювання: '+p.patches.length+'.';
  if(p.conflicts.length||p.missing.length){
   state.duplicateHpReport={details,conflicts:p.conflicts.slice(0,12),missing:p.missing.slice(0,12)};
   status('⚠ Знайдено розбіжності. Автоматичне зведення зупинено; переглянь звіт нижче.');
   return;
  }
  if(!p.patches.length){status('Обидві папки вже мають однакові позначки для зіставлених карток. Папки не видалялися.');return}
  if(!confirm('Звести позначки двох папок Harry Potter?\\n\\n'+details+'\\n\\nПозначки скопіюються тільки у порожні картки. Папки, фотографії та дописи залишаться без змін. Буде створено страховочну хмарну копію.'))return;
  await saveSafetyCopy();
  const count=await window.CollectorLocal.applyDuplicateMarks(p.patches);
  applied=true;
  status('✓ Зведено '+count+' позначок між двома папками. Обидві папки залишено для контрольної перевірки.');
 }catch(err){fail(err)}
 finally{state.busy=false;state.refresh?.();if(applied)notifyLocalChange()}
}
async function reconcileDevices(){
 if(!available()||!syncUser())throw Error('Для синхронізації увійди до акаунта.');
 if(state.busy){state.syncPending=true;return}
 state.busy=true;state.error='';status('Синхронізація колекцій з іншими пристроями…');
 let totalFolders=0,totalItems=0,totalUpdated=0,totalAlignedFolders=0,totalAlignedItems=0,needsBackup=false;
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
   totalAlignedFolders+=outcome.alignedFolders||0;totalAlignedItems+=outcome.alignedItems||0;
  }
  // Upload a consolidated copy for this device only. Never overwrite the other device's backup.
  const snapshot={app:'moya-kolektsiya',version:1,device,created:new Date().toISOString(),data:window.CollectorLocal.read()};
  const bytes=enc.encode(JSON.stringify(snapshot));
  if(bytes.length>45*1024*1024)throw Error('Об’єднана колекція завелика для хмари (понад 45 МБ). Зроби JSON-копію локально.');
  await request('object/'+BUCKET+'/'+objectName(state.userId,device+'.json'),{method:'POST',body:bytes,upsert:true});
  state.lastUpload=new Date().toISOString();localStorage.setItem(lastKey(state.userId),state.lastUpload);
  state.lastSynced=Date.now();state.loaded=false;
  status('✓ Синхронізовано. Додано '+totalFolders+' папок, '+totalItems+' предметів; оновлено '+totalUpdated+' карток. Зіставлено '+totalAlignedFolders+' серій і '+totalAlignedItems+' предметів між пристроями.');
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
 +'<div class="row"><button class="btn" id="cloudSync" type="button" '+(state.busy?'disabled':'')+'>↻ Синхронізувати зараз</button><button class="alt" id="cloudUpload" type="button" '+(state.busy?'disabled':'')+'>↑ Зберегти в хмарі</button><button class="alt" id="cloudList" type="button" '+(state.busy?'disabled':'')+'>↓ Мої хмарні копії</button><button class="alt" id="cloudHpCheck" type="button" '+(state.busy?'disabled':'')+'>🔎 Перевірити Harry Potter</button><button class="alt" id="cloudHpRestore" type="button" '+(state.busy?'disabled':'')+'>♻ Відновити позначки Harry Potter</button><button class="alt" id="cloudHpFolders" type="button" '+(state.busy?'disabled':'')+'>📁 Де мої позначки?</button><button class="alt" id="cloudHpDuplicates" type="button" '+(state.busy?'disabled':'')+'>⇄ Звести дублікати Harry Potter</button></div>'
 +(state.lastUpload?'<p class="muted">Остання копія цього пристрою: '+esc(new Date(state.lastUpload).toLocaleString('uk-UA'))+'</p>':'')
 +(state.notice?'<div class="banner">'+esc(state.notice)+'</div>':'')
 +(state.error?'<div class="banner cloud-error">'+esc(state.error)+'</div>':'')
 +renderHpFolderAudit()
 +(state.duplicateHpReport?'<div class="card"><b>Звіт про дублікати</b><p>'+esc(state.duplicateHpReport.details)+'</p><p class="muted">Конфлікти: '+state.duplicateHpReport.conflicts.map(esc).join(' · ')+'</p><p class="muted">Картки без пари: '+state.duplicateHpReport.missing.map(esc).join(' · ')+'</p></div>':'')
  +(state.hpDiagnostic?'<div class="card cloud-diagnostic"><h3>🪄 Harry Potter — звірка «Маю»</h3><p class="muted">Порівняння тільки для цього акаунта. Копії не змінювалися.</p><div class="cloud-copy"><div><b>Цей пристрій (локально)</b><small>Серій: '+state.hpDiagnostic.local.folders+' · Карток: '+state.hpDiagnostic.local.items+' · Маю: '+state.hpDiagnostic.local.owned+' · Замовлено: '+state.hpDiagnostic.local.ordered+' · Хочу: '+state.hpDiagnostic.local.wanted+'</small></div></div>'+state.hpDiagnostic.rows.map((x,index)=>'<div class="cloud-copy"><div><b>'+(x.own?'Копія цього пристрою':'Копія іншого пристрою')+' '+(index+1)+'</b><small>'+(x.updated?esc(new Date(x.updated).toLocaleString('uk-UA'))+' · ':'')+'Серій: '+x.folders+' · Карток: '+x.items+' · Маю: '+x.owned+' · Замовлено: '+x.ordered+' · Хочу: '+x.wanted+'</small></div></div>').join('')+'</div>':'')
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
 document.getElementById('cloudHpCheck')?.addEventListener('click',()=>diagnoseHarryPotter().catch(fail));
  document.getElementById('cloudHpRestore')?.addEventListener('click',()=>restoreHarryPotter().catch(fail));
 document.getElementById('cloudHpFolders')?.addEventListener('click',()=>auditHarryPotterFolders().catch(fail));
 document.getElementById('cloudHpDuplicates')?.addEventListener('click',()=>reconcileDuplicateHp().catch(fail));
 const listButton=document.getElementById('cloudList');
 if(listButton)listButton.onclick=()=>list();
 document.querySelectorAll('[data-cloud-merge]').forEach(el=>el.onclick=()=>mergeFrom(el.dataset.cloudMerge));
}
function signedOut(){state.userId='';state.loaded=false;state.snapshots=[];state.hpDiagnostic=null;state.uploadPending=false;state.syncPending=false;if(timer){clearTimeout(timer);timer=null}}
window.addEventListener('online',()=>{startIfReady();if(state.auto&&state.autoStarted)notifyLocalChange()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;startIfReady();if(state.auto&&Date.now()-state.lastSynced>45000)notifyLocalChange()});
window.addEventListener('focus',()=>{startIfReady();if(state.auto&&state.autoStarted&&Date.now()-state.lastSynced>45000)notifyLocalChange()});
window.CollectorCloud={render,attach,notifyLocalChange,syncNow,signedOut,start:startIfReady};
document.addEventListener('DOMContentLoaded',startIfReady);
window.addEventListener('load',startIfReady);
const style=document.createElement('style');style.textContent='.collector-cloud{margin-top:20px;display:grid;gap:12px}.collector-cloud h2{margin:0}.cloud-switch{display:flex;align-items:center;gap:12px;font-weight:650}.cloud-switch input{width:20px;height:20px}.cloud-copies{display:grid;gap:10px}.cloud-copies h3{margin:0}.cloud-copy{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--edge);border-radius:12px;padding:10px}.cloud-copy small{display:block;color:var(--sub);margin-top:5px}.cloud-error{border:1px solid #d88696}';document.head.appendChild(style);const auditStyle=document.createElement('style');auditStyle.textContent='.cloud-folder-report{border-top:1px solid var(--edge);padding:9px 0}.cloud-folder-report small{display:block;color:var(--sub);margin-top:4px}.cloud-folder-report details{margin-top:5px}.cloud-diagnostic>.card{margin-top:10px}';document.head.appendChild(auditStyle);
})();