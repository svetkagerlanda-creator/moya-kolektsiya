/* Collector chats. Authenticated members only; public chat posts are user-written, not inventory updates. */
(()=>{
'use strict';
const URLROOT='https://nihheolmwvkgtvtmfzsv.supabase.co';
const KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
const st={id:'',people:[],mode:'general',target:'',thread:'',threads:[],general:[],direct:[],blocked:[],inbox:[],readSeen:{},drafts:{},announcement:null,busy:false,loaded:false,error:'',info:'',refresh:null,fetching:false,peekBusy:false,lastPeek:0};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=s=>window.CollectorI18n?.translate(s,document.documentElement.lang||'uk')||s;
const knownPerson=id=>st.people.find(p=>p.id===id);
const knownContact=id=>st.inbox.find(t=>t.other_id===id);
const pname=id=>knownPerson(id)?.display_name||knownPerson(id)?.handle||knownContact(id)?.other_name||knownContact(id)?.other_handle||tr('Колекціонер');
const handle=id=>knownPerson(id)?.handle||knownContact(id)?.other_handle||'';
const unreadCount=()=>st.inbox.reduce((sum,t)=>sum+Math.max(0,Number(t.unread_count)||0),0);
const unreadBadge=count=>count>0?'<span class="cc-unread-badge" aria-label="'+tr('Непрочитаних повідомлень')+': '+count+'">'+(count>99?'99+':count)+'</span>':'';

const eurl=x=>encodeURIComponent(String(x));
const uidPair=(a,b)=>a<b?[a,b]:[b,a];
const blocked=id=>st.blocked.some(b=>b.blocked_id===id);
const hh=t=>{try{return new Date(t).toLocaleString(document.documentElement.lang||'uk',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return''}};
async function api(table,params='',method='GET',data){
 const token=await window.CollectorCommunity?.getAccessToken?.();if(!token)throw Error(tr('Сеанс завершився. Увійди повторно.'));
 const headers={apikey:KEY,Authorization:'Bearer '+token};
 if(data!==undefined)headers['Content-Type']='application/json';
 if(method==='POST')headers.Prefer='return=representation';
 const url=URLROOT+'/rest/v1/'+table+(params?'?'+params:'');
 const res=await fetch(url,{method,headers,body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
 const raw=await res.text();let value=null;try{value=JSON.parse(raw)}catch{}
 if(!res.ok)throw Error(value?.message||value?.hint||tr('Помилка сервера')+' ('+res.status+')');
 return value;
}
const messageView=(m,where)=>{
 const isMine=m.sender_id===st.id,hidden=!isMine&&blocked(m.sender_id);
 return '<div class="cc-message '+(isMine?'cc-own':'')+'"><div class="cc-message-head"><b>'+esc(isMine?tr('Я'):pname(m.sender_id))+'</b><small>'+esc(hh(m.created_at))+'</small></div>'
 +(hidden?'<p class="muted">'+tr('Повідомлення заблокованого користувача приховано.')+'</p>':'<p>'+esc(m.body)+'</p>')
 +(isMine?'<div class="cc-message-tools"><button type="button" class="alt" data-cc="delete" data-id="'+esc(m.id)+'" data-type="'+where+'">'+tr('Видалити повідомлення')+'</button></div>':'')
 +(!isMine&&!hidden?'<div class="cc-message-tools"><button type="button" class="alt" data-cc="report" data-id="'+esc(m.id)+'" data-sender="'+esc(m.sender_id)+'" data-type="'+where+'">'+tr('Поскаржитися')+'</button><button type="button" class="alt" data-cc="block" data-sender="'+esc(m.sender_id)+'">'+tr('Заблокувати')+'</button></div>':'')
 +'</div>';
};
function start(userId){
 if(!st.id||!userId||userId===st.id)return;
 st.mode='direct';st.target=userId;st.thread='';
 const existing=st.threads.find(t=>[t.user_low,t.user_high].includes(userId));
 if(existing)st.thread=existing.id;
 st.direct=[];st.error='';st.info='';st.refresh?.();
 if(existing)refreshMessages();
}
function setup(id,people){
 if(st.id!==id)Object.assign(st,{id,people:people||[],mode:'general',target:'',thread:'',threads:[],general:[],direct:[],blocked:[],inbox:[],readSeen:{},drafts:{},announcement:null,loaded:false,error:'',info:'',busy:false,fetching:false,peekBusy:false,lastPeek:0});
 else st.people=people||[];
}
function clean(){if(notificationTimer){clearInterval(notificationTimer);notificationTimer=null}st.id='';st.loaded=false;st.threads=[];st.general=[];st.direct=[];st.blocked=[];st.inbox=[];st.readSeen={};st.drafts={};st.announcement=null;st.target='';st.thread='';clearInterval(timer);timer=null}
async function refreshAll(){
 if(st.fetching||!st.id)return;
 st.fetching=true;
 try{
  const [threads,global,blocks,announcements,inbox]=await Promise.all([
   api('collector_dm_threads','select=id,user_low,user_high,created_at&order=created_at.desc&limit=100'),
   api('collector_global_chat','select=id,sender_id,body,created_at&order=created_at.desc&limit=100'),
   api('collector_blocks','select=blocked_id&limit=200'),
   api('collector_chat_announcements','select=id,title,body,author_name,updated_at&id=eq.welcome_beta_1&is_active=eq.true&limit=1'),
   api('rpc/collector_dm_inbox','','POST',{})
  ]);
  st.threads=threads||[];st.general=(global||[]).reverse();st.blocked=blocks||[];st.announcement=announcements?.[0]||null;st.inbox=inbox||[];st.lastPeek=Date.now();
  st.loaded=true;st.error='';
  if(st.target){
   const match=st.threads.find(t=>[t.user_low,t.user_high].includes(st.target));
   if(match)st.thread=match.id;
  }
  if(st.mode==='direct'&&st.thread)await refreshMessages(true);
 }catch(error){st.error=String(error.message||error)}
 finally{st.fetching=false;st.refresh?.()}
}
async function refreshMessages(silent=false){
 const thread=st.thread;if(!thread)return;
 try{
  const data=await api('collector_dm_entries','select=id,thread_id,sender_id,body,created_at&thread_id=eq.'+eurl(thread)+'&order=created_at.desc&limit=100');
  if(st.thread!==thread)return;
  st.direct=(data||[]).reverse();
  const seen=st.direct.filter(m=>m.sender_id!==st.id).at(-1);
  const visible=document.visibilityState==='visible'&&st.mode==='direct'&&Boolean(document.getElementById('ccHistory'));
  if(visible&&seen&&st.readSeen[thread]!==seen.id){
   await api('rpc/collector_mark_dm_read','','POST',{_thread_id:thread,_through:seen.created_at});
   st.readSeen[thread]=seen.id;
   const row=st.inbox.find(item=>item.thread_id===thread);
   if(row)row.unread_count=0;
  }
  if(!silent)st.refresh?.();
 }catch(error){st.error=String(error.message||error);st.refresh?.()}
}
async function peekInbox(){
 if(!st.id||st.peekBusy||st.fetching)return;
 st.peekBusy=true;const current=st.id;
 try{
  const items=await api('rpc/collector_dm_inbox','','POST',{});
  if(current!==st.id)return;
  const before=JSON.stringify(st.inbox.map(x=>[x.thread_id,x.unread_count,x.last_sent_at,x.other_name,x.other_handle]));
  st.inbox=items||[];st.lastPeek=Date.now();
  const after=JSON.stringify(st.inbox.map(x=>[x.thread_id,x.unread_count,x.last_sent_at,x.other_name,x.other_handle]));
  if(before!==after)st.refresh?.();
 }catch(error){st.error=String(error.message||error)}
 finally{st.peekBusy=false}
}
let notificationTimer=null;
function connect(refresh){
 st.refresh=refresh;
 if(!st.id)return;
 if(!st.lastPeek&&!st.peekBusy)peekInbox();
 if(notificationTimer)return;
 notificationTimer=setInterval(()=>{
  if(!document.querySelector('.sc-wrap')){clearInterval(notificationTimer);notificationTimer=null;return}
  if(document.visibilityState==='visible'&&navigator.onLine&&(st.mode!=='direct'||!document.querySelector('[data-cc-mode="direct"].active'))&&!st.fetching&&Date.now()-st.lastPeek>=20000)peekInbox();
 },20000);
}
let timer=null;
function activate(){if(timer)return;timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine&&st.id&&!st.busy)refreshAll()},12000)}
function deactivate(){if(timer){clearInterval(timer);timer=null}}
function pinnedWelcome(){
 const a=st.announcement;if(!a)return '';
 return '<section class="cc-pinned" role="note" aria-label="'+tr('Закріплене повідомлення')+'"><div class="cc-pinned-heading"><span>📌 '+tr('Закріплене повідомлення')+'</span><small>'+esc(a.author_name)+'</small></div><h3>'+esc(a.title)+'</h3><div class="cc-pinned-body">'+esc(a.body)+'</div></section>';
}
function general(){
 return '<section class="cc-panel"><div class="cc-title"><h3>🌍 '+tr('Загальний чат')+'</h3><span class="muted">'+tr('Повідомлення бачать зареєстровані користувачі')+'</span></div>'
 +pinnedWelcome()
 +'<div class="cc-history" id="ccHistory">'+(st.general.length?st.general.map(m=>messageView(m,'global')).join(''):'<div class="empty">'+tr('Напиши перше повідомлення спільноті!')+'</div>')+'</div>'
 +compose('global')+'</section>';
}
function inbox(){
 const buttons=st.inbox.map(t=>{
  const other=t.other_id,count=Number(t.unread_count)||0;
  return '<button type="button" class="cc-peer '+(st.target===other?'active':'')+(count?' cc-has-unread':'')+'" data-cc="person" data-id="'+esc(other)+'">'
   +'<span class="cc-peer-head"><b>'+esc(pname(other))+'</b>'+unreadBadge(count)+'</span>'
   +'<small>@'+esc(handle(other))+'</small>'
   +(t.last_message?'<span class="cc-peer-preview">'+esc(t.last_message.slice(0,80))+'</span>':'')
   +(t.last_sent_at?'<small>'+esc(hh(t.last_sent_at))+'</small>':'')+'</button>';
 }).join('');
 const candidates=st.people.filter(p=>p.id!==st.id&&p.is_discoverable&&!blocked(p.id));
 return '<div class="cc-layout"><aside class="cc-inbox"><h3>'+tr('Особисті діалоги')+'</h3><label class="muted">'+tr('Написати колекціонеру')+'<select id="ccChoosePerson" class="field"><option value="">'+tr('Обери користувача')+'</option>'+candidates.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.display_name||p.handle)+' (@'+esc(p.handle)+')</option>').join('')+'</select></label><div class="cc-peer-list">'+(buttons||'<p class="muted">'+tr('Діалогів ще немає.')+'</p>')+'</div></aside>'
 +'<section class="cc-panel">'+(st.target?direct():'<div class="empty">'+tr('Обери людину або відкрий її профіль, щоб написати повідомлення.')+'</div>')+'</section></div>';
}
function direct(){
 return '<div class="cc-title"><h3>'+esc(pname(st.target))+'</h3><span class="muted">@'+esc(handle(st.target))+'</span></div>'
 +(blocked(st.target)?'<div class="banner">'+tr('Цього користувача заблоковано.')+' <button class="alt" type="button" data-cc="unblock" data-sender="'+esc(st.target)+'">'+tr('Розблокувати')+'</button></div>':'')
 +'<div class="cc-history" id="ccHistory">'+(st.direct.length?st.direct.map(m=>messageView(m,'direct')).join(''):'<div class="empty">'+tr('Поки немає повідомлень. Почни розмову!')+'</div>')+'</div>'
 +(blocked(st.target)?'':compose('direct'));
}
function draftKey(){return st.mode==='direct'?'dm:'+st.target:'general'}
function compose(where){
 const privateTarget=where==='direct'&&st.target;
 const publicOk=st.people.find(p=>p.id===st.id)?.is_discoverable;
 if(!privateTarget&&!publicOk)return '<p class="muted">'+tr('Щоб писати в загальному чаті, зроби профіль публічним у налаштуваннях.')+'</p>';
 return '<form id="ccSend" class="cc-compose"><textarea name="body" rows="2" maxlength="1200" required class="field" placeholder="'+tr('Твоє повідомлення…')+'">'+esc(st.drafts[draftKey()]||'')+'</textarea><button class="btn" type="submit" '+(st.busy?'disabled':'')+'>'+tr('Надіслати')+'</button></form>';
}
function render(){
 if(!st.id)return '<div class="empty">'+tr('Увійди в акаунт, щоб користуватися чатом.')+'</div>';
 return '<div class="cc-wrap"><div class="cc-modes" role="group" aria-label="'+tr('Види чатів')+'"><button type="button" data-cc-mode="general" class="'+(st.mode==='general'?'active':'')+'">🌍 '+tr('Загальний чат')+'</button><button type="button" data-cc-mode="direct" class="'+(st.mode==='direct'?'active':'')+'">✉ '+tr('Особисті повідомлення')+unreadBadge(unreadCount())+'</button></div>'
 +'<p class="muted">'+tr('У чатах не публікуються твої колекції чи фото без твоєї дії. Не надсилай паролі та резервні коди.')+'</p>'
 +(st.error?'<div class="banner">'+esc(st.error)+'</div>':'')+(st.info?'<div class="banner">'+esc(st.info)+'</div>':'')
 +(!st.loaded?'<div class="empty">'+tr('Завантаження чату…')+'</div>':st.mode==='general'?general():inbox())+'</div>';
}
async function send(event){
 event.preventDefault();
 const form=event.currentTarget,body=form.elements.body.value.trim();
 if(!body||body.length>1200||st.busy)return;
 const button=form.querySelector('button');st.busy=true;button.disabled=true;
 try{
  if(st.mode==='direct'){
   if(!st.target)throw Error(tr('Обери одержувача'));
   if(!st.thread){
    const [user_low,user_high]=uidPair(st.id,st.target);
    try{
     const newThread=await api('collector_dm_threads','','POST',{user_low,user_high});
     st.thread=newThread[0]?.id;
    }catch(error){
     await refreshAll();
     const match=st.threads.find(t=>t.user_low===user_low&&t.user_high===user_high);
     if(!match)throw error;st.thread=match.id;
    }
   }
   await api('collector_dm_entries','','POST',{thread_id:st.thread,sender_id:st.id,body});
   await refreshMessages(true);
  }else{
   await api('collector_global_chat','','POST',{sender_id:st.id,body});
  }
  form.elements.body.value='';st.drafts[draftKey()]='';st.info='';
  await refreshAll();
 }catch(err){st.error=String(err.message||err);st.refresh?.()}
 finally{st.busy=false;if(button.isConnected)button.disabled=false}
}
async function doAction(type,el){
 try{
  const id=el.dataset.id,target=el.dataset.sender;
  if(type==='person'){start(id);return}
  if(type==='delete'){
   if(!confirm(tr('Видалити власне повідомлення?')))return;
   const table=el.dataset.type==='direct'?'collector_dm_entries':'collector_global_chat';
   await api(table,'id=eq.'+eurl(id)+'&sender_id=eq.'+eurl(st.id),'DELETE');
   await refreshAll();return;
  }
  if(type==='block'){
   if(!confirm(tr('Заблокувати цього користувача? Ви більше не зможете обмінюватися повідомленнями.')))return;
   await api('collector_blocks','','POST',{blocker_id:st.id,blocked_id:target});
   st.info=tr('Користувача заблоковано.');await refreshAll();return;
  }
  if(type==='unblock'){
   await api('collector_blocks','blocker_id=eq.'+eurl(st.id)+'&blocked_id=eq.'+eurl(target),'DELETE');
   st.info=tr('Користувача розблоковано.');await refreshAll();return;
  }
  if(type==='report'){
   const reason=prompt(tr('Причина скарги (до 300 символів):'));
   if(!reason?.trim())return;
   await api('collector_reports','','POST',{reporter_id:st.id,target_user_id:target,reason:('Chat '+(el.dataset.type||'')+' #'+id+': '+reason.trim()).slice(0,500)});
   st.info=tr('Скаргу надіслано. Дякуємо.');st.refresh?.();
  }
 }catch(err){st.error=String(err.message||err);st.refresh?.()}
}
function attach(refresh){
 st.refresh=refresh;
 if(!st.loaded&&!st.fetching){refreshAll();return}
 document.querySelectorAll('[data-cc-mode]').forEach(b=>b.onclick=()=>{st.mode=b.dataset.ccMode;st.error='';refresh();if(st.mode==='direct'&&st.thread)refreshMessages()});
 document.querySelectorAll('[data-cc]').forEach(b=>b.onclick=()=>doAction(b.dataset.cc,b));
 const select=document.getElementById('ccChoosePerson');if(select)select.onchange=e=>{if(e.target.value)start(e.target.value)};
 const form=document.getElementById('ccSend');if(form){form.onsubmit=send;form.elements.body.addEventListener('input',()=>{st.drafts[draftKey()]=form.elements.body.value})}
 const history=document.getElementById('ccHistory');if(history&&!history.dataset.initialScroll){history.scrollTop=history.scrollHeight;history.dataset.initialScroll='yes'}
 activate();
}
const css='.cc-unread-badge{display:inline-flex;align-items:center;justify-content:center;min-width:21px;height:21px;padding:0 6px;background:#d92d59;color:#fff;border-radius:999px;font-weight:800;font-size:12px;line-height:1}.cc-peer-head{display:flex;align-items:center;justify-content:space-between;gap:7px}.cc-peer-preview{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:5px;color:var(--sub);font-size:12px}.cc-peer.cc-has-unread{border-color:var(--accent);background:var(--pale)}.cc-pinned{padding:15px 17px;border:1px solid var(--accent);border-radius:16px;background:var(--pale);color:var(--fg);box-shadow:0 2px 10px #0000000b}.cc-pinned-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:7px;color:var(--accent);font-size:13px;font-weight:800}.cc-pinned-heading small{color:var(--sub);font-weight:600}.cc-pinned h3{margin:12px 0 10px;font-size:17px}.cc-pinned-body{white-space:pre-wrap;line-height:1.6;font-size:14px;overflow-wrap:anywhere}.cc-wrap{display:grid;gap:14px}.cc-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:5px;background:var(--panel);border:1px solid var(--edge);border-radius:16px}.cc-modes button{border:0;border-radius:12px;background:transparent;color:var(--fg);padding:13px 7px;cursor:pointer;font-weight:650}.cc-modes button.active{background:var(--pale);color:var(--accent)}.cc-title{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}.cc-title h3{margin:0}.cc-panel{background:var(--panel);border:1px solid var(--edge);border-radius:16px;padding:15px;display:grid;gap:12px;min-width:0}.cc-history{height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:8px;background:var(--bg);border-radius:14px;border:1px solid var(--edge)}.cc-message{max-width:min(85%,610px);padding:10px 13px;background:var(--panel);border-radius:12px;overflow-wrap:anywhere}.cc-message.cc-own{margin-left:auto;background:var(--pale)}.cc-message p{margin:7px 0;white-space:pre-wrap}.cc-message-head{display:flex;gap:10px;align-items:center}.cc-message-head small{color:var(--sub)}.cc-message-tools{display:flex;gap:6px;flex-wrap:wrap}.cc-message-tools button{padding:6px 9px;font-size:11px}.cc-compose{display:flex;gap:9px;align-items:end}.cc-compose textarea{flex:1;min-width:0;resize:vertical}.cc-compose button{align-self:stretch}.cc-layout{display:grid;grid-template-columns:minmax(200px,260px) minmax(0,1fr);gap:12px}.cc-inbox{background:var(--panel);border:1px solid var(--edge);border-radius:16px;padding:12px;min-width:0}.cc-inbox h3{margin:0 0 12px}.cc-inbox label{display:grid;gap:7px}.cc-peer-list{display:grid;gap:6px;margin-top:12px}.cc-peer{border:1px solid var(--edge);padding:11px;border-radius:11px;background:var(--panel);color:var(--fg);text-align:left;cursor:pointer}.cc-peer.active{background:var(--pale);border-color:var(--accent)}.cc-peer small{display:block;color:var(--sub);margin-top:4px}@media(max-width:680px){.cc-layout{grid-template-columns:1fr}.cc-history{height:320px}.cc-compose{flex-direction:column;align-items:stretch}.cc-compose button{align-self:flex-end}}';
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
window.CollectorChats={setup,render,attach,start,clean,deactivate,connect,unreadCount};
})();