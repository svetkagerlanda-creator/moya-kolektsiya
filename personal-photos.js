/* Personal item photo gallery. Photos remain in local IndexedDB as resized data URLs.
   No account, network request, social post or public storage upload is performed. */
(()=>{
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pics=item=>Array.isArray(item?.personalPhotos)?item.personalPhotos.filter(p=>p&&typeof p.src==='string'&&p.src.startsWith('data:image/')):[];
 const cover=item=>{
   if(item?.preferredPhotoSource!=='personal')return null;
   const all=pics(item), selected=all.find(p=>p.id===item.personalCoverId)||all[0];
   return selected?.src||null;
 };
 const galleryLabel=item=>pics(item).length?'📷 Мої фото ('+pics(item).length+')':'📷 Додати мої фото';
 function photoFromFile(file){
  return new Promise((resolve,reject)=>{
   if(!file||!file.type.startsWith('image/'))return reject(Error('Обери фотографію у форматі JPG, PNG або WEBP'));
   if(file.size>25000000)return reject(Error('Фото завелике (понад 25 МБ)'));
   const object=URL.createObjectURL(file),image=new Image();
   image.onload=()=>{
    try{
     const scale=Math.min(1,1500/Math.max(image.naturalWidth,image.naturalHeight));
     const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
     const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
     canvas.getContext('2d').drawImage(image,0,0,width,height);
     const src=canvas.toDataURL('image/jpeg',.8);
     URL.revokeObjectURL(object);
     if(src.length>2800000)reject(Error('Фото не вдалося достатньо стиснути'));else resolve(src);
    }catch(err){URL.revokeObjectURL(object);reject(err)}
   };
   image.onerror=()=>{URL.revokeObjectURL(object);reject(Error('Не вдалося прочитати це фото'))};
   image.src=object;
  });
 }
 function prompt(item,ctx){
   ctx.modal('Нове придбання 📦','<div class="form"><div class="banner">✓ Предмет додано до «Маю». Особисті фотографії залишаються приватними, а допис у спільноті з’явиться лише після твого підтвердження.</div><h3>Хочеш поділитися новим придбанням?</h3><button type="button" class="btn" id="myPhotoShare">💜 Поділитися придбанням</button><div class="row"><button type="button" class="alt" id="myPhotoCamera">📷 Зробити фото</button><button type="button" class="alt" id="myPhotoGallery">🖼 Обрати з галереї</button></div><button type="button" class="alt" id="myPhotoLater">Пізніше — нічого не публікувати</button></div>');
   document.getElementById('myPhotoShare').onclick=()=>ctx.share?.();
   document.getElementById('myPhotoCamera').onclick=()=>gallery(item,ctx,'camera');
   document.getElementById('myPhotoGallery').onclick=()=>gallery(item,ctx,'gallery');
   document.getElementById('myPhotoLater').onclick=()=>ctx.close();
 }
 function gallery(item,ctx,openPicker=''){
   const all=pics(item),personal=!!cover(item);
   const photoValid=typeof item.photo==='string'&&item.photo.trim()!=='';
   const images=all.map((p,index)=>'<div class="my-photo-tile"><img src="'+escape(p.src)+'" alt="Особисте фото '+(index+1)+'"><div class="my-photo-actions"><button class="alt" type="button" data-personal-cover="'+escape(p.id)+'" '+(personal&&item.personalCoverId===p.id?'disabled':'')+'>'+(personal&&item.personalCoverId===p.id?'✓ Основне':'Основне')+'</button><button class="alt" type="button" data-personal-delete="'+escape(p.id)+'" aria-label="Видалити фото">✕</button></div></div>').join('');
   ctx.modal('Мої фотографії: '+item.name,'<div class="form"><p class="muted">Ці фото зберігаються лише на цьому пристрої, включаються в резервну копію JSON та не публікуються автоматично.</p><div class="row"><button type="button" id="myCameraBtn" class="btn">📷 Камера</button><button type="button" id="myGalleryBtn" class="alt">🖼 Галерея</button><input hidden id="myCameraInput" type="file" accept="image/*" capture="environment"><input hidden id="myGalleryInput" type="file" accept="image/*" multiple></div><div class="row"><button type="button" id="myPhotoCatalogCover" class="'+(!personal?'btn':'alt')+'">Фото каталогу'+(!personal?' ✓':'')+'</button>'+(all.length?'<button type="button" class="'+(personal?'btn':'alt')+'" id="myPhotoPersonalCover">Моє фото'+(personal?' ✓':'')+'</button>':'')+'</div><div class="my-photo-grid">'+(all.length?images:'<div class="empty">Власних фотографій ще немає. Можна додати до 10 фото.</div>')+'</div>'+(all.length&&ctx.catalogPhotoMissing?'<button type="button" class="alt" id="myPhotosPropose">🖼 Запропонувати фото до загального каталогу</button>':'')+'<button type="button" class="btn" id="myPhotosShare">💜 Поділитися придбанням</button><button type="button" class="alt" id="myPhotosDone">Готово</button></div>');
   const $=id=>document.getElementById(id);
   $('myCameraBtn').onclick=()=>$('myCameraInput').click();
   $('myGalleryBtn').onclick=()=>$('myGalleryInput').click();
   $('myPhotosDone').onclick=()=>{ctx.close();ctx.render()};
   $('myPhotosShare').onclick=()=>ctx.share?.();
   if($('myPhotosPropose'))$('myPhotosPropose').onclick=()=>{
    const selected=cover(item)||pics(item)[0]?.src;
    const success=window.CollectorCatalogContributions?.offer(item,selected,{
      modal:ctx.modal,close:ctx.close,toast:ctx.toast,
      seriesName:ctx.seriesName||'',reference:ctx.reference||item.sourceUrl||item.barcode||'',
      catalogPhotoMissing:ctx.catalogPhotoMissing
    });
    if(!success)ctx.toast?.('Не вдалося відкрити пропозицію. Перевір, чи вже завантажена нова версія застосунку.');
   };
   $('myPhotoCatalogCover').onclick=()=>changeCover('catalog');
   if($('myPhotoPersonalCover'))$('myPhotoPersonalCover').onclick=()=>changeCover('personal');
   async function changeCover(which,id){
    const before={preferredPhotoSource:item.preferredPhotoSource,personalCoverId:item.personalCoverId};
    item.preferredPhotoSource=which;
    if(id)item.personalCoverId=id;
    else if(which==='personal'&&!all.find(x=>x.id===item.personalCoverId))item.personalCoverId=all[0]?.id;
    try{await ctx.save();ctx.render();gallery(item,ctx)}catch(err){Object.assign(item,before);ctx.toast('Не вдалося зберегти вибір фото')}
   }
   document.querySelectorAll('[data-personal-cover]').forEach(b=>b.onclick=()=>changeCover('personal',b.dataset.personalCover));
   document.querySelectorAll('[data-personal-delete]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Видалити це особисте фото? Предмет та фото каталогу залишаться.'))return;
    const previous=[...pics(item)],oldSource=item.preferredPhotoSource,oldCover=item.personalCoverId;
    item.personalPhotos=previous.filter(p=>p.id!==b.dataset.personalDelete);
    if(item.personalCoverId===b.dataset.personalDelete)item.personalCoverId=item.personalPhotos[0]?.id||null;
    if(!item.personalPhotos.length)item.preferredPhotoSource='catalog';
    try{await ctx.save();ctx.render();gallery(item,ctx)}catch(err){item.personalPhotos=previous;item.preferredPhotoSource=oldSource;item.personalCoverId=oldCover;ctx.toast('Не вдалося видалити фото')}
   });
   async function receive(evt){
    const files=[...evt.target.files];if(!files.length)return;
    const old=[...pics(item)],oldSource=item.preferredPhotoSource,oldCover=item.personalCoverId;
    const limit=Math.max(0,10-old.length);
    if(!limit){ctx.toast('У галереї максимум 10 фотографій');return}
    try{
     const batch=[];
     for(const file of files.slice(0,limit))batch.push({id:crypto.randomUUID(),src:await photoFromFile(file),createdAt:new Date().toISOString()});
     if(!batch.length)return;
     item.personalPhotos=[...old,...batch];
     const makeMain=confirm('Зробити нове фото основним у картці предмета?');
     if(makeMain){item.personalCoverId=batch[0].id;item.preferredPhotoSource='personal'}
     await ctx.save();ctx.render();const proposed=window.CollectorCatalogContributions?.offer(item,batch[0].src,{modal:ctx.modal,close:ctx.close,toast:ctx.toast,seriesName:ctx.seriesName||'',reference:item.sourceUrl||item.barcode||''});if(!proposed)gallery(item,ctx);
     if(files.length>limit)ctx.toast('Збережено '+limit+' фото — максимум 10');
    }catch(err){
     item.personalPhotos=old;item.personalCoverId=oldCover;item.preferredPhotoSource=oldSource;
     ctx.toast('Фото не збережено: '+String(err.message||err));
    }
   }
   $('myCameraInput').onchange=receive;$('myGalleryInput').onchange=receive;
   if(openPicker==='camera')$('myCameraInput').click();
   if(openPicker==='gallery')$('myGalleryInput').click();
 }
 const css='.my-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}.my-photo-tile{border:1px solid var(--edge);padding:7px;border-radius:12px}.my-photo-tile img{width:100%;height:130px;object-fit:contain;background:var(--pale);border-radius:8px}.my-photo-actions{display:flex;gap:5px;justify-content:space-between;margin-top:6px}.my-photo-actions button{font-size:12px;padding:7px}.my-photo-badge{font-size:11px;display:inline-flex;align-items:center;color:var(--accent);margin-top:5px}';
 const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
 window.CollectorPhotos={cover,pics,prompt,gallery,galleryLabel};
})();