/* ============================================================================
 * POKLÁDKY — js/mapa.js
 * Mapové podklady, osa stavby a přepočet GPS ↔ staničení.
 *
 * Osa se zadává třemi způsoby, v tomhle pořadí důležitosti:
 *   1. Z PROJEKTOVÉ DOKUMENTACE — nahraje se GPX/KML. Nejpřesnější, přednostní.
 *   2. ZAČÁTEK A KONEC — klepnu na dva body a appka mezi nimi načte skutečnou
 *      trasu po silnici. Zatáčky doklikávat netřeba.
 *   3. RUČNĚ — jen pro případy, kdy trasa po silnici nesedí (uzavírky, sjezdy).
 *
 * Druhý způsob je záměrně výchozí pro terén: klikání desítek bodů v zatáčkách
 * nikdo dělat nebude.
 * ========================================================================== */

/* Klíč k mapovým podkladům Mapy.com. Je to klíč do prohlížeče, takže je v kódu
 * vidět — chrání se omezením na doménu v účtu Mapy.com. */
var MAPY_API_KEY = 'n4vDG-d4mkhllq8P_9783hgyMtm9U6RU6WwwGvvpvuY';
var MAX_BODU_OSY = 600;        // víc bodů už staničení nezpřesní, jen nafoukne databázi

/* Je mapová knihovna k dispozici? */
function mapaDostupna(){ return typeof L !== 'undefined' && L && typeof L.map === 'function'; }

function createMap(elId, center, zoom){
  if(!mapaDostupna()){
    var box = document.getElementById(elId);
    if(box) box.innerHTML = '<div class="prazdno" style="height:100%;display:flex;align-items:center;' +
      'justify-content:center;flex-direction:column;gap:8px">' + (typeof ico === 'function' ? ico('misto',24) : '') +
      '<span>Mapa se nenačetla.<br>Zkontroluj připojení a načti stránku znovu.</span></div>';
    return null;
  }
  var map = L.map(elId, { zoomControl:true, attributionControl:true })
             .setView(center || [49.8, 15.5], zoom || 7);
  nasadPodklad(map);
  drzMapuSpravne(map, elId);
  return map;
}

/* Leaflet si musí přeměřit plochu pokaždé, když se kontejner objeví nebo změní
 * velikost. Bez toho zůstane mapa šedá — typicky když se otevře v okně, které
 * se zrovna vysouvá, nebo po otočení telefonu. */
function drzMapuSpravne(map, elId){
  var el = document.getElementById(elId); if(!el) return;
  var prepocti = function(){ try { map.invalidateSize(); } catch(e){} };
  [60, 250, 600, 1200].forEach(function(ms){ setTimeout(prepocti, ms); });
  if(window.ResizeObserver){
    try {
      var ro = new ResizeObserver(function(){ prepocti(); });
      ro.observe(el);
      map.__ro = ro;
    } catch(e){}
  }
  window.addEventListener('orientationchange', function(){ setTimeout(prepocti, 350); });
}

/* Podklad Mapy.com se zálohou na OpenStreetMap při úplném výpadku. */
function nasadPodklad(map){
  function osm(){
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19, attribution:'© OpenStreetMap'
    });
  }
  if(!MAPY_API_KEY){ osm().addTo(map); return; }
  var mapy = L.tileLayer('https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=' + MAPY_API_KEY, {
    maxZoom:19, attribution:'<a href="https://mapy.com/" target="_blank" rel="noopener">Mapy.com</a>'
  });
  var chyb = 0, nacteno = 0, prepnuto = false;
  mapy.on('tileload', function(){ nacteno++; });
  mapy.on('tileerror', function(){
    if(prepnuto || nacteno > 0) return;
    if(++chyb < 5) return;
    prepnuto = true;
    console.info('Podklad Mapy.com se nenačítá, přepínám na OpenStreetMap.');
    map.removeLayer(mapy);
    osm().addTo(map);
  });
  mapy.addTo(map);
}

