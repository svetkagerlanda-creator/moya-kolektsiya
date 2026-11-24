(()=>{
const BASE='https://nihheolmwvkgtvtmfzsv.supabase.co',KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
const state={id:'',profile:null,people:[],posts:[],likes:[],comments:[],follows:[],fandoms:[],fandomFollows:[],collectionSummaries:[],collectionsExpanded:false,followList:null,returnTo:null,tab:'profile',feedMode:'all',person:null,editing:false,avatarDraft:null,posting:false,editingPostId:null,acquisitionDraft:null,loaded:false,loading:false,error:'',refresh:null};
const ACCOUNT_TABS=new Set(['profile','feed','people','fandoms','chats']);
const viewStorageKey=userId=>'collector-account-view-v1:'+userId;
function restoreAccountView(userId){
 try{
  const raw=sessionStorage.getItem(viewStorageKey(userId));
  if(!raw)return {};
  const saved=JSON.parse(raw);
  return {tab:ACCOUNT_TABS.has(saved.tab)?saved.tab:'profile',feedMode:saved.feedMode==='following'?'following':'all',person:typeof saved.person==='string'&&/^[0-9a-f-]{36}$/i.test(saved.person)?saved.person:null,returnTo:saved.returnTo==='chats'?'chats':null};
 }catch{return {}}
}
function rememberAccountView(){
 if(!state.id)return;
 try{sessionStorage.setItem(viewStorageKey(state.id),JSON.stringify({tab:state.tab,feedMode:state.feedMode,person:state.person,returnTo:state.returnTo}))}catch{}
}
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
async function directory(){
 const token=await window.CollectorCommunity?.getAccessToken?.();if(!token)throw Error('Увійди, щоб переглянути колекціонерів.');
 const response=await fetch(BASE+'/rest/v1/rpc/collector_directory',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
 const payload=await response.json().catch(()=>null);
 if(!response.ok)throw Error(payload?.message||'Не вдалося завантажити список колекціонерів');
 return Array.isArray(payload)?payload:[];
}
async function reload(){
 if(state.loading)return;state.loading=true;
 try{
  const [visiblePeople,posts,likes,comments,follows,fandoms,fandomFollows,collectionSummaries,allPeople]=await Promise.all([
   api('collector_profiles','select=id,handle,display_name,bio,avatar_path,cover_path,cover_position_x,cover_position_y,social_links,is_discoverable&limit=200'),
   api('collector_posts','select=id,user_id,title,body,photo_path,fandom_id,created_at&order=created_at.desc&limit=100'),
   api('collector_post_likes','select=post_id,user_id&limit=2500'),
   api('collector_post_comments','select=id,post_id,user_id,body,created_at&order=created_at.asc&limit=2500'),
   api('collector_follows','select=follower_id,followed_id&limit=2500'),
   api('collector_fandoms','select=id,title,slug&order=title.asc&limit=100'),
   api('collector_fandom_follows','select=user_id,fandom_id&limit=150'),
    api('collector_public_collections','select=user_id,folder_id,title,owned_count,total_count&limit=2000'),
   directory()
  ]);
  const detailById=new Map(visiblePeople.map(p=>[p.id,p]));
  const people=allPeople.map(p=>({...p,...(detailById.get(p.id)||{})}));
  Object.assign(state,{people,posts,likes,comments,follows,fandoms,fandomFollows,collectionSummaries,profile:people.find(p=>p.id===state.id),loaded:true,error:''});
   syncCollectionSummaries();
 }catch(err){state.error=String(err.message||err)}finally{state.loading=false;state.refresh?.()}
}

function localCollectionSummaries(){
 const snapshot=window.CollectorLocal?.read?.();
 if(!snapshot?.folders||!snapshot?.items)return [];
 const folders=snapshot.folders,items=snapshot.items;
 return folders.filter(f=>f.id&&f.name&&(f.kind==='series'||(f.kind!=='category'&&f.kind!=='fandom'&&f.kind!=='manufacturer'&&items.some(i=>i.folder===f.id)&&!folders.some(child=>child.parent===f.id)))).map(f=>{
  const descendants=new Set([f.id]);let changed=true;
  while(changed){changed=false;for(const child of folders)if(child.parent&&descendants.has(child.parent)&&!descendants.has(child.id)){descendants.add(child.id);changed=true}}
  const content=items.filter(i=>descendants.has(i.folder));
  return {folder_id:String(f.id),title:String(f.name).slice(0,180),total_count:content.length,owned_count:content.filter(i=>i.status==='owned'&&Number(i.quantity)>0).length};
 });
}
function collectionPanel(p){
 const own=p.id===state.id;
 const published=state.collectionSummaries.filter(c=>c.user_id===p.id);
 const local=own?localCollectionSummaries():[];
 const rows=own?local.map(c=>({...c,isPublished:published.some(x=>x.folder_id===c.folder_id)})):published.map(c=>({...c,isPublished:true}));
 const list=rows.map(c=>{
  const percent=c.total_count?Math.min(100,Math.round(c.owned_count/c.total_count*100)):0;
  return '<div class="card sc-collection"><div class="sc-collection-top"><strong>'+escape(c.title)+'</strong>'+(own?'<button class="'+(c.isPublished?'alt':'btn')+'" data-sc="collection-visibility" data-id="'+escape(c.folder_id)+'" aria-label="'+(c.isPublished?'Приховати':'Показати')+' колекцію '+escape(c.title)+'">'+(c.isPublished?'🔒 Приховати':'🌐 Показати')+'</button>':'')+'</div><div class="sc-collection-progress"><div class="bar" role="progressbar" aria-label="Заповненість '+escape(c.title)+'" aria-valuenow="'+percent+'" aria-valuemin="0" aria-valuemax="100"><div style="width:'+percent+'%"></div></div><b>'+percent+'%</b></div>'+(own?'<small class="muted">'+(c.isPublished?'Видно іншим користувачам':'Приховано від інших')+'</small>':'')+'</div>';
 }).join('');
 return '<section class="sc-collections-section"><div class="sc-collections-heading"><h3>▣ Колекції <span class="sc-collections-count">'+rows.length+'</span></h3><button type="button" class="alt sc-collections-toggle" data-sc="toggle-collections" aria-expanded="'+!!state.collectionsExpanded+'" aria-controls="scCollectionsContent">'+(state.collectionsExpanded?'▴ Згорнути':'▾ Показати колекції')+'</button></div><div id="scCollectionsContent" class="sc-collections-content"'+(!state.collectionsExpanded?' hidden':'')+'>'+(own?'<p class="muted">Тільки назви та шкали заповненості. Кожна колекція спочатку прихована — натисни «Показати», щоб дозволити іншим її бачити. Конкретні предмети залишаються приватними.</p>':'')+(rows.length?'<div class="sc-collections-grid">'+list+'</div>':'<div class="empty">'+(own?'Ще немає серій для відображення.':'Користувач поки не відкрив жодної колекції.')+'</div>')+'</div></section>';
}
async function syncCollectionSummaries(){
 if(!state.id||!state.loaded||state.syncing)return;
 const local=new Map(localCollectionSummaries().map(c=>[c.folder_id,c]));
 const published=state.collectionSummaries.filter(c=>c.user_id===state.id);
 state.syncing=true;
 try{
  for(const entry of published){
   const next=local.get(entry.folder_id);
   if(!next){await api('collector_public_collections','user_id=eq.'+state.id+'&folder_id=eq.'+encodeURIComponent(entry.folder_id),'DELETE');continue}
   if(next.title!==entry.title||next.total_count!==entry.total_count||next.owned_count!==entry.owned_count){
    await api('collector_public_collections','user_id=eq.'+state.id+'&folder_id=eq.'+encodeURIComponent(entry.folder_id),'PATCH',{title:next.title,total_count:next.total_count,owned_count:next.owned_count,updated_at:new Date().toISOString()});
   }
  }
 }catch(e){console.warn('Не вдалося оновити публічні шкали:',e)}finally{state.syncing=false}
}

function stats(id){return '<div class="sc-stats"><span><b>'+state.posts.filter(p=>p.user_id===id).length+'</b> придбань</span><button type="button" data-sc="followers" data-id="'+escape(id)+'"><b>'+state.follows.filter(f=>f.followed_id===id).length+'</b> підписників</button><button type="button" data-sc="following" data-id="'+escape(id)+'"><b>'+state.follows.filter(f=>f.follower_id===id).length+'</b> підписок</button></div>'}
function followList(){
 const kind=state.followList?.kind,profileId=state.followList?.id;
 if(!kind||!profileId)return '';
 const ids=state.follows.filter(f=>kind==='followers'?f.followed_id===profileId:f.follower_id===profileId).map(f=>kind==='followers'?f.follower_id:f.followed_id);
 const names=ids.map(person).filter(p=>p&&(p.is_discoverable||p.id===state.id));
 return '<section class="card sc-follow-list"><div class="sc-follow-head"><h3>'+(kind==='followers'?'Підписники':'Підписки')+'</h3><button class="alt" type="button" data-sc="close-follow">✕ Закрити</button></div>'+(names.length?'<div class="sc-follow-people">'+names.map(p=>'<button class="sc-follow-person" type="button" data-sc="person" data-id="'+escape(p.id)+'">'+pic(p)+'<span><b>'+escape(label(p))+'</b><small>@'+escape(p.handle)+'</small></span><span aria-hidden="true">›</span></button>').join('')+'</div>':'<p class="muted">У цьому списку поки немає доступних профілів.</p>')+'</section>';
}
function profileCard(p){
 let own=p.id===state.id,following=state.follows.some(f=>f.follower_id===state.id&&f.followed_id===p.id);
 const socials=Object.entries({instagram:'Instagram',tiktok:'TikTok',telegram:'Telegram',youtube:'YouTube',booknet:'Букнет',website:'Сайт'}).filter(([k])=>link(p.social_links?.[k])).map(([k,v])=>'<a href="'+escape(link(p.social_links[k]))+'" rel="noopener noreferrer" target="_blank">'+v+' ↗</a>').join('');
 return '<div class="card sc-profile">'+(!own?'<div class="sc-profile-return"><button class="alt" type="button" data-sc="'+(state.returnTo==='chats'?'back-chat':'back-profile')+'">← '+(state.returnTo==='chats'?'Назад до чату':'До мого профілю')+'</button></div>':'')+'<div class="sc-cover"'+(media(p.cover_path)?' style="background-image:url(&quot;'+escape(media(p.cover_path))+'&quot;);'+cropStyle(p)+'"':'')+'>'+(own&&media(p.cover_path)?'<button class="sc-banner-edit" type="button" data-sc="edit-cover">✎ Редагувати банер</button>':'')+'</div><div class="sc-person">'+pic(p,true)+'<div><h2>'+escape(label(p))+'</h2><span class="muted">@'+escape(p.handle)+'</span></div></div><p class="sc-bio">'+(p.bio?escape(p.bio):'<span class="muted">Тут поки немає опису профілю</span>')+'</p><div class="sc-links">'+socials+'</div>'+stats(p.id)+'<div class="sc-actions">'+(own?'<button class="btn" data-sc="edit">✎ Редагувати</button><button class="alt" data-sc="newpost">＋ Нове придбання</button>':'<button class="btn" data-sc="follow" data-id="'+p.id+'">'+(following?'✓ Відписатися':'＋ Стежити')+'</button><button class="alt" data-sc="message" data-id="'+p.id+'">✉ Написати</button><button class="alt" data-sc-tab="people">← Колекціонери</button>')+'</div>'+(own?'<p class="muted">'+(p.is_discoverable?'🌐 Публічний профіль':'🔒 Приватний профіль — жодні колекції не публікуються автоматично')+'</p>':'')+'</div>';
}
function editForm(p){
 const fields=Object.entries({instagram:'Instagram',tiktok:'TikTok',telegram:'Telegram',youtube:'YouTube',booknet:'Букнет',website:'Сайт'}).map(([k,n])=>'<label>'+n+'<input class="field" type="url" name="'+k+'" placeholder="https://..." value="'+escape(p.social_links?.[k]||'')+'"></label>').join('');
 return '<form class="card form" id="scEdit"><h3>Налаштування профілю</h3><label>Аватар (автоматичне стиснення до 3 МБ)<input class="field" name="avatar" type="file" accept="image/*"></label><p class="muted" id="scAvatarSelection" role="status">'+(state.avatarDraft?'✓ Вибрано: '+escape(state.avatarDraft.name):'Оберіть фото з галереї або файлів')+'</p><label>Обкладинка профілю (до 3 МБ)<input class="field" name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label><button class="btn" id="scOpenBannerEditor" type="button">✎ Редагувати кадр банера</button><div class="sc-cover-editor"><div class="sc-cover-help">Перетягни зображення, щоб вибрати видиму частину банера, або скористайся повзунками.</div><div class="sc-cover-preview" id="scCoverPreview" tabindex="0" role="img" aria-label="Попередній перегляд кадрування обкладинки" style="'+(media(p.cover_path)?'background-image:url(&quot;'+escape(media(p.cover_path))+'&quot;);':'')+cropStyle(p)+'"></div><label>Горизонтально <output id="scCropXLabel">'+cropNumber(p.cover_position_x)+'%</output><input class="field" type="range" name="cover_position_x" min="0" max="100" step="1" value="'+cropNumber(p.cover_position_x)+'"></label><label>Вертикально <output id="scCropYLabel">'+cropNumber(p.cover_position_y)+'%</output><input class="field" type="range" name="cover_position_y" min="0" max="100" step="1" value="'+cropNumber(p.cover_position_y)+'"></label><button class="alt" type="button" id="scCropCenter">Центрувати зображення</button></div><label class="sc-check"><input type="checkbox" name="remove_cover"> Повернути стандартний градієнт</label><label>Ім’я<input class="field" name="display_name" maxlength="80" value="'+escape(p.display_name)+'"></label><label>Про себе<textarea class="field" name="bio" maxlength="1200" rows="4">'+escape(p.bio)+'</textarea></label><div class="sc-fields">'+fields+'</div><label class="sc-check"><input type="checkbox" name="is_discoverable" '+(p.is_discoverable?'checked':'')+'> Мій профіль публічний</label><div class="muted">Відкритий профіль дозволяє підписуватися на тебе і бачити добровільно опубліковані придбання.</div><div class="sc-actions"><button class="btn" type="submit">Зберегти</button><button class="alt" data-sc="cancel-edit" type="button">Скасувати</button></div></form>';
}
function createForm(){
 const draft=state.acquisitionDraft;
 const options=[
  draft?.catalogPhotoSrc?'<option value="catalog">🏭 Заводське фото з каталогу</option>':'',
  draft?.personalPhotoSrc?'<option value="personal">📷 Моє фото</option>':'',
  '<option value="none">Без фотографії</option>'
 ].filter(Boolean).join('');
 const selected=draft?.photoChoice||'none';
 const src=selected==='catalog'?draft?.catalogPhotoSrc:selected==='personal'?draft?.personalPhotoSrc:null;
 const preview='<div class="sc-acquisition-preview"><img id="scDraftPhotoPreview"'+(src?' src="'+escape(src)+'"':' hidden')+' alt="Фото предмета для допису"><p id="scDraftPhotoHint">'+(src?'Буде опубліковано вибране фото.':'Фото не вибране. Можеш додати своє або опублікувати без нього.')+'</p></div>';
 return '<form class="card form" id="scPost"><h3>Нове придбання 📦</h3><p class="muted">Публікація з’явиться тільки після натискання «Опублікувати». Фото у загальному каталозі не зміниться.</p><label>Назва<input class="field" name="title" minlength="2" maxlength="160" required value="'+escape(draft?.title||'')+'" placeholder="Моя нова фігурка"></label><label>Опис<textarea class="field" name="body" maxlength="2000" rows="3">'+escape(draft?.body||'')+'</textarea></label><label>Фандом<select name="fandom_id" class="field"><option value="">Без фандому</option>'+state.fandoms.map(f=>'<option value="'+f.id+'">'+escape(f.title)+'</option>').join('')+'</select></label><label>Яке фото використати?<select name="photo_source" class="field">'+options+'</select></label><label>Або завантажити нове фото для допису<input class="field" name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>'+preview+'<div class="sc-actions"><button class="btn" type="submit">Опублікувати</button><button class="alt" type="button" data-sc="cancel-post">Скасувати</button></div></form>';
}
function editPostForm(p){
 const f=p.fandom_id||'';
 return '<form class="sc-edit-post card form" data-edit-post="'+escape(p.id)+'"><h3>✎ Редагувати публікацію</h3>'
 +'<label>Назва<input class="field" name="title" minlength="2" maxlength="160" required value="'+escape(p.title)+'"></label>'
 +'<label>Опис<textarea class="field" name="body" maxlength="2000" rows="3">'+escape(p.body||'')+'</textarea></label>'
 +'<label>Фандом<select class="field" name="fandom_id"><option value="">Без фандому</option>'
 +state.fandoms.map(x=>'<option value="'+escape(x.id)+'"'+(x.id===f?' selected':'')+'>'+escape(x.title)+'</option>').join('')+'</select></label>'
 +(p.photo_path?'<div class="sc-post-photo-caption">Поточне фото залишається, якщо не обрати нове.</div>':'')
 +'<label>Замінити фото (необов’язково)<input class="field" name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>'
 +'<div class="sc-actions"><button class="btn" type="submit">Зберегти зміни</button><button class="alt" type="button" data-sc="cancel-edit-post">Скасувати</button></div></form>';
}
function postCard(p){
 const author=person(p.user_id),liked=state.likes.some(l=>l.user_id===state.id&&l.post_id===p.id),cs=state.comments.filter(c=>c.post_id===p.id),f=state.fandoms.find(f=>f.id===p.fandom_id),photo=media(p.photo_path);
 return '<article class="card sc-post"><div class="sc-by">'+pic(author)+'<div><b>'+escape(label(author))+'</b><small>@'+escape(author?.handle||'')+' · '+new Date(p.created_at).toLocaleDateString('uk-UA')+'</small></div>'+(p.user_id===state.id?'<details class="sc-post-menu"><summary title="Дії з публікацією" aria-label="Дії з публікацією">⋯</summary><div class="sc-post-menu-actions"><button type="button" data-sc="edit-post" data-id="'+escape(p.id)+'">✎ Редагувати</button><button type="button" class="sc-post-delete" data-sc="delete-post" data-id="'+escape(p.id)+'">🗑 Видалити</button></div></details>':'')+'</div>'+(state.editingPostId===p.id?editPostForm(p):'')+'<h3>'+escape(p.title)+'</h3>'+(p.body?'<p class="sc-bio">'+escape(p.body)+'</p>':'')+(f?'<span class="tag">'+escape(f.title)+'</span>':'')+(photo?'<img class="sc-photo" src="'+escape(photo)+'" loading="lazy" alt="Фото придбання">':'')+'<div class="sc-reactions"><button class="alt" data-sc="like" data-id="'+p.id+'">'+(liked?'💗':'♡')+' '+state.likes.filter(l=>l.post_id===p.id).length+'</button><span>💬 '+cs.length+'</span></div><div class="sc-comments">'+cs.map(c=>'<div class="sc-comment">'+pic(person(c.user_id))+'<p><b>'+escape(label(person(c.user_id)))+'</b> '+escape(c.body)+'</p>'+(c.user_id===state.id?'<button class="alt" data-sc="delete-comment" data-id="'+c.id+'">✕</button>':'')+'</div>').join('')+'</div><form class="sc-comment-form" data-post="'+p.id+'"><input class="field" name="body" maxlength="600" required placeholder="Коментар..."><button class="btn">➤</button></form></article>';
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
 if(state.id!==id)Object.assign(state,{id,profile:null,people:[],posts:[],likes:[],comments:[],follows:[],fandoms:[],fandomFollows:[],collectionSummaries:[],tab:'profile',feedMode:'all',person:null,loaded:false,loading:false,editing:false,avatarDraft:null,editingPostId:null,posting:!!state.acquisitionDraft,...restoreAccountView(id)});
 if(state.person&&state.loaded&&!state.people.some(p=>p.id===state.person))state.person=null;
 rememberAccountView();
 const p=state.person?person(state.person):state.profile;
 window.CollectorChats?.setup(id,state.people);
 const unreadDm=window.CollectorChats?.unreadCount?.()||0;
 return '<div class="sc-wrap"><nav class="sc-tabs">'+[['profile','Профіль'],['feed','Стрічка'],['people','Люди'],['fandoms','Фандоми'],['chats','Чати']].map(([id,t])=>'<button class="'+(state.tab===id?'active':'')+'" type="button" data-sc-tab="'+id+'">'+t+(id==='chats'&&unreadDm?'<span class="sc-chat-count" aria-label="Непрочитаних повідомлень: '+unreadDm+'">'+(unreadDm>99?'99+':unreadDm)+'</span>':'')+'</button>').join('')+'</nav>'+(state.error?'<div class="banner">'+escape(state.error)+'</div>':'')+(!state.loaded?'<div class="empty">'+(state.error?'Не вдалося завантажити профіль. Перевір інтернет і повтори спробу. <button class="btn" data-sc="refresh">↻ Повторити</button>':'Завантаження...')+'</div>':state.tab==='profile'?(p?(p.id!==state.id&&!p.is_discoverable?'<div class="card sc-private-profile"><div class="sc-private-back"><button type="button" class="alt" data-sc="back-profile">← До мого профілю</button></div><div class="sc-private-person">'+pic(p,true)+'<div class="sc-private-identity"><h2>'+escape(label(p))+'</h2><span class="muted">@'+escape(p.handle)+'</span></div></div><p class="sc-private-notice muted">🔒 Профіль приватний. Публікації та колекції доступні лише для публічних профілів.</p></div>':profileCard(p)+(state.editing&&p.id===state.id?editForm(p):'')+(state.followList?followList():collectionPanel(p))+(state.posting&&p.id===state.id?createForm():'')+(p.id===state.id?postToolbar():'')+timeline(state.posts.filter(x=>x.user_id===p.id),p.id===state.id)):'<div class="empty">Не вдалося завантажити профіль</div>'):state.tab==='feed'?feed():state.tab==='chats'?(window.CollectorChats?.render()||'<div class="empty">Модуль чатів не завантажився</div>'):state.tab==='people'?'<h2>Колекціонери</h2><p class="muted">Показані всі зареєстровані користувачі. Публікації та колекції можна переглядати лише у відкритих профілях.</p><input id="scSearch" class="field" placeholder="Знайти нікнейм..."><div class="sc-people">'+state.people.slice().sort((a,b)=>(a.id===state.id?-1:b.id===state.id?1:label(a).localeCompare(label(b),'uk'))).map(p=>'<button class="card sc-tile" data-sc="person" data-id="'+p.id+'">'+pic(p)+'<span>'+escape(label(p))+'<small>@'+escape(p.handle)+(p.id===state.id?' · Це ви':!p.is_discoverable?' · 🔒 Приватний':'')+'</small></span> ›</button>').join('')+'</div>':'<h2>Підписки на фандоми</h2><div class="sc-fandoms">'+state.fandoms.map(f=>{let on=state.fandomFollows.some(x=>x.user_id===state.id&&x.fandom_id===f.id);return '<div class="card sc-fandom"><span>✨ '+escape(f.title)+'</span><button class="'+(on?'alt':'btn')+'" data-sc="fandom" data-id="'+f.id+'">'+(on?'✓ Стежу':'＋ Стежити')+'</button></div>'}).join('')+'</div>')+'</div>';
}
async function fileFromCardPhoto(src){
 if(typeof src!=='string'||!src)return null;
 const isLocal=/^data:image\/(?:jpeg|png|webp);base64,/i.test(src);
 if(!isLocal&&!/^https:\/\//i.test(src))throw Error('Не вдалося використати фото з картки. Завантаж інше фото.');
 let response;
 try{response=await fetch(src,{mode:'cors',credentials:'omit',cache:'no-store'});}
 catch{throw Error('Фото з картки недоступне для перенесення в допис. Обери фотографію з галереї у формі публікації.')}
 if(!response.ok)throw Error('Не вдалося завантажити фото з картки. Обери файл вручну.');
 let blob=await response.blob();
 if(!['image/jpeg','image/png','image/webp'].includes(blob.type))throw Error('Фото з картки має бути JPG, PNG або WEBP. Обери іншу фотографію.');
 if(!blob.size)throw Error('Фото з картки порожнє. Обери інший файл.');
 if(blob.size>3145728){
  // A card may allow a larger original photo than the public-post upload limit.
  // Compress in memory only; the user's original card photo remains untouched.
  const sourceUrl=URL.createObjectURL(blob);
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Не вдалося обробити фото'));img.src=sourceUrl});
   const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   for(const quality of [.82,.68,.5]){
    const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(result?.size&&result.size<=3145728){blob=result;break}
   }
  }finally{URL.revokeObjectURL(sourceUrl)}
 }
 if(blob.size>3145728)throw Error('Фото з картки завелике для публікації. Обери інше фото.');
 return new File([blob],'acquisition.'+(blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'),{type:blob.type});
}
async function prepareAvatar(file){
 if(!file)return null;
 const allowed=['image/jpeg','image/png','image/webp'];
 if(allowed.includes(file.type)&&file.size<=3145728)return file;
 if(!file.type.startsWith('image/'))throw Error('Аватар має бути зображенням JPG, PNG або WEBP.');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{
   const image=new Image();
   image.onload=()=>resolve(image);
   image.onerror=()=>reject(Error('Браузер не зміг відкрити фото. Спробуй JPG або PNG.'));
   image.src=url;
  });
  const maxSize=1024,ratio=Math.min(1,maxSize/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Не вдалося підготувати аватар у цьому браузері.');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  for(const quality of [.86,.74,.6,.45]){
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob?.size&&blob.size<=3145728)return new File([blob],'avatar.jpg',{type:'image/jpeg'});
  }
  throw Error('Фото завелике навіть після стиснення. Спробуй менше зображення.');
 }finally{URL.revokeObjectURL(url)}
}
async function upload(file,type){
 if(!file)return null;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3145728)throw Error('Фото має бути JPG, PNG або WEBP до 3 МБ.');
 const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
 const name=state.id+'/'+type+'/'+crypto.randomUUID()+'.'+ext;
 const token=await window.CollectorCommunity.getAccessToken();if(!token)throw Error('Увійди до акаунта повторно.');
 const r=await fetch(BASE+'/storage/v1/object/collector-media/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':file.type},body:file});
 if(!r.ok){
   const error=await r.json().catch(()=>({}));
   const detail=error.message||error.error||error.error_description||'Помилка сервера '+r.status;
   throw Error('Не вдалося завантажити зображення: '+detail);
  }
 return name;
}
async function action(kind,id){
 try{
 if(kind==='refresh')await reload();
 else if(kind==='toggle-collections'){state.collectionsExpanded=!state.collectionsExpanded;state.refresh?.();return;}
 else if(kind==='edit'){
  state.person=null;state.tab='profile';state.editing=true;state.error='';
  state.refresh?.();
  requestAnimationFrame(()=>{
   const form=document.getElementById('scEdit');
   if(!form)return;
   form.scrollIntoView({behavior:'smooth',block:'start'});
   form.querySelector('[name="display_name"]')?.focus({preventScroll:true});
  });
  return;
 }
  else if(kind==='collection-visibility'){
   if(state.person&&state.person!==state.id)throw Error('Керувати можна лише своїми колекціями.');
   const entry=localCollectionSummaries().find(c=>c.folder_id===id);
   if(!entry)throw Error('Колекцію не знайдено.');
   const published=state.collectionSummaries.some(c=>c.user_id===state.id&&c.folder_id===id);
   if(published){await api('collector_public_collections','user_id=eq.'+state.id+'&folder_id=eq.'+encodeURIComponent(id),'DELETE')}
   else{if(!state.profile?.is_discoverable)throw Error('Спочатку увімкни публічний профіль у налаштуваннях.');await api('collector_public_collections','','POST',{user_id:state.id,...entry})}
   await reload();return;
  }
 else if(kind==='edit-cover'){state.editing=true;state.person=null;state.refresh?.();setTimeout(()=>window.CollectorBannerCrop?.open(null),0);return;}
 else if(kind==='cancel-edit'){state.editing=false;state.avatarDraft=null;}
 else if(kind==='newpost'){state.tab='profile';state.person=null;if(!state.profile?.is_discoverable){state.editing=true;throw Error('Для публікації спочатку увімкни публічний профіль і збережи налаштування. Предмети колекції не стануть публічними.')}state.posting=true}
 else if(kind==='cancel-post'){state.posting=false;state.acquisitionDraft=null}
 else if(kind==='edit-post'){const post=state.posts.find(p=>p.id===id&&p.user_id===state.id);if(!post)throw Error('Редагувати можна лише власну публікацію.');state.editingPostId=id}
 else if(kind==='cancel-edit-post')state.editingPostId=null
 else if(kind==='person'){state.person=id===state.id?null:id;state.tab='profile';state.followList=null}
  else if(kind==='followers'||kind==='following'){state.followList={id,kind}}
  else if(kind==='close-follow'){state.followList=null}
  else if(kind==='back-chat'){state.person=null;state.tab='chats';state.followList=null}
  else if(kind==='back-profile'){state.person=null;state.tab='profile';state.followList=null}
 else if(kind==='message'){state.tab='chats';state.person=null;window.CollectorChats?.setup(state.id,state.people);window.CollectorChats?.start(id)}
 else if(kind==='follow'){let on=state.follows.some(f=>f.follower_id===state.id&&f.followed_id===id);await api('collector_follows',on?'follower_id=eq.'+state.id+'&followed_id=eq.'+id:'',on?'DELETE':'POST',on?undefined:{follower_id:state.id,followed_id:id});await reload()}
 else if(kind==='fandom'){let on=state.fandomFollows.some(f=>f.user_id===state.id&&f.fandom_id===id);await api('collector_fandom_follows',on?'user_id=eq.'+state.id+'&fandom_id=eq.'+id:'',on?'DELETE':'POST',on?undefined:{user_id:state.id,fandom_id:id});await reload()}
 else if(kind==='like'){let on=state.likes.some(l=>l.user_id===state.id&&l.post_id===id);await api('collector_post_likes',on?'post_id=eq.'+id+'&user_id=eq.'+state.id:'',on?'DELETE':'POST',on?undefined:{post_id:id,user_id:state.id});await reload()}
 else if(kind==='delete-post'){const post=state.posts.find(p=>p.id===id&&p.user_id===state.id);if(!post)throw Error('Видаляти можна лише власну публікацію.');if(!confirm('Видалити допис без можливості відновлення?'))return;await api('collector_posts','id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(state.id),'DELETE');if(state.editingPostId===id)state.editingPostId=null;await reload()}
 else if(kind==='delete-comment'){await api('collector_post_comments','id=eq.'+id+'&user_id=eq.'+state.id,'DELETE');await reload()}
 state.refresh?.();
 }catch(err){fail(err)}
}
function attach(session,refresh){
 state.refresh=refresh;
 window.CollectorChats?.connect?.(refresh);if(!state.loaded){if(!state.loading&&!state.error)reload();else if(state.error)document.querySelector('[data-sc="refresh"]')?.addEventListener('click',()=>{state.error='';reload()});return}
 document.querySelectorAll('[data-sc-tab]').forEach(el=>el.onclick=()=>{state.tab=el.dataset.scTab;state.person=null;state.followList=null;state.returnTo=null;state.editing=false;state.posting=false;if(state.tab!=='chats')window.CollectorChats?.deactivate();refresh()});
 if(state.tab==='chats')window.CollectorChats?.attach(refresh);else window.CollectorChats?.deactivate();
 document.querySelectorAll('[data-sc-feed]').forEach(el=>el.onclick=()=>{state.feedMode=el.dataset.scFeed==='following'?'following':'all';refresh()});
 document.querySelectorAll('[data-sc]').forEach(el=>el.onclick=()=>action(el.dataset.sc,el.dataset.id));
 document.getElementById('scSearch')?.addEventListener('input',ev=>{let q=ev.target.value.toLocaleLowerCase();document.querySelectorAll('.sc-tile').forEach(el=>el.hidden=!el.textContent.toLocaleLowerCase().includes(q))});
 const edit=document.getElementById('scEdit');
 if(edit){
  document.getElementById('scOpenBannerEditor')?.addEventListener('click',()=>{if(window.CollectorBannerCrop?.open)window.CollectorBannerCrop.open(edit.elements.cover.files?.[0]||null);else alert('Редактор ще не завантажився. Онови сторінку.')});
  const f=edit.elements,preview=document.getElementById('scCoverPreview');
   const avatarNotice=document.getElementById('scAvatarSelection');
   f.avatar.addEventListener('change',()=>{
    const selected=f.avatar.files?.[0]||null;
    state.avatarDraft=selected;
    if(avatarNotice)avatarNotice.textContent=selected?'✓ Вибрано: '+selected.name:'Фото не вибрано';
   });
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
  const avatarFile=f.avatar.files?.[0]||state.avatarDraft;
   if(avatarFile)values.avatar_path=await upload(await prepareAvatar(avatarFile),'avatars');
  values.cover_position_x=cropNumber(f.cover_position_x.value);
  values.cover_position_y=cropNumber(f.cover_position_y.value);
  if(f.cover.files[0])values.cover_path=await upload(f.cover.files[0],'covers');
  else if(f.remove_cover.checked)values.cover_path=null;
  const saved=await api('collector_profiles','id=eq.'+state.id,'PATCH',values);
   // A missing profile or failed RLS update must not be mistaken for a successful save.
   const confirmed=await api('collector_profiles','select=id,avatar_path,cover_path&id=eq.'+state.id);
   if(!Array.isArray(confirmed)||confirmed.length!==1)throw Error('Профіль не знайдено після збереження. Онови сторінку й увійди повторно.');
   if(values.avatar_path&&confirmed[0].avatar_path!==values.avatar_path)throw Error('Аватар завантажився, але не зберігся в профілі. Спробуй повторити.');
   state.editing=false;state.avatarDraft=null;await reload();
 }catch(err){fail(err)}finally{btn.disabled=false}};
 const post=document.getElementById('scPost');
 if(post){
  const input=post.elements.photo,selector=post.elements.photo_source,preview=post.querySelector('#scDraftPhotoPreview'),hint=post.querySelector('#scDraftPhotoHint');
  if(state.acquisitionDraft?.photoChoice)selector.value=state.acquisitionDraft.photoChoice;
  let previewUrl=null;
  const refreshPhotoPreview=()=>{
   if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}
   const file=input.files?.[0];
   const draft=state.acquisitionDraft;
   const src=file?(previewUrl=URL.createObjectURL(file)):(selector.value==='catalog'?draft?.catalogPhotoSrc:selector.value==='personal'?draft?.personalPhotoSrc:null);
   if(src){preview.src=src;preview.hidden=false;hint.textContent=file?'Для публікації буде використано щойно вибраний файл.':'Для публікації буде використано '+(selector.value==='catalog'?'заводське фото з каталогу.':'власне фото з колекції.')}
   else{preview.hidden=true;preview.removeAttribute('src');hint.textContent='Допис буде без фотографії.'}
  };
  input.onchange=refreshPhotoPreview;
  selector.onchange=()=>{if(state.acquisitionDraft)state.acquisitionDraft.photoChoice=selector.value;refreshPhotoPreview()};
  refreshPhotoPreview();
 }
 if(post)post.onsubmit=async ev=>{ev.preventDefault();let btn=post.querySelector('button[type=submit]');btn.disabled=true;try{
  const f=post.elements,selected=f.photo.files[0]||null;
  const choice=f.photo_source.value;
  const source=choice==='catalog'?state.acquisitionDraft?.catalogPhotoSrc:choice==='personal'?state.acquisitionDraft?.personalPhotoSrc:null;
  const fromCard=!selected&&source?await fileFromCardPhoto(source):null;
  const photo_path=await upload(selected||fromCard,'posts');
  await api('collector_posts','','POST',{user_id:state.id,title:f.title.value.trim(),body:f.body.value.trim(),fandom_id:f.fandom_id.value||null,photo_path});state.posting=false;state.acquisitionDraft=null;await reload();
 }catch(err){fail(err)}finally{btn.disabled=false}};
 document.querySelectorAll('.sc-edit-post').forEach(form=>form.onsubmit=async ev=>{
  ev.preventDefault();
  const post=state.posts.find(p=>p.id===form.dataset.editPost&&p.user_id===state.id);
  if(!post)return fail('Редагувати можна лише власну публікацію.');
  const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
  try{
   const f=form.elements;
   const title=f.title.value.trim(),body=f.body.value.trim();
   if(title.length<2||title.length>160||body.length>2000)throw Error('Перевір довжину назви та опису.');
   const changes={title,body,fandom_id:f.fandom_id.value||null};
   if(f.photo.files[0])changes.photo_path=await upload(f.photo.files[0],'posts');
   await api('collector_posts','id=eq.'+encodeURIComponent(post.id)+'&user_id=eq.'+encodeURIComponent(state.id),'PATCH',changes);
   state.editingPostId=null;
   await reload();
  }catch(err){fail(err)}
  finally{if(btn.isConnected)btn.disabled=false}
 });
 document.querySelectorAll('.sc-comment-form').forEach(form=>form.onsubmit=async ev=>{ev.preventDefault();let b=form.querySelector('button');b.disabled=true;try{
  await api('collector_post_comments','','POST',{post_id:form.dataset.post,user_id:state.id,body:form.elements.body.value.trim()});await reload()
 }catch(err){fail(err)}finally{b.disabled=false}});
}
function prepareAcquisition(item){
 if(!item||!item.name)return false;
 const personal=window.CollectorPhotos?.cover(item)||window.CollectorPhotos?.pics(item)?.[0]?.src||(/^data:image\/(?:jpeg|png|webp);base64,/i.test(item.photo||'')?item.photo:null);
 const catalog=/^https:\/\//i.test(item.photo||'')?item.photo:null;
 const choice=window.CollectorPhotos?.cover(item)?'personal':catalog?'catalog':personal?'personal':'none';
 state.acquisitionDraft={title:String(item.name).slice(0,160),body:'',catalogPhotoSrc:catalog,personalPhotoSrc:personal,photoChoice:choice};
 state.person=null;state.tab='profile';state.posting=true;state.error='';
 if(!window.CollectorCommunity?.getSession?.())return true;
 if(state.profile&&!state.profile.is_discoverable)state.editing=true;
 return true;
}
function openProfile(id,source='chats'){
 if(!id||id===state.id){state.person=null;state.tab='profile';state.returnTo=null;state.refresh?.();return}
 const p=person(id);
 if(!p){state.error='Профіль цього користувача недоступний.';state.refresh?.();return}
 state.person=id;state.tab='profile';state.followList=null;state.returnTo=source;state.editing=false;state.posting=false;
 window.CollectorChats?.deactivate?.();state.refresh?.();
}
window.CollectorSocial={render,attach,openProfile,prepareAcquisition,showLogoutOnProfile:session=>{const user=getId(session);return !!user&&user===state.id&&state.tab==='profile'&&!state.person},syncCollections:syncCollectionSummaries,reset:()=>{state.id='';state.loaded=false;window.CollectorChats?.clean()}};
const css='.sc-acquisition-preview{display:grid;gap:8px;border:1px solid var(--edge);padding:10px;border-radius:12px;background:var(--pale)}.sc-acquisition-preview img{display:block;width:100%;max-height:260px;object-fit:contain;border-radius:10px}.sc-acquisition-preview img[hidden]{display:none}.sc-acquisition-preview p{font-size:13px;color:var(--sub);margin:0}.sc-post-menu{margin-left:auto;position:relative;flex-shrink:0}.sc-post-menu summary{display:flex;align-items:center;justify-content:center;min-width:40px;height:38px;border:1px solid var(--edge);border-radius:11px;cursor:pointer;list-style:none;font-size:24px;background:var(--panel);color:var(--fg)}.sc-post-menu summary::-webkit-details-marker{display:none}.sc-post-menu-actions{position:absolute;right:0;top:calc(100% + 4px);z-index:8;min-width:166px;border:1px solid var(--edge);border-radius:12px;background:var(--panel);padding:6px;box-shadow:0 12px 26px #0002;display:grid;gap:3px}.sc-post-menu-actions button{display:block;width:100%;border:0;border-radius:8px;background:transparent;color:var(--fg);padding:11px 13px;text-align:left;cursor:pointer;font:inherit;white-space:nowrap}.sc-post-menu-actions button:hover{background:var(--pale)}.sc-post-menu-actions .sc-post-delete{color:#c43b52}.sc-edit-post{margin:15px 0}.sc-post-photo-caption{font-size:13px;color:var(--sub)}.sc-wrap{display:grid;gap:16px}.sc-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:5px;border:1px solid var(--edge);border-radius:16px;background:var(--panel)}.sc-tabs button{border:0;border-radius:10px;background:transparent;color:var(--fg);padding:12px 3px;font-size:13px;cursor:pointer}.sc-tabs button.active{color:var(--accent);background:var(--pale);font-weight:750}.sc-profile{padding:12px}.sc-cover{height:clamp(145px,24vw,260px);border-radius:12px;background:linear-gradient(120deg,#8d58c4,#d1a2ef,#eab9d0)}.sc-person{display:flex;align-items:end;gap:10px;margin:-28px 10px 0;position:relative}.sc-person h2{margin:0}.sc-avatar{width:40px;height:40px;border-radius:50%;background:var(--pale);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex-shrink:0;overflow:hidden;border:2px solid var(--panel)}.sc-avatar img{width:100%;height:100%;object-fit:cover}.sc-avatar.large{width:78px;height:78px;font-size:35px;border:4px solid var(--panel)}.sc-bio{white-space:pre-wrap;overflow-wrap:anywhere}.sc-profile>.sc-bio,.sc-profile>.muted{margin:15px 10px}.sc-links{display:flex;flex-wrap:wrap;gap:8px;margin:10px}.sc-links a{font-size:13px;text-decoration:none;background:var(--pale);padding:6px 10px;border-radius:25px;color:var(--accent)}.sc-stats{display:flex;gap:15px;flex-wrap:wrap;margin:12px 10px;font-size:13px;color:var(--sub)}.sc-stats b{color:var(--fg)}.sc-actions{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0}.sc-profile>.sc-actions{margin:12px 10px}.sc-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sc-check{display:flex;gap:8px;align-items:center}.sc-timeline,.sc-people,.sc-fandoms{display:grid;gap:12px}.sc-people,.sc-fandoms{grid-template-columns:repeat(auto-fill,minmax(235px,1fr))}.sc-tile{display:flex;align-items:center;gap:10px;text-align:left;color:var(--fg)}.sc-tile span:nth-child(2){flex:1}.sc-tile small,.sc-by small{display:block;color:var(--sub);margin-top:4px}.sc-fandom{display:flex;justify-content:space-between;align-items:center;gap:8px}.sc-by{display:flex;align-items:center;gap:9px}.sc-by>button{margin-left:auto}.sc-post h3{margin:14px 0 6px}.sc-photo{width:100%;max-height:460px;object-fit:contain;background:var(--pale);border-radius:12px;margin-top:12px}.sc-reactions{display:flex;align-items:center;gap:10px;border-top:1px solid var(--edge);margin-top:12px;padding-top:12px}.sc-comments{display:grid;gap:7px;margin-top:10px}.sc-comment{display:flex;align-items:start;gap:7px}.sc-comment p{flex:1;margin:0;padding:8px;border-radius:10px;background:var(--pale);font-size:13px}.sc-comment .sc-avatar{width:29px;height:29px;font-size:13px}.sc-comment-form{display:flex;gap:7px;margin-top:10px}.sc-comment-form input{min-width:0;flex:1}.sc-tile[hidden]{display:none}@media(max-width:600px){.sc-cover{height:155px}.sc-fields{grid-template-columns:1fr}.sc-people,.sc-fandoms{grid-template-columns:1fr}.sc-tabs button{font-size:12px}.sc-cover{height:95px}.sc-stats{gap:9px}}';
const privateProfileCss='.sc-private-profile{display:flex;flex-direction:column;align-items:stretch;gap:18px;padding:20px;min-height:190px}.sc-private-back{display:flex;justify-content:flex-start}.sc-private-back .alt{max-width:100%;white-space:normal;text-align:left}.sc-private-person{display:flex;align-items:center;gap:16px;min-width:0}.sc-private-person .sc-avatar.large{flex:0 0 78px}.sc-private-identity{min-width:0;overflow-wrap:anywhere}.sc-private-identity h2{margin:0 0 4px;font-size:21px}.sc-private-notice{margin:0;line-height:1.6}@media(max-width:600px){.sc-private-profile{padding:15px;gap:14px}.sc-private-person{gap:12px}.sc-private-person .sc-avatar.large{width:68px;height:68px;flex-basis:68px}.sc-private-identity h2{font-size:19px}}';
const style=document.createElement('style');style.textContent=".sc-collections-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.sc-collections-heading h3{margin:0}.sc-collections-count{display:inline-flex;align-items:center;justify-content:center;min-width:25px;padding:2px 7px;border-radius:999px;background:var(--pale);color:var(--accent);font-size:12px}.sc-collections-content{display:grid;gap:12px}.sc-collections-toggle{display:none}@media(max-width:700px){.sc-collections-toggle{display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}.sc-collections-content[hidden]{display:none}.sc-collections-section{border:1px solid var(--edge);border-radius:14px;padding:12px;background:var(--panel)}.sc-collections-grid{grid-template-columns:minmax(0,1fr)}}@media(min-width:701px){.sc-collections-content[hidden]{display:grid}}"+privateProfileCss+'.sc-stats button{font:inherit;background:none;border:0;padding:0;color:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.sc-stats button:hover{color:var(--accent)}.sc-follow-list{display:grid;gap:12px}.sc-follow-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sc-follow-head h3{margin:0}.sc-follow-people{display:grid;gap:5px}.sc-follow-person{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--edge);color:var(--fg);padding:9px 12px;border-radius:11px;cursor:pointer;text-align:left}.sc-follow-person span:nth-child(2){flex:1}.sc-follow-person small{display:block;color:var(--sub)}.sc-profile-return{padding:4px 0 10px}'+'.sc-collections-section{display:grid;gap:12px}.sc-collections-section h3{margin:2px 0}.sc-collections-section>.muted{margin:0}.sc-collections-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:12px}.sc-collection{display:grid;gap:10px}.sc-collection-top{display:flex;align-items:center;justify-content:space-between;gap:9px}.sc-collection-top strong{overflow-wrap:anywhere}.sc-collection-top button{flex-shrink:0;font-size:12px;padding:8px 10px}.sc-collection-progress{display:flex;align-items:center;gap:10px}.sc-collection-progress .bar{flex:1;margin:0}.sc-collection-progress b{min-width:42px;text-align:right}.sc-collection small{font-size:12px}'+css+'.sc-chat-count{display:inline-flex;justify-content:center;align-items:center;vertical-align:middle;margin-left:5px;min-width:20px;height:20px;padding:0 5px;border-radius:12px;background:#d92d59;color:white;font-weight:800;font-size:11px}.sc-cover{position:relative}.sc-banner-edit{position:absolute;right:12px;bottom:10px;padding:9px 12px;border:1px solid white;background:#fffef0;color:#482256;border-radius:12px;cursor:pointer;font-weight:700}.sc-cover{background-position:center;background-size:cover;background-repeat:no-repeat}.sc-cover-editor{display:grid;gap:12px;padding:12px;border:1px solid var(--edge);border-radius:13px}.sc-cover-help{font-size:13px;color:var(--sub)}.sc-cover-editor label{display:grid;gap:5px}.sc-cover-editor output{font-size:12px;color:var(--sub)}.sc-cover-preview{height:165px;border-radius:12px;background:linear-gradient(120deg,#8d58c4,#d1a2ef,#eab9d0);background-size:cover;background-repeat:no-repeat;cursor:grab;touch-action:none;user-select:none;border:2px solid var(--edge)}.sc-cover-preview:active{cursor:grabbing}.sc-cover-preview:focus-visible{outline:3px solid var(--accent)}.sc-cover-editor input[type=range]{accent-color:var(--accent)}'+'.sc-post-toolbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}.sc-post-toolbar h3{margin:0}.sc-empty-posts{display:grid;justify-items:center;gap:10px}.sc-empty-posts p{margin:0}'+'.sc-feed-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sc-feed-head h2{margin:0}.sc-feed-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;background:var(--panel);border:1px solid var(--edge);border-radius:14px}.sc-feed-tabs button{border:0;background:transparent;padding:12px;color:var(--fg);border-radius:10px;font-weight:700;cursor:pointer}.sc-feed-tabs button.active{background:var(--pale);color:var(--accent)}';document.head.appendChild(style);
})();