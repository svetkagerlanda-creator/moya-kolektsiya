(()=>{
const BASE='https://nihheolmwvkgtvtmfzsv.supabase.co',KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
const state={id:'',profile:null,people:[],posts:[],likes:[],comments:[],follows:[],fandoms:[],fandomFollows:[],tab:'profile',feedMode:'all',person:null,editing:false,posting:false,loaded:false,loading:false,error:'',refresh:null};
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getId=s=>{try{return JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub}catch{return null}};
const media=p=>p&&/^[0-9a-f-]{36}\/(?:avatars|posts|covers)\/[A-Za-z0-9._-]+$/.test(p)?BASE+'/storage/v1/object/public/collector-media/'+p:null;
const link=x=>{try{let u=new URL(x);return u.protocol==='https:'?u.href:null}catch{return null}};
const person=id=>state.people.find(p=>p.id===id)||null;
const pic=(p,large=false)=>{let a=media(p?.avatar_path);return '<span class="sc-avatar '+(large?'large':'')+'">'+(a?'<img src="'+escape(a)+'" alt="" loading="lazy">':escape((p?.display_name||p?.handle||'?')[0].toUpperCase()))+'</span>'};
const label=p=>p?.display_name||p?.handle||'Колекціонер';
const cropNumber=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)))):50;
const cropStyle=p=>'background-position:'+cropNumber(p?.cover_position_x)+'% '+cropNumber(p?.cover_position_y)+'%';