/* ── Geometrie ──────────────────────────────────────────────────────────── */
function haversine(a, b){
  var R = 6371000, toRad = Math.PI/180;
  var dLat = (b[0]-a[0])*toRad, dLng = (b[1]-a[1])*toRad;
  var la1 = a[0]*toRad, la2 = b[0]*toRad;
  var h = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.min(1, Math.sqrt(h)));
}
function polyLength(body){
  var d = 0;
  for(var i=1;i<(body||[]).length;i++) d += haversine(body[i-1], body[i]);
  return d;
}
/* Prořídí trasu, ale nechá body v zatáčkách (Douglas–Peucker zjednodušeně). */
function proridTrasu(body, maxBodu){
  if(!body || body.length <= maxBodu) return body || [];
  var krok = Math.ceil(body.length / maxBodu), out = [];
  for(var i=0;i<body.length;i+=krok) out.push(body[i]);
  if(out[out.length-1] !== body[body.length-1]) out.push(body[body.length-1]);
  return out;
}
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
    if(best === null || dist < best.odchylka) best = { odchylka:dist, staniceni:ujeto + t*Math.sqrt(len2) };
    ujeto += Math.sqrt(len2);
  }
  return best;
}
function stavbaKm(stavba, lat, lng){
  if(!stavba || !stavba.osa || !stavba.osa.body || stavba.osa.body.length < 2) return null;
  var p = projectOnAxis(stavba.osa.body, [lat, lng]);
  if(!p) return null;
  return { m: num(stavba.osa.kmStart) * 1000 + p.staniceni, odchylka: p.odchylka };
}

/* ── Trasa po silnici mezi body (Mapy.com) ──────────────────────────────── */
function najdiTrasu(body, hotovo){
  if(!MAPY_API_KEY || body.length < 2){ hotovo(null, 'chybí klíč nebo body'); return; }
  var start = body[0], konec = body[body.length-1];
  var mezi = body.slice(1, -1);
  var url = 'https://api.mapy.com/v1/routing/route' +
            '?start=' + start[1] + ',' + start[0] +
            '&end='   + konec[1] + ',' + konec[0] +
            mezi.map(function(b){ return '&waypoints=' + b[1] + ',' + b[0]; }).join('') +
            '&routeType=car_fast&lang=cs&apikey=' + MAPY_API_KEY;
  fetch(url)
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function(d){
      var sour = d && d.geometry && d.geometry.geometry && d.geometry.geometry.coordinates;
      if(!sour || !sour.length){ hotovo(null, 'trasa se nenašla'); return; }
      hotovo(proridTrasu(sour.map(function(c){ return [c[1], c[0]]; }), MAX_BODU_OSY), null, d.length);
    })
    .catch(function(e){ hotovo(null, (e && e.message) || 'chyba spojení'); });
}

/* ── Načtení osy ze souboru z projektové dokumentace ────────────────────── */
function nactiOsuZeSouboru(file, hotovo){
  var r = new FileReader();
  r.onload = function(e){
    var txt = String(e.target.result || ''), body = [];
    try {
      var xml = new DOMParser().parseFromString(txt, 'text/xml');
      /* GPX: trasa, cesta i samostatné body */
      ['trkpt','rtept','wpt'].forEach(function(tag){
        if(body.length) return;
        var uzly = xml.getElementsByTagName(tag);
        for(var i=0;i<uzly.length;i++){
          var la = parseFloat(uzly[i].getAttribute('lat')), lo = parseFloat(uzly[i].getAttribute('lon'));
          if(!isNaN(la) && !isNaN(lo)) body.push([la, lo]);
        }
      });
      /* KML/KMZ-rozbalené: <coordinates>lon,lat,vyska ...</coordinates> */
      if(!body.length){
        var cs = xml.getElementsByTagName('coordinates');
        for(var j=0;j<cs.length;j++){
          String(cs[j].textContent||'').trim().split(/\s+/).forEach(function(t){
            var c = t.split(',');
            var lo2 = parseFloat(c[0]), la2 = parseFloat(c[1]);
            if(!isNaN(la2) && !isNaN(lo2)) body.push([la2, lo2]);
          });
        }
      }
    } catch(err){}
    /* Prostý seznam souřadnic v textu (lat, lon na řádek) */
    if(!body.length){
      txt.split(/\r?\n/).forEach(function(radek){
        var m = radek.match(/(-?\d{1,2}[.,]\d{3,})\s*[;,\t ]\s*(-?\d{1,2}[.,]\d{3,})/);
        if(!m) return;
        var a = parseFloat(m[1].replace(',','.')), b = parseFloat(m[2].replace(',','.'));
        if(isNaN(a) || isNaN(b)) return;
        body.push(a > b ? [a, b] : [b, a]);        // v ČR je zeměpisná šířka vždy větší
      });
    }
    hotovo(body.length >= 2 ? proridTrasu(body, MAX_BODU_OSY) : null,
           body.length >= 2 ? null : 'v souboru se nenašly souřadnice trasy');
  };
  r.onerror = function(){ hotovo(null, 'soubor se nepodařilo přečíst'); };
  r.readAsText(file);
}

