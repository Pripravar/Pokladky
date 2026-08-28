/* ============================================================================
 * POKLÁDKY — js/mapa.js
 * Mapové podklady, kreslení osy stavby a přepočet GPS ↔ staničení.
 *
 * Proti aplikacím staveb je to výrazně jednodušší: stavbyvedoucí nemá projektovou
 * dokumentaci s kalibračními body — naklikne začátek a konec úseku do mapy,
 * zadá staničení na začátku a zbytek si appka dopočítá sama (dle konceptu).
 * ========================================================================== */

/* Klíč k mapovým podkladům Mapy.com. Je to klíč do prohlížeče, takže je v kódu
 * vidět — chrání se tím, že se v účtu Mapy.com omezí na doménu appky
 * (pripravar.github.io). Bez klíče appka spadne na OpenStreetMap. */
var MAPY_API_KEY = 'n4vDG-d4mkhllq8P_9783hgyMtm9U6RU6WwwGvvpvuY';

/* Je mapová knihovna k dispozici? (Bez signálu nebo v ukázkové verzi nemusí být.) */
function mapaDostupna(){ return typeof L !== 'undefined' && L && typeof L.map === 'function'; }

/* Vytvoří mapu v daném prvku. Když knihovna chybí, vypíše do prvku vysvětlení
 * místo toho, aby appka spadla. */
function createMap(elId, center, zoom){
  if(!mapaDostupna()){
    var box = document.getElementById(elId);
    if(box) box.innerHTML = '<div class="prazdno" style="height:100%;display:flex;align-items:center;' +
      'justify-content:center;flex-direction:column;gap:8px">' + (typeof ico === 'function' ? ico('misto',24) : '') +
      '<span>Mapa se teď nenačetla.<br>Zkontroluj připojení k internetu.</span></div>';
    return null;
  }
  var map = L.map(elId, { zoomControl:true, attributionControl:true })
             .setView(center || [49.8, 15.5], zoom || 7);
  nasadPodklad(map);
  // Leaflet potřebuje po zobrazení skrytého prvku přeměřit velikost, jinak je mapa šedá.
  setTimeout(function(){ map.invalidateSize(); }, 120);
  return map;
}

/* Podklad mapy: turistická Mapy.com (stejně jako v ostatních appkách).
 * Když se dlaždice nenačtou — třeba na localhostu, kde doména není u Mapy.com
 * zaregistrovaná — přepne se to samo na OpenStreetMap, ať mapa nezůstane šedá. */
function nasadPodklad(map){
  function osm(){
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19, attribution:'© OpenStreetMap'
    });
  }
  if(!MAPY_API_KEY){ osm().addTo(map); return; }

  var mapy = L.tileLayer('https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=' + MAPY_API_KEY, {
    maxZoom:19,
    attribution:'<a href="https://mapy.com/" target="_blank" rel="noopener">Mapy.com</a>'
  });
  var chyb = 0, prepnuto = false;
  mapy.on('tileerror', function(){
    if(prepnuto) return;
    if(++chyb < 4) return;                       // ojedinělá chyba dlaždice nevadí
    prepnuto = true;
    console.info('Podklad Mapy.com se nenačetl, přepínám na OpenStreetMap.');
    map.removeLayer(mapy);
    osm().addTo(map);
  });
  mapy.addTo(map);
}

/* Vzdálenost dvou bodů [lat,lng] v metrech. */
function haversine(a, b){
  var R = 6371000, toRad = Math.PI/180;
  var dLat = (b[0]-a[0])*toRad, dLng = (b[1]-a[1])*toRad;
  var la1 = a[0]*toRad, la2 = b[0]*toRad;
  var h = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.min(1, Math.sqrt(h)));
}
/* Délka lomené čáry v metrech. */
function polyLength(body){
  var d = 0;
  for(var i=1;i<(body||[]).length;i++) d += haversine(body[i-1], body[i]);
  return d;
}

/* Průmět bodu na osu → vzdálenost od začátku osy v metrech (a odchylka od osy).
 * Počítá se v rovině (ekvirektangulární přiblížení) — na délce stavby je chyba
 * hluboko pod přesností GPS. */
