/* Public dated project updates from verified GitHub commit history. */
(()=>{
'use strict';
const API='https://api.github.com/repos/svetkagerlanda-creator/moya-kolektsiya/commits';
const st={tab:'catalog',filter:'all',search:'',rows:[],page:0,more:true,loading:false,error:'',lastLoaded:0,refresh:null};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const words={series:/\b(series|collection|lineup|lines|assortment|set|sets|figures|figurines|dolls|variants|characters|fandom|catalog|catalogue|checklist|item|mini|blind.box|pop!|lego|bratz|winx|monster high|lps|harry potter|52toys|funko|ty |kayou|barcode|upc|ean|photo|image|picture|sku)\b/i,
photos:/\b(photo|photos|image|images|thumbnail|thumbnails|picture|pictures|gallery|covers?|visual|crop|photograph)\b/i,
barcodes:/\b(barcode|barcodes|upc|ean|gtin|sku|scan)\b/i,
mechanics:/\b(fix|feat|feature|ui:|refactor|profile|avatar|login|logout|auth|account|chats?|messages?|moderation|navigate|navigation|pwa|layout|button|wishlist|sharing|share|search|keyboard|picker|upload|status|sync|cloud|permissions?|privacy|notification|update|improve|page|tabs?|requests?|requests|route|settings)\b/i};
function category(message){
 const m=message.toLowerCase();
 if(/^(chore|release|bump|deploy|build|docs|test)(\b|\()/i.test(m)&&!/\b(add|fill|expand|complete|catalog)\b/i.test(m))return null;
 const explicit=/^(?:catalog:|data:)/i.test(m);
 if(/\b(?:chat|chats|profile|avatar|account|login|logout|moderation|moderator|request|requests|navigation|sidebar|menu|button|layout|picker|upload|private user|settings|tabs?)\b/i.test(message)&&!explicit)return {section:'features',kind:'feature',label:'Функції та виправлення'};
 if(explicit||words.series.test(message)){
  if(words.photos.test(message))return {section:'catalog',kind:'photo',label:'Фотографії'};
  if(words.barcodes.test(message))return {section:'catalog',kind:'barcode',label:'Штрихкоди'};
  if(/\b(fandom|фандом)\b/i.test(message))return {section:'catalog',kind:'fandom',label:'Фандоми'};
  return {section:'catalog',kind:'series',label:'Серії та предмети'};
 }
 if(words.mechanics.test(message))return {section:'features',kind:'feature',label:'Функції та виправлення'};
 return null;
}
function humanize(message){
 let m=message.split('\n')[0].trim();
 m=m.replace(/^(feat|fix|ui|refactor|catalog|data|perf|style)(\([^)]*\))?:\s*/i,'');
 const rules=[
  [/^Add series request tab with moderator review and color-coded statuses/i,'Додано вкладку «Додати серію», модерацію пропозицій та кольорові статуси'],
  [/^Fix request tab stylesheet and restore request view loading/i,'Виправлено оформлення вкладки пропозицій та завантаження заявок'],
  [/^Refresh community chat asset for series request tab/i,'Оновлено модуль чату для підтримки заявок на серії'],
  [/^Add five LEGO Harry Potter collections with six official sets/i,'Додано 5 колекцій LEGO Harry Potter із 6 офіційними наборами'],
  [/^Add four verified LEGO Harry Potter lines with nine unique sets/i,'Додано 4 перевірені серії LEGO Harry Potter із 9 унікальними наборами'],
  [/^Add Funko Harry Potter POP Deluxe Diagon Alley/i,'Додано Funko Harry Potter POP Deluxe (Diagon Alley, Hogwarts) і LEGO Advent Calendar 2025'],
  [/^Add verified Harry Potter Funko Mystery Mini Globes/i,'Додано повний склад із 10 персонажів Harry Potter Funko Mystery Mini Globes'],
  [/^Add LEGO Harry Potter CMF Series 1 and 2/i,'Додано LEGO Harry Potter CMF серії 1 і 2 — 38 персонажів'],
  [/^Add complete 8-figure Iron Studios Harry Potter MiniCo/i,'Додано повну серію Iron Studios Harry Potter MiniCo з 8 фігурок'],
  [/^Add official manufacturer photos to Harry Potter/i,'Додано офіційні фото для серій Harry Potter і Micro Magical Moments Year 3']
 ];
 for(const [pattern,result] of rules)if(pattern.test(m))return result;
 return m;
}

const lang=()=>['uk','en','ru'].includes(document.documentElement.lang)?document.documentElement.lang:'uk';
const txt={
 uk:{heading:'Останні оновлення',refresh:'Оновити',intro:'Нові функції та поповнення каталогу за датами. Час указано за Києвом.',features:'Функції',catalog:'Каталог',all:'Усе',series:'Серії, предмети, фандоми',photo:'Фото',barcode:'Штрихкоди',search:'Пошук по оновленнях',empty:'За вибраними умовами оновлень немає.',loading:'Завантаження оновлень…',more:'Показати старіші оновлення',problem:'Не вдалося завантажити оновлення. Спробуйте ще раз.',rate:'Оновлення тимчасово недоступні. Спробуйте пізніше.',kind:{photo:'Фотографії',barcode:'Штрихкоди',fandom:'Фандоми',series:'Серії та предмети',feature:'Функції та виправлення'},actions:{add:'Додано',fix:'Виправлено',update:'Оновлено',expand:'Розширено',complete:'Доповнено',other:'Змінено'},targets:{photo:'фотографії',barcode:'штрихкоди',fandom:'фандоми',series:'серії та предмети',feature:'функції застосунку'}},
 en:{heading:'Latest updates',refresh:'Refresh',intro:'New features and catalog additions by date. Times are shown in Kyiv time.',features:'Features',catalog:'Catalog',all:'All',series:'Series, items, fandoms',photo:'Photos',barcode:'Barcodes',search:'Search updates',empty:'No updates match the selected filters.',loading:'Loading updates…',more:'Show older updates',problem:'Could not load updates. Please try again.',rate:'Updates are temporarily unavailable. Please try again later.',kind:{photo:'Photos',barcode:'Barcodes',fandom:'Fandoms',series:'Series and items',feature:'Features and fixes'},actions:{add:'Added',fix:'Fixed',update:'Updated',expand:'Expanded',complete:'Completed',other:'Changed'},targets:{photo:'product photos',barcode:'barcodes',fandom:'fandoms',series:'series and items',feature:'app features'}},
 ru:{heading:'Последние обновления',refresh:'Обновить',intro:'Новые функции и пополнения каталога по датам. Время указано по Киеву.',features:'Функции',catalog:'Каталог',all:'Всё',series:'Серии, предметы, фандомы',photo:'Фото',barcode:'Штрихкоды',search:'Поиск по обновлениям',empty:'По выбранным условиям обновлений нет.',loading:'Загрузка обновлений…',more:'Показать более ранние обновления',problem:'Не удалось загрузить обновления. Попробуйте ещё раз.',rate:'Обновления временно недоступны. Попробуйте позже.',kind:{photo:'Фотографии',barcode:'Штрихкоды',fandom:'Фандомы',series:'Серии и предметы',feature:'Функции и исправления'},actions:{add:'Добавлено',fix:'Исправлено',update:'Обновлено',expand:'Расширено',complete:'Дополнено',other:'Изменено'},targets:{photo:'фотографии',barcode:'штрихкоды',fandom:'фандомы',series:'серии и предметы',feature:'функции приложения'}}
};
const labels=()=>txt[lang()];
const properNames=[
 [/\bharry potter\b/i,'Harry Potter'],[/\blego\b/i,'LEGO'],[/\bfunko\b/i,'Funko'],[/\bbratz\b/i,'Bratz'],[/\bmonster high\b/i,'Monster High'],
 [/\bwinx\b/i,'Winx'],[/\b52toys\b/i,'52TOYS'],[/\bspin master\b/i,'Spin Master'],[/\bmicro magical moments\b/i,'Micro Magical Moments'],
 [/\bminico\b/i,'MiniCo'],[/\bbitty pop\b/i,'Bitty POP'],[/\bbuild.a.bear\b/i,'Build-A-Bear'],[/\bmy little pony\b|\bmlp\b/i,'My Little Pony'],
 [/\bdisney\b/i,'Disney'],[/\bty\b/i,'Ty'],[/\bkayou\b/i,'Kayou'],[/\bmonster ball\b/i,'Monster Ball'],[/\bmystery minis\b/i,'Mystery Minis']
];
function translatedTitle(entry){
 const l=lang();
 const explicit=[
  [/^Add series request tab with moderator review/i,{uk:'Додано вкладку «Додати серію» з модерацією та кольоровими статусами',en:'Added the “Add series” tab with moderation and color-coded statuses',ru:'Добавлена вкладка «Добавить серию» с модерацией и цветными статусами'}],
  [/^Fix request tab stylesheet and restore request view loading/i,{uk:'Виправлено оформлення й завантаження заявок на серії',en:'Fixed series-request styling and loading',ru:'Исправлено оформление и загрузка заявок на серии'}],
  [/^Refresh community chat asset for series request tab/i,{uk:'Оновлено модуль чату для заявок на серії',en:'Updated chat module for series requests',ru:'Обновлён модуль чата для заявок на серии'}],
  [/^Add five LEGO Harry Potter collections with six official sets/i,{uk:'Додано 5 колекцій LEGO Harry Potter із 6 наборами',en:'Added 5 LEGO Harry Potter collections with 6 sets',ru:'Добавлено 5 коллекций LEGO Harry Potter с 6 наборами'}],
  [/^Add four verified LEGO Harry Potter lines with nine unique sets/i,{uk:'Додано 4 серії LEGO Harry Potter із 9 унікальними наборами',en:'Added 4 LEGO Harry Potter lines with 9 unique sets',ru:'Добавлено 4 серии LEGO Harry Potter с 9 уникальными наборами'}],
  [/^Add verified Harry Potter Funko Mystery Mini Globes/i,{uk:'Додано 10 персонажів Harry Potter Funko Mystery Mini Globes',en:'Added 10 Harry Potter Funko Mystery Mini Globes characters',ru:'Добавлено 10 персонажей Harry Potter Funko Mystery Mini Globes'}],
  [/^Add LEGO Harry Potter CMF Series 1 and 2/i,{uk:'Додано 38 персонажів LEGO Harry Potter CMF серій 1 і 2',en:'Added 38 characters from LEGO Harry Potter CMF Series 1 and 2',ru:'Добавлено 38 персонажей LEGO Harry Potter CMF серий 1 и 2'}],
  [/^Add complete 8-figure Iron Studios Harry Potter MiniCo/i,{uk:'Додано серію Iron Studios Harry Potter MiniCo з 8 фігурок',en:'Added the 8-figure Iron Studios Harry Potter MiniCo series',ru:'Добавлена серия Iron Studios Harry Potter MiniCo из 8 фигурок'}],
  [/^Add Funko Harry Potter POP Deluxe Diagon Alley/i,{uk:'Додано серії Funko Harry Potter POP Deluxe та адвент-календар LEGO 2025',en:'Added Funko Harry Potter POP Deluxe series and LEGO 2025 Advent Calendar',ru:'Добавлены серии Funko Harry Potter POP Deluxe и адвент-календарь LEGO 2025'}],
  [/^Add official manufacturer photos to Harry Potter/i,{uk:'Додано офіційні фотографії Harry Potter і Micro Magical Moments Year 3',en:'Added official Harry Potter and Micro Magical Moments Year 3 photos',ru:'Добавлены официальные фотографии Harry Potter и Micro Magical Moments Year 3'}],
  [/^Add Updates navigation and dated Features\/Catalog panels/i,{uk:'Додано розділ «Оновлення» з історією функцій і каталогу',en:'Added the Updates section with separate Features and Catalog histories',ru:'Добавлен раздел «Обновления» с историей функций и каталога'}]
 ];
 for(const [pattern,result] of explicit)if(pattern.test(entry.original))return result[l];
 const message=entry.original, action=/\b(fix|repair|correct|restore|prevent|resolve)\b/i.test(message)?'fix':/\b(add|create|introduce|insert|load)\b/i.test(message)?'add':/\b(expand|extend)\b/i.test(message)?'expand':/\b(fill|complete|finish)\b/i.test(message)?'complete':/\b(update|refresh|improve|change|adjust|refactor)\b/i.test(message)?'update':'other';
 const names=properNames.filter(([re])=>re.test(message)).map(([,name])=>name).slice(0,3);
 const t=txt[l],suffix=names.length?' — '+names.join(' · '):'';
 return t.actions[action]+' '+t.targets[entry.kind]+suffix;
}
const date=t=>new Date(t).toLocaleDateString(lang()==='en'?'en-GB':lang()==='ru'?'ru-RU':'uk-UA',{day:'2-digit',month:'long',year:'numeric',timeZone:'Europe/Kyiv'});
const time=t=>new Date(t).toLocaleTimeString(lang()==='en'?'en-GB':lang()==='ru'?'ru-RU':'uk-UA',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'});
function matching(){
 const q=st.search.trim().toLocaleLowerCase(lang());
 return st.rows.filter(x=>{
  if(x.section!==st.tab)return false;
  if(st.tab==='catalog'&&st.filter!=='all'&&(st.filter==='series'?!['series','fandom'].includes(x.kind):x.kind!==st.filter))return false;
  return !q||(translatedTitle(x)+' '+labels().kind[x.kind]).toLocaleLowerCase(lang()).includes(q);
 });
}
function render(){
 const t=labels(),items=matching(),seen=new Set();
 const list=items.map(x=>{
  const d=date(x.date),header=!seen.has(d)?'<h3 class="upd-date">'+esc(d)+'</h3>':'';seen.add(d);
  return header+'<article class="upd-entry"><div class="upd-entry-head"><span class="upd-type">'+esc(t.kind[x.kind])+'</span><time datetime="'+esc(x.date)+'">'+esc(time(x.date))+'</time></div><div class="upd-text">'+esc(translatedTitle(x))+'</div></article>';
 }).join('');
 return '<section class="upd-wrap"><div class="upd-heading"><h2>🕒 '+esc(t.heading)+'</h2><button class="alt" type="button" id="updRefresh" '+(st.loading?'disabled':'')+'>↻ '+esc(t.refresh)+'</button></div>'
  +'<p class="muted">'+esc(t.intro)+'</p>'
  +'<div class="upd-tabs"><button type="button" data-upd-tab="features" class="'+(st.tab==='features'?'active':'')+'">⚙️ '+esc(t.features)+'</button><button type="button" data-upd-tab="catalog" class="'+(st.tab==='catalog'?'active':'')+'">🧸 '+esc(t.catalog)+'</button></div>'
  +(st.tab==='catalog'?'<div class="upd-filters">'+[['all',t.all],['series',t.series],['photo',t.photo],['barcode',t.barcode]].map(([key,label])=>'<button type="button" class="alt '+(st.filter===key?'active':'')+'" data-upd-filter="'+key+'">'+esc(label)+'</button>').join('')+'</div>':'')
  +'<input id="updSearch" type="search" class="field" placeholder="'+esc(t.search)+'" value="'+esc(st.search)+'" aria-label="'+esc(t.search)+'">'
  +(st.error?'<div class="banner" role="alert">'+esc(st.error==='rate'?t.rate:t.problem)+'</div>':'')
  +'<div class="upd-entries">'+(list||(!st.loading?'<div class="empty">'+esc(t.empty)+'</div>':''))+'</div>'
  +(st.loading?'<p class="muted">'+esc(t.loading)+'</p>':'')
  +(st.more?'<button id="updMore" type="button" class="alt" '+(st.loading?'disabled':'')+'>'+esc(t.more)+'</button>':'')+'</section>';
}
async function load(reset=false){
 if(st.loading)return;
 st.loading=true;st.error='';if(reset){st.page=0;st.rows=[];st.more=true}
 st.refresh?.();
 try{
  const page=st.page+1;
  const response=await fetch(API+'?per_page=100&page='+page,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
  if(!response.ok)throw Error(response.status===403?'rate':'problem');
  const data=await response.json();
  if(!Array.isArray(data))throw Error('problem');
  const next=data.map(c=>{
   const original=String(c.commit?.message||'').split('\n')[0],classification=category(original),sha=String(c.sha||'');
   if(!classification||!/^[a-f0-9]{40}$/i.test(sha)||!c.commit?.committer?.date&&!c.commit?.author?.date)return null;
   return {...classification,original,sha,date:c.commit?.committer?.date||c.commit?.author?.date};
  }).filter(Boolean);
  const old=new Set(st.rows.map(x=>x.sha));
  st.rows.push(...next.filter(x=>!old.has(x.sha)));
  st.page=page;st.more=data.length===100;st.lastLoaded=Date.now();
 }catch(error){st.error=error.message==='rate'?'rate':'problem'}
 finally{st.loading=false;st.refresh?.()}
}
function attach(refresh){
 st.refresh=refresh;
 document.querySelectorAll('[data-upd-tab]').forEach(b=>b.onclick=()=>{st.tab=b.dataset.updTab;refresh()});
 document.querySelectorAll('[data-upd-filter]').forEach(b=>b.onclick=()=>{st.filter=b.dataset.updFilter;refresh()});
 const input=document.getElementById('updSearch');if(input)input.oninput=()=>{st.search=input.value;const view=document.querySelector('.upd-entries');if(view){const focusStart=input.selectionStart;refresh();const next=document.getElementById('updSearch');next?.focus();try{next?.setSelectionRange(focusStart,focusStart)}catch{}}};
 const update=document.getElementById('updRefresh');if(update)update.onclick=()=>load(true);
 const more=document.getElementById('updMore');if(more)more.onclick=()=>load();
 if(!st.page&&!st.loading)load();
}
const css=`.upd-wrap{display:grid;gap:14px}.upd-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.upd-heading h2{margin:0}.upd-tabs{display:grid;grid-template-columns:1fr 1fr;background:var(--panel);border:1px solid var(--edge);border-radius:14px;padding:5px;gap:5px}.upd-tabs button{border:0;border-radius:10px;padding:13px 8px;font:inherit;font-weight:700;background:transparent;color:var(--fg)}.upd-tabs button.active{background:var(--pale);color:var(--accent)}.upd-filters{display:flex;gap:7px;flex-wrap:wrap}.upd-filters .alt{font-size:12px;padding:8px 11px}.upd-filters .active{border-color:var(--accent);color:var(--accent);background:var(--pale)}.upd-entries{display:grid;gap:10px}.upd-date{font-size:16px;margin:18px 0 2px}.upd-entry{background:var(--panel);border:1px solid var(--edge);border-radius:14px;padding:15px;display:grid;gap:10px}.upd-entry-head{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px;color:var(--sub)}.upd-type{border-radius:20px;background:var(--pale);color:var(--accent);font-weight:700;padding:5px 10px}.upd-text{font-weight:600;overflow-wrap:anywhere;line-height:1.45}.upd-entry a{font-size:12px;color:var(--accent)}.upd-entry details p{overflow-wrap:anywhere}.upd-entry details summary{cursor:pointer;color:var(--sub);font-size:12px}`;
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
window.CollectorUpdates={render,attach,refresh:()=>load(true)};
})();