function fail(x){state.error=String(x?.message||x);state.refresh?.()}
async function api(table,params='',method='GET',body){
 const token=await window.CollectorCommunity?.getAccessToken?.();if(!token)throw Error('Сеанс завершився. Увійди повторно.');
 const headers={apikey:KEY,Authorization:'Bearer '+token};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(method==='POST')headers.Prefer='return=representation';
 const res=await fetch(BASE+'/rest/v1/'+table+(params?'?'+params:''),{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data=null}
 if(!res.ok)throw Error(data?.message||'Помилка сервера: '+res.status);
 return data;
}
async function reload(){
 if(state.loading)return;state.loading=true;
 try{
  const [people,posts,likes,comments,follows,fandoms,fandomFollows]=await Promise.all([
   api('collector_profiles','select=id,handle,display_name,bio,avatar_path,cover_path,cover_position_x,cover_position_y,social_links,is_discoverable&limit=200'),
   api('collector_posts','select=id,user_id,title,body,photo_path,fandom_id,created_at&order=created_at.desc&limit=100'),
   api('collector_post_likes','select=post_id,user_id&limit=2500'),
   api('collector_post_comments','select=id,post_id,user_id,body,created_at&order=created_at.asc&limit=2500'),
   api('collector_follows','select=follower_id,followed_id&limit=2500'),
   api('collector_fandoms','select=id,title,slug&order=title.asc&limit=100'),
   api('collector_fandom_follows','select=user_id,fandom_id&limit=150')
  ]);
  Object.assign(state,{people,posts,likes,comments,follows,fandoms,fandomFollows,profile:people.find(p=>p.id===state.id),loaded:true,error:''});
 }catch(err){state.error=String(err.message||err)}finally{state.loading=false;state.refresh?.()}
}
function stats(id){return '<div class="sc-stats"><span><b>'+state.posts.filter(p=>p.user_id===id).length+'</b> придбань</span><span><b>'+state.follows.filter(f=>f.followed_id===id).length+'</b> підписників</span><span><b>'+state.follows.filter(f=>f.follower_id===id).length+'</b> підписок</span></div>'}
function profileCard(p){
 let own=p.id===state.id,following=state.follows.some(f=>f.follower_id===state.id&&f.followed_id===p.id);
 const socials=Object.entries({instagram:'Instagram',tiktok:'TikTok',telegram:'Telegram',youtube:'YouTube',booknet:'Букнет',website:'Сайт'}).filter(([k])=>link(p.social_links?.[k])).map(([k,v])=>'<a href="'+escape(link(p.social_links[k]))+'" rel="noopener noreferrer" target="_blank">'+v+' ↗</a>').join('');
 return '<div class="card sc-profile"><div class="sc-cover"'+(media(p.cover_path)?' style="background-image:url(&quot;'+escape(media(p.cover_path))+'&quot;);'+cropStyle(p)+'"':'')+'></div><div class="sc-person">'+pic(p,true)+'<div><h2>'+escape(label(p))+'</h2><span class="muted">@'+escape(p.handle)+'</span></div></div><p class="sc-bio">'+(p.bio?escape(p.bio):'<span class="muted">Тут поки немає опису профілю</span>')+'</p><div class="sc-links">'+socials+'</div>'+stats(p.id)+'<div class="sc-actions">'+(own?'<button class="btn" data-sc="edit">✎ Редагувати</button><button class="alt" data-sc="newpost">＋ Нове придбання</button>':'<button class="btn" data-sc="follow" data-id="'+p.id+'">'+(following?'✓ Відписатися':'＋ Стежити')+'</button><button class="alt" data-sc-tab="people">← Колекціонери</button>')+'</div>'+(own?'<p class="muted">'+(p.is_discoverable?'🌐 Публічний профіль':'🔒 Приватний профіль — жодні колекції не публікуються автоматично')+'</p>':'')+'</div>';
}
function editForm(p){
 const fields=Object.entries({instagram:'Instagram',tiktok:'TikTok',telegram:'Telegram',youtube:'YouTube',booknet:'Букнет',website:'Сайт'}).map(([k,n])=>'<label>'+n+'<input class="field" type="url" name="'+k+'" placeholder="https://..." value="'+escape(p.social_links?.[k]||'')+'"></label>').join('');
 return '<form class="card form" id="scEdit"><h3>Налаштування профілю</h3><label>Аватар (до 3 МБ)<input class="field" name="avatar" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Обкладинка профілю (до 3 МБ)<input class="field" name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="sc-cover-editor"><div class="sc-cover-help">Перетягни зображення, щоб вибрати видиму частину банера, або скористайся повзунками.</div><div class="sc-cover-preview" id="scCoverPreview" tabindex="0" role="img" aria-label="Попередній перегляд кадрування обкладинки" style="'+(media(p.cover_path)?'background-image:url(&quot;'+escape(media(p.cover_path))+'&quot;);':'')+cropStyle(p)+'"></div><label>Горизонтально <output id="scCropXLabel">'+cropNumber(p.cover_position_x)+'%</output><input class="field" type="range" name="cover_position_x" min="0" max="100" step="1" value="'+cropNumber(p.cover_position_x)+'"></label><label>Вертикально <output id="scCropYLabel">'+cropNumber(p.cover_position_y)+'%</output><input class="field" type="range" name="cover_position_y" min="0" max="100" step="1" value="'+cropNumber(p.cover_position_y)+'"></label><button class="alt" type="button" id="scCropCenter">Центрувати зображення</button></div><label class="sc-check"><input type="checkbox" name="remove_cover"> Повернути стандартний градієнт</label><label>Ім’я<input class="field" name="display_name" maxlength="80" value="'+escape(p.display_name)+'"></label><label>Про себе<textarea class="field" name="bio" maxlength="1200" rows="4">'+escape(p.bio)+'</textarea></label><div class="sc-fields">'+fields+'</div><label class="sc-check"><input type="checkbox" name="is_discoverable" '+(p.is_discoverable?'checked':'')+'> Мій профіль публічний</label><div class="muted">Відкритий профіль дозволяє підписуватися на тебе і бачити добровільно опубліковані придбання.</div><div class="sc-actions"><button class="btn" type="submit">Зберегти</button><button class="alt" data-sc="cancel-edit" type="button">Скасувати</button></div></form>';
}
function createForm(){
 return '<form class="card form" id="scPost"><h3>Нове придбання 📦</h3><p class="muted">Опублікуй лише те, чим хочеш поділитися. Автоматичних дописів немає.</p><label>Назва<input class="field" name="title" minlength="2" maxlength="160" required placeholder="Моя нова фігурка"></label><label>Опис<textarea class="field" name="body" maxlength="2000" rows="3"></textarea></label><label>Фандом<select name="fandom_id" class="field"><option value="">Без фандому</option>'+state.fandoms.map(f=>'<option value="'+f.id+'">'+escape(f.title)+'</option>').join('')+'</select></label><label>Фото<input class="field" name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="sc-actions"><button class="btn" type="submit">Опублікувати</button><button class="alt" type="button" data-sc="cancel-post">Скасувати</button></div></form>';
}
function postCard(p){
 const author=person(p.user_id),liked=state.likes.some(l=>l.user_id===state.id&&l.post_id===p.id),cs=state.comments.filter(c=>c.post_id===p.id),f=state.fandoms.find(f=>f.id===p.fandom_id),photo=media(p.photo_path);
 return '<article class="card sc-post"><div class="sc-by">'+pic(author)+'<div><b>'+escape(label(author))+'</b><small>@'+escape(author?.handle||'')+' · '+new Date(p.created_at).toLocaleDateString('uk-UA')+'</small></div>'+(p.user_id===state.id?'<button class="alt" data-sc="delete-post" data-id="'+p.id+'">✕</button>':'')+'</div><h3>'+escape(p.title)+'</h3>'+(p.body?'<p class="sc-bio">'+escape(p.body)+'</p>':'')+(f?'<span class="tag">'+escape(f.title)+'</span>':'')+(photo?'<img class="sc-photo" src="'+escape(photo)+'" loading="lazy" alt="Фото придбання">':'')+'<div class="sc-reactions"><button class="alt" data-sc="like" data-id="'+p.id+'">'+(liked?'💗':'♡')+' '+state.likes.filter(l=>l.post_id===p.id).length+'</button><span>💬 '+cs.length+'</span></div><div class="sc-comments">'+cs.map(c=>'<div class="sc-comment">'+pic(person(c.user_id))+'<p><b>'+escape(label(person(c.user_id)))+'</b> '+escape(c.body)+'</p>'+(c.user_id===state.id?'<button class="alt" data-sc="delete-comment" data-id="'+c.id+'">✕</button>':'')+'</div>').join('')+'</div><form class="sc-comment-form" data-post="'+p.id+'"><input class="field" name="body" maxlength="600" required placeholder="Коментар..."><button class="btn">➤</button></form></article>';
}
const timeline=(items,own=false)=>items.length?'<div class="sc-timeline">'+items.map(postCard).join('')+'</div>'
 :'<div class="empty sc-empty-posts"><p>Поки немає опублікованих придбань.</p>'+(own?'<button class="btn" type="button" data-sc="newpost">＋ Перший допис</button>':'')+'</div>';
function postToolbar(){
 return '<div class="sc-post-toolbar"><h3>Мої публікації</h3><button class="btn" type="button" data-sc="newpost">＋ Додати допис</button></div>';
}
function feed(){
 const publicPosts=state.posts.filter(p=>p.user_id===state.id||person(p.user_id)?.is_discoverable);
 const followedUsers=new Set(state.follows.filter(f=>f.follower_id===state.id).map(f=>f.followed_id));
 const followedFandoms=new Set(state.fandomFollows.filter(f=>f.user_id===state.id).map(f=>f.fandom_id));
 const subscribed=publicPosts.filter(p=>p.user_id===state.id||followedUsers.has(p.user_id)||(p.fandom_id&&followedFandoms.has(p.fandom_id)));
 const showAll=state.feedMode==='all';
 const posts=showAll?publicPosts:subscribed;
 return '<div class="sc-feed-head"><h2>Стрічка придбань</h2><button type="button" class="alt" data-sc="refresh">↻ Оновити</button></div>'
 +'<div class="sc-feed-tabs" role="group" aria-label="Стрічки"><button type="button" data-sc-feed="all" class="'+(showAll?'active':'')+'" aria-pressed="'+showAll+'">🌍 Загальна</button><button type="button" data-sc-feed="following" class="'+(!showAll?'active':'')+'" aria-pressed="'+(!showAll)+'">♡ Підписки</button></div>'
 +'<p class="muted">'+(showAll?'Добровільні дописи з усіх публічних профілів.':'Дописи людей і фандомів, за якими стежиш, та твої дописи.')+'</p>'
 +(posts.length?timeline(posts):'<div class="empty">'+(showAll?'У загальній стрічці ще немає публікацій.':'Тут з’являться придбання з твоїх підписок. Знайди колекціонерів або фандоми, щоб почати.')+'</div>');
}
function render(session){
 const id=getId(session);if(!id)return '<div class="banner">Сеанс завершився. Увійди повторно.</div>';
 if(state.id!==id)Object.assign(state,{id,profile:null,people:[],posts:[],likes:[],comments:[],follows:[],fandoms:[],fandomFollows:[],tab:'profile',feedMode:'all',person:null,loaded:false,loading:false,editing:false,posting:false});
 const p=state.person?person(state.person):state.profile;
 return '<div class="sc-wrap"><nav class="sc-tabs">'+[['profile','Профіль'],['feed','Стрічка'],['people','Люди'],['fandoms','Фандоми']].map(([id,t])=>'<button class="'+(state.tab===id?'active':'')+'" type="button" data-sc-tab="'+id+'">'+t+'</button>').join('')+'</nav>'+(state.error?'<div class="banner">'+escape(state.error)+'</div>':'')+(!state.loaded?'<div class="empty">Завантаження...</div>':state.tab==='profile'?(p?profileCard(p)+(state.editing&&p.id===state.id?editForm(p):'')+(state.posting&&p.id===state.id?createForm():'')+(p.id===state.id?postToolbar():'')+timeline(state.posts.filter(x=>x.user_id===p.id),p.id===state.id):'<div class="empty">Не вдалося завантажити профіль</div>'):state.tab==='feed'?feed():state.tab==='people'?'<h2>Колекціонери</h2><input id="scSearch" class="field" placeholder="Знайти нікнейм..."><div class="sc-people">'+state.people.filter(p=>p.is_discoverable&&p.id!==state.id).map(p=>'<button class="card sc-tile" data-sc="person" data-id="'+p.id+'">'+pic(p)+'<span>'+escape(label(p))+'<small>@'+escape(p.handle)+'</small></span> ›</button>').join('')+'</div>':'<h2>Підписки на фандоми</h2><div class="sc-fandoms">'+state.fandoms.map(f=>{let on=state.fandomFollows.some(x=>x.user_id===state.id&&x.fandom_id===f.id);return '<div class="card sc-fandom"><span>✨ '+escape(f.title)+'</span><button class="'+(on?'alt':'btn')+'" data-sc="fandom" data-id="'+f.id+'">'+(on?'✓ Стежу':'＋ Стежити')+'</button></div>'}).join('')+'</div>')+'</div>';
}
async function upload(file,type){
 if(!file)return null;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3145728)throw Error('Фото має бути JPG, PNG або WEBP до 3 МБ.');
 const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
 const name=state.id+'/'+type+'/'+crypto.randomUUID()+'.'+ext;
 const token=await window.CollectorCommunity.getAccessToken();if(!token)throw Error('Увійди до акаунта повторно.');
 const r=await fetch(BASE+'/storage/v1/object/collector-media/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':file.type},body:file});
 if(!r.ok)throw Error('Не вдалося завантажити зображення');
 return name;
}
async function action(kind,id){
 try{
 if(kind==='refresh')await reload();
 else if(kind==='edit')state.editing=true;
 else if(kind==='cancel-edit')state.editing=false;
 else if(kind==='newpost'){state.tab='profile';state.person=null;if(!state.profile?.is_discoverable){state.editing=true;throw Error('Для публікації спочатку увімкни публічний профіль і збережи налаштування. Предмети колекції не стануть публічними.')}state.posting=true}
 else if(kind==='cancel-post')state.posting=false;
 else if(kind==='person'){state.person=id;state.tab='profile'}
 else if(kind==='follow'){let on=state.follows.some(f=>f.follower_id===state.id&&f.followed_id===id);await api('collector_follows',on?'follower_id=eq.'+state.id+'&followed_id=eq.'+id:'',on?'DELETE':'POST',on?undefined:{follower_id:state.id,followed_id:id});await reload()}
 else if(kind==='fandom'){let on=state.fandomFollows.some(f=>f.user_id===state.id&&f.fandom_id===id);await api('collector_fandom_follows',on?'user_id=eq.'+state.id+'&fandom_id=eq.'+id:'',on?'DELETE':'POST',on?undefined:{user_id:state.id,fandom_id:id});await reload()}
 else if(kind==='like'){let on=state.likes.some(l=>l.user_id===state.id&&l.post_id===id);await api('collector_post_likes',on?'post_id=eq.'+id+'&user_id=eq.'+state.id:'',on?'DELETE':'POST',on?undefined:{post_id:id,user_id:state.id});await reload()}
 else if(kind==='delete-post'){if(!confirm('Видалити допис?'))return;await api('collector_posts','id=eq.'+id,'DELETE');await reload()}
 else if(kind==='delete-comment'){await api('collector_post_comments','id=eq.'+id+'&user_id=eq.'+state.id,'DELETE');await reload()}
 state.refresh?.();
 }catch(err){fail(err)}
}
function attach(session,refresh){
 state.refresh=refresh;if(!state.loaded&&!state.loading){reload();return}
 document.querySelectorAll('[data-sc-tab]').forEach(el=>el.onclick=()=>{state.tab=el.dataset.scTab;state.person=null;state.editing=false;state.posting=false;refresh()});
 document.querySelectorAll('[data-sc-feed]').forEach(el=>el.onclick=()=>{state.feedMode=el.dataset.scFeed==='following'?'following':'all';refresh()});
 document.querySelectorAll('[data-sc]').forEach(el=>el.onclick=()=>action(el.dataset.sc,el.dataset.id));
 document.getElementById('scSearch')?.addEventListener('input',ev=>{let q=ev.target.value.toLocaleLowerCase();document.querySelectorAll('.sc-tile').forEach(el=>el.hidden=!el.textContent.toLocaleLowerCase().includes(q))});
 const edit=document.getElementById('scEdit');
 if(edit){
  const f=edit.elements,preview=document.getElementById('scCoverPreview');
  let objectUrl=null;
  const updateCrop=()=>{
   const x=cropNumber(f.cover_position_x.value),y=cropNumber(f.cover_position_y.value);
   preview.style.backgroundPosition=x+'% '+y+'%';
   document.getElementById('scCropXLabel').value=x+'%';
   document.getElementById('scCropYLabel').value=y+'%';
  };
  const inputFile=()=>{
   if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}
   const file=f.cover.files[0];
   if(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3145728){
     f.cover.value='';fail('Обкладинка має бути JPG, PNG або WEBP до 3 МБ.');return;
    }
    objectUrl=URL.createObjectURL(file);
    preview.style.backgroundImage='url("'+objectUrl+'")';
   }else preview.style.backgroundImage=`url("${media(state.profile?.cover_path)||''}")`;
   updateCrop();
  };
  f.cover.addEventListener('change',inputFile);
  f.cover_position_x.addEventListener('input',updateCrop);
  f.cover_position_y.addEventListener('input',updateCrop);
  document.getElementById('scCropCenter').addEventListener('click',()=>{
   f.cover_position_x.value=50;f.cover_position_y.value=50;updateCrop();
  });
  let pointer=null;
  preview.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   pointer={id:event.pointerId,x:event.clientX,y:event.clientY,initialX:Number(f.cover_position_x.value),initialY:Number(f.cover_position_y.value)};
   preview.setPointerCapture(event.pointerId);
  });
  preview.addEventListener('pointermove',event=>{
   if(!pointer||pointer.id!==event.pointerId)return;
   const box=preview.getBoundingClientRect();
   f.cover_position_x.value=cropNumber(pointer.initialX-(event.clientX-pointer.x)*100/Math.max(box.width,1));
   f.cover_position_y.value=cropNumber(pointer.initialY-(event.clientY-pointer.y)*100/Math.max(box.height,1));
   updateCrop();
  });
  const finish=()=>{pointer=null};
  preview.addEventListener('pointerup',finish);
  preview.addEventListener('pointercancel',finish);
  preview.addEventListener('lostpointercapture',finish);
  preview.addEventListener('keydown',event=>{
   const delta=event.shiftKey?10:2;
   if(event.key==='ArrowUp')f.cover_position_y.value=cropNumber(Number(f.cover_position_y.value)-delta);
   else if(event.key==='ArrowDown')f.cover_position_y.value=cropNumber(Number(f.cover_position_y.value)+delta);
   else if(event.key==='ArrowLeft')f.cover_position_x.value=cropNumber(Number(f.cover_position_x.value)-delta);
   else if(event.key==='ArrowRight')f.cover_position_x.value=cropNumber(Number(f.cover_position_x.value)+delta);
   else return;
   event.preventDefault();updateCrop();
  });
  const revoke=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}};
  edit.addEventListener('submit',()=>setTimeout(revoke,8000),{once:true});
  document.querySelector('[data-sc="cancel-edit"]')?.addEventListener('click',revoke,{once:true});
 }
 if(edit)edit.onsubmit=async ev=>{ev.preventDefault();let btn=edit.querySelector('button[type=submit]');btn.disabled=true;try{
  const f=edit.elements,social={};for(let k of ['instagram','tiktok','telegram','youtube','booknet','website']){let v=f[k].value.trim();if(v){if(!link(v))throw Error('Посилання на '+k+' має починатися з https://');social[k]=v}}
  let values={display_name:f.display_name.value.trim(),bio:f.bio.value.trim(),social_links:social,is_discoverable:f.is_discoverable.checked};
  if(f.avatar.files[0])values.avatar_path=await upload(f.avatar.files[0],'avatars');
  values.cover_position_x=cropNumber(f.cover_position_x.value);
  values.cover_position_y=cropNumber(f.cover_position_y.value);
  if(f.cover.files[0])values.cover_path=await upload(f.cover.files[0],'covers');
  else if(f.remove_cover.checked)values.cover_path=null;
  await api('collector_profiles','id=eq.'+state.id,'PATCH',values);state.editing=false;await reload();
 }catch(err){fail(err)}finally{btn.disabled=false}};
 const post=document.getElementById('scPost');
 if(post)post.onsubmit=async ev=>{ev.preventDefault();let btn=post.querySelector('button[type=submit]');btn.disabled=true;try{
  const f=post.elements,photo_path=await upload(f.photo.files[0],'posts');
  await api('collector_posts','','POST',{user_id:state.id,title:f.title.value.trim(),body:f.body.value.trim(),fandom_id:f.fandom_id.value||null,photo_path});state.posting=false;await reload();
 }catch(err){fail(err)}finally{btn.disabled=false}};
 document.querySelectorAll('.sc-comment-form').forEach(form=>form.onsubmit=async ev=>{ev.preventDefault();let b=form.querySelector('button');b.disabled=true;try{
  await api('collector_post_comments','','POST',{post_id:form.dataset.post,user_id:state.id,body:form.elements.body.value.trim()});await reload()
 }catch(err){fail(err)}finally{b.disabled=false}});
}
window.CollectorSocial={render,attach,reset:()=>{state.id='';state.loaded=false}};
const css='.sc-wrap{display:grid;gap:16px}.sc-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:5px;border:1px solid var(--edge);border-radius:16px;background:var(--panel)}.sc-tabs button{border:0;border-radius:10px;background:transparent;color:var(--fg);padding:12px 3px;font-size:13px;cursor:pointer}.sc-tabs button.active{color:var(--accent);background:var(--pale);font-weight:750}.sc-profile{padding:12px}.sc-cover{height:120px;border-radius:12px;background:linear-gradient(120deg,#8d58c4,#d1a2ef,#eab9d0)}.sc-person{display:flex;align-items:end;gap:10px;margin:-28px 10px 0;position:relative}.sc-person h2{margin:0}.sc-avatar{width:40px;height:40px;border-radius:50%;background:var(--pale);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex-shrink:0;overflow:hidden;border:2px solid var(--panel)}.sc-avatar img{width:100%;height:100%;object-fit:cover}.sc-avatar.large{width:78px;height:78px;font-size:35px;border:4px solid var(--panel)}.sc-bio{white-space:pre-wrap;overflow-wrap:anywhere}.sc-profile>.sc-bio,.sc-profile>.muted{margin:15px 10px}.sc-links{display:flex;flex-wrap:wrap;gap:8px;margin:10px}.sc-links a{font-size:13px;text-decoration:none;background:var(--pale);padding:6px 10px;border-radius:25px;color:var(--accent)}.sc-stats{display:flex;gap:15px;flex-wrap:wrap;margin:12px 10px;font-size:13px;color:var(--sub)}.sc-stats b{color:var(--fg)}.sc-actions{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0}.sc-profile>.sc-actions{margin:12px 10px}.sc-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sc-check{display:flex;gap:8px;align-items:center}.sc-timeline,.sc-people,.sc-fandoms{display:grid;gap:12px}.sc-people,.sc-fandoms{grid-template-columns:repeat(auto-fill,minmax(235px,1fr))}.sc-tile{display:flex;align-items:center;gap:10px;text-align:left;color:var(--fg)}.sc-tile span:nth-child(2){flex:1}.sc-tile small,.sc-by small{display:block;color:var(--sub);margin-top:4px}.sc-fandom{display:flex;justify-content:space-between;align-items:center;gap:8px}.sc-by{display:flex;align-items:center;gap:9px}.sc-by>button{margin-left:auto}.sc-post h3{margin:14px 0 6px}.sc-photo{width:100%;max-height:460px;object-fit:contain;background:var(--pale);border-radius:12px;margin-top:12px}.sc-reactions{display:flex;align-items:center;gap:10px;border-top:1px solid var(--edge);margin-top:12px;padding-top:12px}.sc-comments{display:grid;gap:7px;margin-top:10px}.sc-comment{display:flex;align-items:start;gap:7px}.sc-comment p{flex:1;margin:0;padding:8px;border-radius:10px;background:var(--pale);font-size:13px}.sc-comment .sc-avatar{width:29px;height:29px;font-size:13px}.sc-comment-form{display:flex;gap:7px;margin-top:10px}.sc-comment-form input{min-width:0;flex:1}.sc-tile[hidden]{display:none}@media(max-width:600px){.sc-fields{grid-template-columns:1fr}.sc-people,.sc-fandoms{grid-template-columns:1fr}.sc-tabs button{font-size:12px}.sc-cover{height:95px}.sc-stats{gap:9px}}';
const style=document.createElement('style');style.textContent=css+'.sc-cover{background-position:center;background-size:cover;background-repeat:no-repeat}.sc-cover-editor{display:grid;gap:12px;padding:12px;border:1px solid var(--edge);border-radius:13px}.sc-cover-help{font-size:13px;color:var(--sub)}.sc-cover-editor label{display:grid;gap:5px}.sc-cover-editor output{font-size:12px;color:var(--sub)}.sc-cover-preview{height:165px;border-radius:12px;background:linear-gradient(120deg,#8d58c4,#d1a2ef,#eab9d0);background-size:cover;background-repeat:no-repeat;cursor:grab;touch-action:none;user-select:none;border:2px solid var(--edge)}.sc-cover-preview:active{cursor:grabbing}.sc-cover-preview:focus-visible{outline:3px solid var(--accent)}.sc-cover-editor input[type=range]{accent-color:var(--accent)}'+'.sc-post-toolbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}.sc-post-toolbar h3{margin:0}.sc-empty-posts{display:grid;justify-items:center;gap:10px}.sc-empty-posts p{margin:0}'+'.sc-feed-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sc-feed-head h2{margin:0}.sc-feed-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;background:var(--panel);border:1px solid var(--edge);border-radius:14px}.sc-feed-tabs button{border:0;background:transparent;padding:12px;color:var(--fg);border-radius:10px;font-weight:700;cursor:pointer}.sc-feed-tabs button.active{background:var(--pale);color:var(--accent)}';document.head.appendChild(style);
})();