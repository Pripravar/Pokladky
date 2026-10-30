/* ============================================================================
 * POKLÁDKY — js/foto.js
 * Fotky ze stavby: focení, fronta na pozadí, galerie.
 *
 * ── Kam se fotka ukládá ─────────────────────────────────────────────────────
 * Firebase Storage vyžaduje u tohohle projektu placený plán Blaze, který zatím
 * není. Fotky proto jdou do databáze, ale rozdělené do dvou uzlů:
 *     /fotky/{id}         popis (kdo, kdy, kde, staničení) — načítá se vždy
 *     /fotky_nahled/{id}  malý náhled do mřížky — načítá se, až je vidět
 *     /fotky_data/{id}    plná fotka — načítá se teprve při otevření
 * Bez tohohle rozdělení by se při každém otevření galerie stahovalo všechno
 * a bezplatný limit přenosu by došel během pár dnů.
 *
 * Až bude Blaze, mění se jen trojice funkcí `ulozFotoData`, `nactiFotoData`
 * a `smazFotoData` — zbytek modulu zůstane.
 *
 * ── Proč fronta ────────────────────────────────────────────────────────────
 * Na stavbě bývá mizerný signál. Fotka se proto nejdřív odloží do prohlížeče
 * (IndexedDB) a teprve pak nahrává. Když se to nepovede, zkusí to znovu — i po
 * zavření a znovuotevření aplikace. Vyfocené se nesmí ztratit.
 * ========================================================================== */

window.allFotky = {};

var FOTO_SIRKA     = 1400;      // plná fotka
var FOTO_KVALITA   = 0.62;
var NAHLED_SIRKA   = 320;       // náhled do mřížky
var NAHLED_KVALITA = 0.5;
var FOTO_MAX_BAJTU = 900 * 1024;

/* ── Úložiště fotky (jediné místo, které se po přechodu na Blaze mění) ──── */
function ulozFotoData(id, plna, nahled){
  return db.ref('fotky_data/' + id).set(plna)
    .then(function(){ return db.ref('fotky_nahled/' + id).set(nahled); });
}
function nactiFotoData(id){
  return db.ref('fotky_data/' + id).once('value').then(function(s){ return s.val(); });
}
function nactiFotoNahled(id){
  return db.ref('fotky_nahled/' + id).once('value').then(function(s){ return s.val(); });
}
function smazFotoData(id){
  db.ref('fotky_nahled/' + id).remove();
  return db.ref('fotky_data/' + id).remove();
}

function loadFotky(){
  db.ref('fotky').on('value', function(snap){
    window.allFotky = snap.val() || {};
    if(document.getElementById('foto-modal') &&
       document.getElementById('foto-modal').classList.contains('open')) renderGalerie();
    if(typeof renderDnes === 'function' && window.currentView === 'dnes') renderDnes();
  });
}

function fotkyFilter(f){
  f = f || {};
  var out = [];
  Object.keys(window.allFotky || {}).forEach(function(id){
    var x = Object.assign({ id:id }, window.allFotky[id]);
    if(!canAccessStavba(x.stavbaId)) return;
    if(f.stavbaId && x.stavbaId !== f.stavbaId) return;
    if(f.datum    && x.datum    !== f.datum) return;
    if(f.uid      && x.uid      !== f.uid) return;
    if(f.od       && x.datum < f.od) return;
    if(f.do       && x.datum > f.do) return;
    out.push(x);
  });
  out.sort(function(a,b){ return (b.ts||0) - (a.ts||0); });   // nejnovější první
  return out;
}

/* ============================================================================
 * ZMENŠENÍ A RAZÍTKO
 * ========================================================================== */
function _nakresliDoCanvas(img, sirka, kvalita, razitko){
  var w = img.width, h = img.height;
  if(w > sirka){ h = Math.round(h * sirka / w); w = sirka; }
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  if(razitko && razitko.length) _vyraziRazitko(x, w, h, razitko);
  return c.toDataURL('image/jpeg', kvalita);
}