function projectOnAxis(body, pt){
  if(!body || body.length < 2) return null;
  var lat0 = body[0][0] * Math.PI/180;
  var kx = Math.cos(lat0) * 111320, ky = 110540;
  function xy(p){ return [ (p[1]-body[0][1])*kx, (p[0]-body[0][0])*ky ]; }
  var P = xy(pt), best = null, ujeto = 0;
  for(var i=1;i<body.length;i++){
    var A = xy(body[i-1]), B = xy(body[i]);
    var vx = B[0]-A[0], vy = B[1]-A[1];
    var len2 = vx*vx + vy*vy;
    var t = len2 ? ((P[0]-A[0])*vx + (P[1]-A[1])*vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    var cx = A[0] + t*vx, cy = A[1] + t*vy;
    var dist = Math.sqrt((P[0]-cx)*(P[0]-cx) + (P[1]-cy)*(P[1]-cy));
    if(best === null || dist < best.odchylka){
      best = { odchylka:dist, staniceni:ujeto + t*Math.sqrt(len2) };
    }
    ujeto += Math.sqrt(len2);
  }
  return best;
}

/* Staničení bodu na stavbě v metrech (včetně posunu kmStart), nebo null. */
function stavbaKm(stavba, lat, lng){
  if(!stavba || !stavba.osa || !stavba.osa.body || stavba.osa.body.length < 2) return null;
  var p = projectOnAxis(stavba.osa.body, [lat, lng]);
  if(!p) return null;
  return { m: num(stavba.osa.kmStart) * 1000 + p.staniceni, odchylka: p.odchylka };
}

/* ── Kreslení osy při zakládání stavby ───────────────────────────────── */
window._osaMap = null; window._osaBody = []; window._osaLayer = null; window._osaMarkers = [];

function osaMapInit(){
  if(window._osaMap){ setTimeout(function(){ window._osaMap.invalidateSize(); }, 120); return; }
  window._osaMap = createMap('osa-map', [49.8, 15.5], 7);
  if(!window._osaMap) return;
  window._osaMap.on('click', function(e){
    window._osaBody.push([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]);
    osaRedraw();
  });
  // Nabídnout polohu telefonu — stavbyvedoucí zakládá stavbu většinou přímo na místě.
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(function(pos){
      if(!window._osaBody.length) window._osaMap.setView([pos.coords.latitude, pos.coords.longitude], 15);
    }, function(){}, { enableHighAccuracy:false, timeout:6000 });
  }
}
function osaRedraw(){
  var map = window._osaMap;
  if(!map){ osaUpdateInfo(); return; }
  if(window._osaLayer){ map.removeLayer(window._osaLayer); window._osaLayer = null; }
  window._osaMarkers.forEach(function(m){ map.removeLayer(m); });
  window._osaMarkers = [];
  var b = window._osaBody;
  if(b.length >= 2){
    window._osaLayer = L.polyline(b, { color:'#e94560', weight:5, opacity:.9 }).addTo(map);
  }
  b.forEach(function(p, i){
    var popis = (i === 0) ? 'ZÚ' : (i === b.length-1 ? 'KÚ' : String(i));
    var m = L.marker(p, { icon: L.divIcon({
      className:'', html:'<div style="background:#e94560;color:#fff;border-radius:999px;'+
        'width:24px;height:24px;line-height:24px;text-align:center;font:700 11px sans-serif;'+
        'border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)">'+popis+'</div>',
      iconSize:[24,24], iconAnchor:[12,12] }) }).addTo(map);
    window._osaMarkers.push(m);
  });
  osaUpdateInfo();
}
function osaUpdateInfo(){
  var el = document.getElementById('osa-info'); if(!el) return;
  var b = window._osaBody, d = polyLength(b);
  var kmStart = num(document.getElementById('st-kmstart') ? document.getElementById('st-kmstart').value : 0);
  if(b.length < 2){
    el.innerHTML = '<span class="tichy-2">Zatím nejsou zadané body osy.</span>';
  } else {
    el.innerHTML = '<div class="udaj">' + ico('misto',15) + '<span>Délka <b>' + fmtNum(d, 0) + ' m</b> · ' +
      'km <b>' + fmtNum(kmStart, 3).replace(/\s/g,'') + '</b> → <b>' + fmtNum(kmStart + d/1000, 3).replace(/\s/g,'') + '</b>' +
      ' · bodů ' + b.length + '</span></div>';
  }
}
function osaUndo(){ window._osaBody.pop(); osaRedraw(); }
function osaClear(){ window._osaBody = []; osaRedraw(); }