/* ============================================================================
 * ZADÁVÁNÍ OSY VE FORMULÁŘI STAVBY
 * ========================================================================== */
window._osaMap = null; window._osaBody = []; window._osaLayer = null; window._osaMarkery = [];
window._osaRezim = 'trasa';      // 'trasa' = ZÚ+KÚ po silnici, 'rucne' = vlastní body
window._osaKotvy = [];           // body, na které uživatel klepnul (ZÚ, průjezdní, KÚ)
window._osaZdroj = '';           // 'pd' | 'trasa' | 'rucne'

function osaMapInit(){
  if(window._osaMap){ drzMapuSpravne(window._osaMap, 'osa-map'); return; }
  window._osaMap = createMap('osa-map', [49.8, 15.5], 7);
  if(!window._osaMap) return;
  window._osaMap.on('click', function(e){
    var b = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if(window._osaRezim === 'rucne'){ window._osaBody.push(b); window._osaZdroj = 'rucne'; osaRedraw(); return; }
    osaPridejKotvu(b);
  });
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(function(pos){
      if(!window._osaKotvy.length && !window._osaBody.length && window._osaMap)
        window._osaMap.setView([pos.coords.latitude, pos.coords.longitude], 14);
    }, function(){}, { enableHighAccuracy:false, timeout:6000 });
  }
}

/* Klepnutí do mapy v režimu „začátek a konec". */
function osaPridejKotvu(b){
  var k = window._osaKotvy;
  if(k.length >= 2) k.splice(k.length - 1, 0, b);   // další klepnutí = průjezdní bod
  else k.push(b);
  osaRedraw();
  if(k.length >= 2) osaDopocitejTrasu();
}
function osaDopocitejTrasu(){
  var info = document.getElementById('osa-info');
  if(info) info.innerHTML = '<span class="tichy-2">Hledám trasu po silnici…</span>';
  najdiTrasu(window._osaKotvy, function(body, chyba){
    if(!body){
      window._osaBody = window._osaKotvy.slice();
      window._osaZdroj = 'rucne';
      osaRedraw();
      showToast('Trasu po silnici se nepodařilo najít (' + chyba + '). Použila se přímá spojnice — uprav ji ručně.', 5000);
      return;
    }
    window._osaBody = body;
    window._osaZdroj = 'trasa';
    osaRedraw();
    if(window._osaMap) window._osaMap.fitBounds(body, { padding:[30,30] });
  });
}

function osaRezim(r){
  window._osaRezim = r;
  if(r === 'rucne' && window._osaZdroj === 'trasa'){ window._osaBody = window._osaKotvy.slice(); window._osaZdroj = 'rucne'; }
  osaRedraw();
  renderOsaOvladani();
}
function osaZpet(){
  if(window._osaRezim === 'rucne'){ window._osaBody.pop(); }
  else {
    window._osaKotvy.pop();
    if(window._osaKotvy.length >= 2) return osaDopocitejTrasu();
    window._osaBody = window._osaKotvy.slice();
  }
  osaRedraw();
}
function osaClear(){
  window._osaBody = []; window._osaKotvy = []; window._osaZdroj = '';
  osaRedraw();
}