/* Razítko do spodního rohu: co, kde, kdy a kdo. Bez něj je fotka za půl roku
 * k ničemu, protože nikdo neví, odkud je. */
function _vyraziRazitko(x, w, h, radky){
  var pismo = Math.max(13, Math.round(w / 52));
  var mezera = Math.round(pismo * 0.45);
  var vyska = radky.length * (pismo + mezera) + mezera;
  x.font = '600 ' + pismo + 'px -apple-system, Segoe UI, sans-serif';
  var sirka = 0;
  radky.forEach(function(r){ sirka = Math.max(sirka, x.measureText(r).width); });
  sirka += mezera * 2;

  var x0 = mezera, y0 = h - vyska - mezera;
  x.fillStyle = 'rgba(10,14,24,.72)';
  if(x.roundRect){ x.beginPath(); x.roundRect(x0, y0, sirka, vyska, 8); x.fill(); }
  else x.fillRect(x0, y0, sirka, vyska);

  x.fillStyle = '#fff';
  x.textBaseline = 'top';
  radky.forEach(function(r, i){
    x.fillText(r, x0 + mezera, y0 + mezera + i * (pismo + mezera));
  });
}

/* Z vybraného souboru udělá plnou fotku s razítkem i náhled. */
function pripravFoto(file, razitko, hotovo){
  var r = new FileReader();
  r.onload = function(e){
    var img = new Image();
    img.onload = function(){
      var plna = _nakresliDoCanvas(img, FOTO_SIRKA, FOTO_KVALITA, razitko);
      if(plna.length > FOTO_MAX_BAJTU) plna = _nakresliDoCanvas(img, 1000, 0.5, razitko);
      var nahled = _nakresliDoCanvas(img, NAHLED_SIRKA, NAHLED_KVALITA, null);
      hotovo(plna.length > FOTO_MAX_BAJTU ? null : { plna:plna, nahled:nahled });
    };
    img.onerror = function(){ hotovo(null); };
    img.src = e.target.result;
  };
  r.onerror = function(){ hotovo(null); };
  r.readAsDataURL(file);
}

/* ============================================================================
 * FRONTA — vyfocené se nesmí ztratit ani bez signálu
 * ========================================================================== */
var FRONTA_DB = 'pokladky_fronta', FRONTA_SKLAD = 'fotky';
function _frontaOtevri(){
  return new Promise(function(ok, chyba){
    var req = indexedDB.open(FRONTA_DB, 1);
    req.onupgradeneeded = function(e){
      var d = e.target.result;
      if(!d.objectStoreNames.contains(FRONTA_SKLAD)) d.createObjectStore(FRONTA_SKLAD, { keyPath:'id' });
    };
    req.onsuccess = function(e){ ok(e.target.result); };
    req.onerror = function(){ chyba(new Error('fronta nedostupná')); };
  });
}
function _frontaUloz(zaznam){
  return _frontaOtevri().then(function(d){
    return new Promise(function(ok){
      var t = d.transaction(FRONTA_SKLAD, 'readwrite');
      t.objectStore(FRONTA_SKLAD).put(zaznam);
      t.oncomplete = function(){ ok(); };
      t.onerror = function(){ ok(); };
    });
  }).catch(function(){});
}
function _frontaSmaz(id){
  return _frontaOtevri().then(function(d){
    return new Promise(function(ok){
      var t = d.transaction(FRONTA_SKLAD, 'readwrite');
      t.objectStore(FRONTA_SKLAD).delete(id);
      t.oncomplete = function(){ ok(); };
      t.onerror = function(){ ok(); };
    });
  }).catch(function(){});
}
function _frontaVse(){
  return _frontaOtevri().then(function(d){
    return new Promise(function(ok){
      var t = d.transaction(FRONTA_SKLAD, 'readonly');
      var r = t.objectStore(FRONTA_SKLAD).getAll();
      r.onsuccess = function(){ ok(r.result || []); };
      r.onerror = function(){ ok([]); };
    });
  }).catch(function(){ return []; });
}

window._fotoFronta = [];
window._fotoNahravaSe = false;

