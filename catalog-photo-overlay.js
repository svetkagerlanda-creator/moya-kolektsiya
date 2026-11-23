/* Read-only published contributions shown only where original catalog photo is missing. */
(()=>{
'use strict';
const BASE='https://nihheolmwvkgtvtmfzsv.supabase.co';
const KEY='sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
const publicPhoto=path=>typeof path==='string'&&/^approved\/[0-9a-f-]{36}\.jpg$/i.test(path)?BASE+'/storage/v1/object/public/collector-catalog-media/'+path:null;
const normalize=s=>String(s||'').trim().toLocaleLowerCase('uk-UA');
async function apply(series){
 if(!Array.isArray(series)||!series.length)return 0;
 try{
  const response=await fetch(BASE+'/rest/v1/collector_catalog_photo_proposals?select=item_name,series_name,published_path&status=eq.approved&published_path=not.is.null&order=reviewed_at.desc&limit=1000',{headers:{apikey:KEY},cache:'no-store'});
  if(!response.ok)return 0;
  const proposals=await response.json();
  const exact=new Map,byName=new Map,covers=new Map;
  for(const x of proposals){
   const url=publicPhoto(x.published_path);if(!url)continue;
   const sn=normalize(x.series_name),n=normalize(x.item_name);
   if(sn&&n&&!exact.has(sn+'|'+n))exact.set(sn+'|'+n,url);
   if(n&&!byName.has(n))byName.set(n,url);
   if(sn===n&&sn&&!covers.has(sn))covers.set(sn,url);
  }
  let changes=0;
  for(const entry of series){
   const name=normalize(entry.name);
   if(!entry.coverPhoto&&covers.has(name)){entry.coverPhoto=covers.get(name);entry.photoCredit='Фото колекціонера (за згодою)';changes++}
   for(const item of entry.items||[]){
    if(item.photo&&/^https?:/i.test(item.photo))continue;
    const src=exact.get(name+'|'+normalize(item.name));
    if(!src)continue;
    item.photo=src;item.photoCredit='Фото колекціонера (за згодою)';item.photoType='community-approved';changes++;
   }
  }
  return changes;
 }catch(error){console.warn('Approved photos unavailable',error);return 0}
}
window.CollectorCatalogPhotoOverlay={apply};
})();