function osaRedraw(){
  var map = window._osaMap;
  if(!map){ osaUpdateInfo(); return; }
  if(window._osaLayer){ map.removeLayer(window._osaLayer); window._osaLayer = null; }
  window._osaMarkery.forEach(function(m){ map.removeLayer(m); });
  window._osaMarkery = [];

  var b = window._osaBody;
  if(b.length >= 2){
    window._osaLayer = L.polyline(b, { color:'#e8536b', weight:6, opacity:.9 }).addTo(map);
  }
  /* Značky: v režimu trasy jen kotvy, v ručním všechny body. */
  var znacky = (window._osaRezim === 'rucne') ? b : window._osaKotvy;
  znacky.forEach(function(p, i){
    var popis = (i === 0) ? 'ZÚ' : (i === znacky.length-1 && znacky.length > 1 ? 'KÚ' : String(i));
    var m = L.marker(p, { icon: L.divIcon({
      className:'', html:'<div style="background:#e8536b;color:#fff;border-radius:999px;'+
        'width:26px;height:26px;line-height:26px;text-align:center;font:700 11px sans-serif;'+
        'border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)">'+popis+'</div>',
      iconSize:[26,26], iconAnchor:[13,13] }) }).addTo(map);
    window._osaMarkery.push(m);
  });
  osaUpdateInfo();
}

function osaUpdateInfo(){
  var el = document.getElementById('osa-info'); if(!el) return;
  var b = window._osaBody, d = polyLength(b);
  var kmEl = document.getElementById('st-kmstart');
  var kmStart = num(kmEl ? kmEl.value : 0);
  if(b.length < 2){
    el.innerHTML = '<span class="tichy-2">' +
      (window._osaRezim === 'rucne'
        ? 'Klepej do mapy a skládej osu bod po bodu.'
        : 'Klepni na <b>začátek</b> úseku, pak na <b>konec</b>. Trasu mezi nimi appka najde sama.') +
      '</span>';
    return;
  }
  var zdroj = { pd:'z dokumentace', trasa:'po silnici', rucne:'ručně',
                gopro:'ze snímků GoPro', jizda:'projeto autem' }[window._osaZdroj] || '';
  el.innerHTML = '<div class="udaj">' + ico('misto',15) +
    '<span>Délka <b>' + fmtNum(d, 0) + ' m</b> · km <b>' + fmtNum(kmStart,3).replace(/\s/g,'') +
    '</b> → <b>' + fmtNum(kmStart + d/1000, 3).replace(/\s/g,'') + '</b>' +
    (zdroj ? ' <span class="tichy-2">· ' + zdroj + '</span>' : '') + '</span></div>';
}

/* Nahrání osy ze souboru z projektové dokumentace. */
function osaSouborVybran(input){
  var f = input.files && input.files[0]; if(!f) return;
  showToast('Načítám trasu ze souboru…');
  nactiOsuZeSouboru(f, function(body, chyba){
    input.value = '';
    if(!body){ showToast('Nepovedlo se: ' + chyba, 5000); return; }
    window._osaBody = body;
    window._osaKotvy = [body[0], body[body.length-1]];
    window._osaZdroj = 'pd';
    osaMapInit();
    osaRedraw();
    if(window._osaMap) setTimeout(function(){ window._osaMap.fitBounds(body, { padding:[30,30] }); }, 150);
    showToast('Trasa načtena — ' + body.length + ' bodů, ' + fmtNum(polyLength(body),0) + ' m.', 4000);
  });
}

/* ============================================================================
 * TRASA Z FOTEK GOPRO
 * Kamera na autě fotí po pár vteřinách a do každého snímku zapíše GPS.
 * Projetím úseku tak vznikne hotová osa — přesnější než klikání do mapy
 * a bez práce navíc, protože ty snímky stejně vznikají kvůli dokumentaci.
 *
 * Ze souboru čteme jen začátek: EXIF je v prvních stovkách kilobajtů, zatímco
 * celý snímek z GoPro má kolem 2,5 MB. Při dvou stovkách souborů je to rozdíl
 * mezi stovkami megabajtů a pár megabajty.
 * ========================================================================== */