function zaradFoto(zaznam){
  window._fotoFronta.push(zaznam);
  _frontaUloz(zaznam);
  zobrazFrontuBadge();
  zpracujFrontu();
}
function zpracujFrontu(){
  if(window._fotoNahravaSe) return;
  var z = window._fotoFronta[0];
  if(!z){ zobrazFrontuBadge(); return; }
  window._fotoNahravaSe = true;

  var popis = Object.assign({}, z.popis);
  db.ref('fotky/' + z.id).update(popis)
    .then(function(){ return ulozFotoData(z.id, z.plna, z.nahled); })
    .then(function(){
      window._fotoFronta.shift();
      _frontaSmaz(z.id);
      window._fotoNahravaSe = false;
      zobrazFrontuBadge();
      zpracujFrontu();
    })
    .catch(function(){
      window._fotoNahravaSe = false;
      zobrazFrontuBadge();
      setTimeout(zpracujFrontu, 15000);      // zkusíme to znovu, až bude signál
    });
}
function zobrazFrontuBadge(){
  var el = document.getElementById('badge-fronta'); if(!el) return;
  var n = window._fotoFronta.length;
  el.textContent = n;
  el.style.display = n ? 'flex' : 'none';
}
/* Po spuštění appky dohrát, co se minule nestihlo. */
function obnovFrontu(){
  _frontaVse().then(function(zaznamy){
    if(!zaznamy.length) return;
    window._fotoFronta = zaznamy;
    zobrazFrontuBadge();
    showToast('Dohrávám ' + zaznamy.length + ' nenahraných fotek…', 3000);
    zpracujFrontu();
  });
}

/* ============================================================================
 * FOCENÍ
 * ========================================================================== */
function vyfotit(pokladkaId){
  if(!needPerm('foto')) return;
  if(!mojeStavby().length){ showToast('Nejdřív si založ stavbu.'); return; }
  window._fotoProPokladku = pokladkaId || '';
  document.getElementById('foto-input').click();
}
function vybratZTelefonu(){
  if(!needPerm('foto')) return;
  if(!mojeStavby().length){ showToast('Nejdřív si založ stavbu.'); return; }
  window._fotoProPokladku = '';
  document.getElementById('foto-lib-input').click();
}

function fotoVybrano(input){
  var soubory = Array.prototype.slice.call(input.files || []);
  input.value = '';
  if(!soubory.length) return;
  showToast(soubory.length > 1 ? ('Zpracovávám ' + soubory.length + ' fotek…') : 'Zpracovávám fotku…');

  /* Polohu zkusíme získat jednou pro celou dávku. */
  var dejPolohu = new Promise(function(ok){
    if(!navigator.geolocation){ ok(null); return; }
    navigator.geolocation.getCurrentPosition(
      function(p){ ok({ lat:p.coords.latitude, lng:p.coords.longitude }); },
      function(){ ok(null); },
      { enableHighAccuracy:true, timeout:8000, maximumAge:30000 });
  });

  dejPolohu.then(function(poloha){
    soubory.forEach(function(f){ _zpracujJednu(f, poloha); });
  });
}

function _zpracujJednu(file, poloha){
  var d = new Date();
  var stavba = aktivniStavba();
  var kmText = '';
  if(poloha && stavba){
    var km = stavbaKm(stavba, poloha.lat, poloha.lng);
    if(km && km.odchylka < 200) kmText = 'km ' + fmtNum(km.m/1000, 3).replace(/\s/g,'');
  }
  var razitko = [
    (stavba ? stavba.nazev : '') + (kmText ? '  ·  ' + kmText : ''),
    czDate(ymd(d)) + '  ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') +
      '  ·  ' + ((window.currentUser||{}).name || '')
  ].filter(function(r){ return r.trim(); });

  pripravFoto(file, razitko, function(v){
    if(!v){ showToast('Fotku se nepodařilo zpracovat. Zkus ji vyfotit znovu.', 5000); return; }
    var id = 'f' + newId();
    zaradFoto({
      id: id, plna: v.plna, nahled: v.nahled,
      popis: {
        stavbaId: window.activeStavbaId,
        pokladkaId: window._fotoProPokladku || null,
        datum: ymd(d),
        cas: String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'),
        km: (poloha && stavba && stavbaKm(stavba, poloha.lat, poloha.lng)) ?
            +(stavbaKm(stavba, poloha.lat, poloha.lng).m/1000).toFixed(3) : null,
        lat: poloha ? +poloha.lat.toFixed(6) : null,
        lng: poloha ? +poloha.lng.toFixed(6) : null,
        uid: myUid(), author: (window.currentUser||{}).name || '',
        ts: Date.now()
      }
    });
  });
}

