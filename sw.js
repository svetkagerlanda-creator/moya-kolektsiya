// Network-first for application scripts; cached copies keep the PWA usable offline.
const CACHE='moya-kolektsiya-v1.0.0-beta.43';
const CORE=['./','./index.html','./i18n.js?v=1.0.0-beta.43','./collector-cloud.js?v=1.0.0-beta.43','./personal-photos.js?v=1.0.0-beta.43','./community-social.js?v=1.0.0-beta.43','./community-chat.js?v=1.0.0-beta.43','./banner-crop.js?v=1.0.0-beta.43','./community-auth.js?v=1.0.0-beta.43','./donation.json','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(CORE.map(path=>cache.add(path)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('moya-kolektsiya-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  const url=new URL(request.url);
  const isNavigation=request.mode==='navigate';
  const isAppScript=/\.(?:js|mjs)$/.test(url.pathname);
  const isCatalog=url.pathname.includes('/catalogs/');
  if(isNavigation||isAppScript||isCatalog){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}))}
      return response;
    }).catch(async()=>await caches.match(request)||(isNavigation?await caches.match('./index.html'):Response.error())));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}))}
    return response;
  })));
});