var EXIF_CTENO_BAJTU = 300 * 1024;

function gpsZFotky(file){
  return new Promise(function(hotovo){
    var r = new FileReader();
    r.onerror = function(){ hotovo(null); };
    r.onload = function(e){
      try { hotovo(_exifGps(new DataView(e.target.result))); }
      catch(err){ hotovo(null); }
    };
    r.readAsArrayBuffer(file.slice(0, EXIF_CTENO_BAJTU));
  });
}

function _exifGps(dv){
  if(dv.byteLength < 12 || dv.getUint16(0) !== 0xFFD8) return null;   // není JPEG
  var i = 2;
  while(i < dv.byteLength - 4){
    if(dv.getUint8(i) !== 0xFF){ i++; continue; }
    var znacka = dv.getUint8(i+1);
    if(znacka === 0xD8 || znacka === 0x01 || (znacka >= 0xD0 && znacka <= 0xD7)){ i += 2; continue; }
    var delka = dv.getUint16(i+2);
    if(znacka === 0xE1){
      var je = true;
      'Exif\0\0'.split('').forEach(function(z, k){ if(dv.getUint8(i+4+k) !== z.charCodeAt(0)) je = false; });
      if(je) return _gpsZTiff(dv, i + 10);
    }
    i += 2 + delka;
  }
  return null;
}
function _gpsZTiff(dv, tiff){
  var male = dv.getUint16(tiff) === 0x4949;                 // II = little endian
  var u16 = function(o){ return dv.getUint16(o, male); };
  var u32 = function(o){ return dv.getUint32(o, male); };

  function ifd(zaklad){
    var n = u16(zaklad), out = {};
    for(var k = 0; k < n; k++){
      var e = zaklad + 2 + k*12;
      out[u16(e)] = { typ:u16(e+2), pocet:u32(e+4), data:e+8 };
    }
    return out;
  }
  var t0 = ifd(tiff + u32(tiff + 4));
  if(!t0[0x8825]) return null;                              // snímek nemá GPS
  var g = ifd(tiff + u32(t0[0x8825].data));

  function zlomky(tag, pocet){
    var o = tiff + u32(g[tag].data), out = [];
    for(var k = 0; k < pocet; k++){
      var ci = u32(o + k*8), jm = u32(o + k*8 + 4);
      out.push(jm ? ci/jm : 0);
    }
    return out;
  }
  function smer(tag){ return g[tag] ? String.fromCharCode(dv.getUint8(g[tag].data)) : ''; }

  if(!g[2] || !g[4]) return null;
  var la = zlomky(2, 3), lo = zlomky(4, 3);
  var lat = la[0] + la[1]/60 + la[2]/3600;
  var lng = lo[0] + lo[1]/60 + lo[2]/3600;
  if(smer(1) === 'S') lat = -lat;
  if(smer(3) === 'W') lng = -lng;
  if(!lat || !lng) return null;

  var cas = null;
  if(g[7]){ try { var t = zlomky(7, 3); cas = t[0]*3600 + t[1]*60 + t[2]; } catch(e){} }
  return { lat:+lat.toFixed(6), lng:+lng.toFixed(6), cas:cas };
}