/* ============================================================================
 * GALERIE
 * ========================================================================== */
window._galFiltr = {};

function openGalerie(){
  if(!needPerm('foto')) return;
  openModal('foto-modal');
  renderGalerie();
  document.querySelector('#foto-modal .modal-box').scrollTop = 0;
}
function galFiltr(pole, hodnota){
  if(hodnota) window._galFiltr[pole] = hodnota; else delete window._galFiltr[pole];
  renderGalerie();
}

function renderGalerie(){
  var f = Object.assign({}, window._galFiltr);
  if(!seesAllStavby() && !f.stavbaId) f.stavbaId = window.activeStavbaId;
  var fotky = fotkyFilter(f);
  var h = '';

  /* Filtry */
  h += '<div class="mrizka-2">' +
       pole('Stavba', '<select class="f" onchange="galFiltr(\'stavbaId\', this.value)">' +
         '<option value="">všechny</option>' +
         mojeStavby().map(function(s){
           return '<option value="' + s.id + '"' + (f.stavbaId === s.id ? ' selected' : '') + '>' +
                  escapeHtml(s.nazev) + '</option>'; }).join('') + '</select>') +
       pole('Den', '<input class="f" type="date" value="' + escapeHtml(window._galFiltr.datum||'') +
         '" onchange="galFiltr(\'datum\', this.value)">') + '</div>';

  h += '<div class="stitky" style="margin-bottom:14px">' +
       '<span class="stitek"><b>' + fotky.length + '</b> fotek</span>' +
       (Object.keys(window._galFiltr).length
         ? '<button class="stitek" style="cursor:pointer;font-family:inherit" onclick="window._galFiltr={};renderGalerie()">zrušit filtr</button>' : '') +
       '</div>';

  if(!fotky.length){
    h += '<div class="karta"><div class="prazdno">Zatím tu nejsou žádné fotky.</div></div>';
  } else {
    var poslDatum = '';
    fotky.forEach(function(x, i){
      if(x.datum !== poslDatum){
        if(poslDatum) h += '</div>';
        poslDatum = x.datum;
        h += '<div class="sekce"><span class="sekce-t">' + escapeHtml(czDateShort(x.datum)) + '</span></div>' +
             '<div class="foto-mrizka">';
      }
      h += '<div class="foto-dlazdice" data-foto="' + x.id + '" onclick="otevriFoto(\'' + x.id + '\')">' +
           '<div class="foto-nacitam"></div></div>';
    });
    h += '</div>';
  }

  h += '<div class="lista-dole"><div class="rada">' +
       '<button class="btn btn-hlavni" onclick="vyfotit()">' + ico('foto',17) + '<span>Vyfotit</span></button>' +
       '<button class="btn" onclick="vybratZTelefonu()">' + ico('galerie',17) + '<span>Z telefonu</span></button>' +
       '</div></div>';

  document.getElementById('foto-seznam').innerHTML = h;
  _nactiViditelneNahledy();
}

/* Náhledy se stahují, teprve až na ně člověk doroluje. Jinak by otevření
 * galerie stáhlo všechno naráz a snědlo bezplatný limit přenosu. */
