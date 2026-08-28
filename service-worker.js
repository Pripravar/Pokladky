/* ============================================================================
 * POKLÁDKY — service worker
 *
 * DŮLEŽITÉ: aplikace je rozdělená na moduly (js/*.js). Kdyby se cachovaly
 * napevno, telefon by po nasazení mohl mít půl staré a půl nové verze.
 * Proto se u vlastních souborů používá „nejdřív síť, cache jako záloha"
 * (stale-while-revalidate) a při KAŽDÉM nasazení se zvedne CACHE_VERSION.
 * ========================================================================== */
var CACHE_VERSION = 'pokladky-v8';
var JADRO = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/ikony.js', './js/core.js', './js/mapa.js', './js/ciselniky.js', './js/stavby.js',
  './js/pokladka.js', './js/plan.js', './js/dispecink.js', './js/objednavky.js',
  './js/objednavky.js', './js/vazni.js', './js/dnes.js', './js/sprava.js', './js/ukazka.js',
  './icon-192.png', './icon-512.png', './favicon.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function(c){
    return Promise.all(JADRO.map(function(u){ return c.add(u).catch(function(){}); }));
  }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(klice){
    return Promise.all(klice.filter(function(k){ return k !== CACHE_VERSION; })
                            .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  if(url.origin !== location.origin) return;          // CDN a mapové dlaždice neřešíme

  e.respondWith(
    fetch(req).then(function(res){
      var kopie = res.clone();
      caches.open(CACHE_VERSION).then(function(c){ c.put(req, kopie); }).catch(function(){});
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        return hit || caches.match('./index.html');
      });
    })
  );
});