/* Z vybraných snímků poskládá trasu seřazenou podle času pořízení. */
function osaZFotekGoPro(input){
  var soubory = Array.prototype.slice.call(input.files || []);
  input.value = '';
  if(!soubory.length) return;

  var info = document.getElementById('osa-info');
  var hlas = function(t){ if(info) info.innerHTML = '<span class="tichy-2">' + t + '</span>'; };
  hlas('Čtu polohu z ' + soubory.length + ' snímků…');

  var body = [], bezGps = 0, hotovo = 0;
  var dalsi = function(k){
    if(k >= soubory.length) return dokonci();
    gpsZFotky(soubory[k]).then(function(g){
      hotovo++;
      if(g) body.push(g); else bezGps++;
      if(hotovo % 10 === 0) hlas('Čtu polohu… ' + hotovo + ' z ' + soubory.length);
      dalsi(k + 1);
    });
  };
  function dokonci(){
    if(body.length < 2){
      showToast('Ve snímcích se nenašla poloha. Má kamera zapnuté GPS?', 6000);
      osaUpdateInfo(); return;
    }
    /* Seřadit podle času pořízení — výběr souborů nemusí přijít v pořadí. */
    if(body.every(function(b){ return b.cas !== null; })) body.sort(function(a,b){ return a.cas - b.cas; });
    var trasa = proridTrasu(body.map(function(b){ return [b.lat, b.lng]; }), MAX_BODU_OSY);

    window._osaBody = trasa;
    window._osaKotvy = [trasa[0], trasa[trasa.length-1]];
    window._osaZdroj = 'gopro';
    osaMapInit();
    osaRedraw();
    if(window._osaMap) setTimeout(function(){ window._osaMap.fitBounds(trasa, { padding:[30,30] }); }, 150);
    showToast('Trasa z ' + body.length + ' snímků · ' + fmtNum(polyLength(trasa),0) + ' m' +
              (bezGps ? ' (' + bezGps + ' snímků bylo bez polohy)' : ''), 5000);
  }
  dalsi(0);
}

/* ============================================================================
 * TRASA ZA JÍZDY
 * Stavbyvedoucí sedne do auta, na začátku úseku dá start, projede ho a na konci
 * stop. Appka mezitím sbírá polohu. Žádné klikání do mapy.
 * ========================================================================== */
window._jizdaId = null; window._jizdaBody = [];
var JIZDA_MIN_POSUN = 8;        // metrů — pod tím je to jen šum GPS

function jizdaStart(){
  if(!navigator.geolocation){ showToast('Tenhle prohlížeč neumí určit polohu.'); return; }
  window._jizdaBody = [];
  window._jizdaId = navigator.geolocation.watchPosition(function(p){
    var b = [+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)];
    var posl = window._jizdaBody[window._jizdaBody.length-1];
    if(posl && haversine(posl, b) < JIZDA_MIN_POSUN) return;
    if(p.coords.accuracy > 50) return;                       // nepřesný údaj zahodíme
    window._jizdaBody.push(b);
    window._osaBody = window._jizdaBody.slice();
    window._osaZdroj = 'jizda';
    osaRedraw();
    if(window._osaMap && window._jizdaBody.length === 1) window._osaMap.setView(b, 16);
    jizdaInfo();
  }, function(e){
    showToast('Poloha není dostupná: ' + (e.message || ''), 5000);
    jizdaStop();
  }, { enableHighAccuracy:true, maximumAge:2000, timeout:20000 });
  renderOsaOvladani();
  showToast('Sleduju polohu. Na konci úseku dej Ukončit.', 4000);
}
function jizdaStop(){
  if(window._jizdaId !== null){ navigator.geolocation.clearWatch(window._jizdaId); window._jizdaId = null; }
  if(window._jizdaBody.length >= 2){
    window._osaKotvy = [window._jizdaBody[0], window._jizdaBody[window._jizdaBody.length-1]];
    showToast('Projeto ' + fmtNum(polyLength(window._jizdaBody),0) + ' m · ' +
              window._jizdaBody.length + ' bodů. Doplň staničení a ulož.', 6000);
  } else if(window._jizdaBody.length){
    showToast('Zaznamenal se jen jeden bod — to na trasu nestačí.', 5000);
  }
  renderOsaOvladani();
  osaUpdateInfo();
}
function jizdaInfo(){
  var el = document.getElementById('osa-info'); if(!el) return;
  el.innerHTML = '<div class="udaj" style="color:var(--ok)">' + ico('misto',15) +
    '<span><b>Sleduju polohu</b> · ' + window._jizdaBody.length + ' bodů · ' +
    fmtNum(polyLength(window._jizdaBody),0) + ' m</span></div>';
}