function _nactiViditelneNahledy(){
  var dlazdice = document.querySelectorAll('.foto-dlazdice[data-foto]');
  if(!window.IntersectionObserver){
    dlazdice.forEach(function(d){ _nactiNahledDo(d); });
    return;
  }
  if(window._galObs) window._galObs.disconnect();
  window._galObs = new IntersectionObserver(function(zaznamy){
    zaznamy.forEach(function(z){
      if(!z.isIntersecting) return;
      _nactiNahledDo(z.target);
      window._galObs.unobserve(z.target);
    });
  }, { rootMargin:'300px' });
  dlazdice.forEach(function(d){ window._galObs.observe(d); });
}
function _nactiNahledDo(el){
  var id = el.getAttribute('data-foto'); if(!id || el.dataset.hotovo) return;
  el.dataset.hotovo = '1';
  nactiFotoNahled(id).then(function(data){
    if(!data){ el.innerHTML = '<div class="foto-chybi">?</div>'; return; }
    el.innerHTML = '<img src="' + data + '" alt="" loading="lazy">';
  }).catch(function(){ el.innerHTML = '<div class="foto-chybi">?</div>'; });
}

/* ── Prohlížeč jedné fotky ──────────────────────────────────────────────── */
window._fsSeznam = []; window._fsIndex = 0;

function otevriFoto(id){
  var f = Object.assign({}, window._galFiltr);
  if(!seesAllStavby() && !f.stavbaId) f.stavbaId = window.activeStavbaId;
  window._fsSeznam = fotkyFilter(f).map(function(x){ return x.id; });
  window._fsIndex = Math.max(0, window._fsSeznam.indexOf(id));
  document.getElementById('foto-fs').style.display = 'flex';
  _vykresliFs();
}
function zavriFoto(){ document.getElementById('foto-fs').style.display = 'none'; }
function fsPosun(n){
  window._fsIndex = (window._fsIndex + n + window._fsSeznam.length) % window._fsSeznam.length;
  _vykresliFs();
}
function _vykresliFs(){
  var id = window._fsSeznam[window._fsIndex];
  var x = window.allFotky[id] || {};
  var obraz = document.getElementById('foto-fs-img');
  obraz.innerHTML = '<div class="prazdno">Načítám fotku…</div>';
  document.getElementById('foto-fs-popis').innerHTML =
    '<div><b>' + escapeHtml(stavbaNazev(x.stavbaId)) + '</b>' +
    (x.km ? ' <span class="tichy-2">· km ' + fmtNum(x.km,3).replace(/\s/g,'') + '</span>' : '') + '</div>' +
    '<div class="maly tichy">' + escapeHtml(czDate(x.datum) + ' ' + (x.cas||'') + ' · ' + (x.author||'')) + '</div>' +
    '<div class="maly tichy-2">' + (window._fsIndex+1) + ' / ' + window._fsSeznam.length + '</div>';
  nactiFotoData(id).then(function(data){
    if(window._fsSeznam[window._fsIndex] !== id) return;    // mezitím se přepnulo jinam
    obraz.innerHTML = data ? '<img src="' + data + '" alt="">' : '<div class="prazdno">Fotka se nenačetla.</div>';
  }).catch(function(){ obraz.innerHTML = '<div class="prazdno">Fotka se nenačetla.</div>'; });
}
function stahniFoto(){
  var id = window._fsSeznam[window._fsIndex];
  var x = window.allFotky[id] || {};
  nactiFotoData(id).then(function(data){
    if(!data){ showToast('Fotka se nenačetla.'); return; }
    var a = document.createElement('a');
    a.href = data;
    a.download = (stavbaNazev(x.stavbaId) + '_' + (x.datum||'') + '_' + (x.cas||'').replace(':','') + '.jpg')
                 .replace(/[^\w.\-]+/g,'_');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });
}
function smazFoto(){
  var id = window._fsSeznam[window._fsIndex];
  var x = window.allFotky[id] || {};
  if(x.uid && x.uid !== myUid() && !seesAllStavby()){
    showToast('Smazat fotku může jen ten, kdo ji vyfotil.', 3600); return;
  }
  if(!confirm('Opravdu smazat tuhle fotku?')) return;
  smazFotoData(id);
  db.ref('fotky/' + id).remove().then(function(){
    zavriFoto(); showToast('Smazáno.');
  });
}
