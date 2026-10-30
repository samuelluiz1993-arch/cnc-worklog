// Cache soltanto delle risorse statiche. La rete ha priorità sugli aggiornamenti.
const CACHE='cnc-worklog-v0.10.3';
const ASSETS=['./index.html?v=0103','./style.css?v=0103','./app.js?v=0103','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('cnc-worklog-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;
 // Il manifest di versione non deve essere servito dalla cache.
 if(u.pathname.endsWith('/version.json')){e.respondWith(fetch(r,{cache:'no-store'}));return;}
 e.respondWith((async()=>{try{const response=await fetch(r,{cache:'no-store'});if(response.ok){const c=await caches.open(CACHE);await c.put(r,response.clone());}return response;}catch(err){const cached=await caches.match(r);if(cached)return cached;throw err;}})());
});
