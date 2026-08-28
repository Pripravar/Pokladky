/* ============================================================================
 * POKLÁDKY — js/vazni.js
 * Vážní lístky: kolik tun a jaké směsi se na stavbu skutečně navezlo.
 *
 * Podle konceptu je smysl v SOUČTU: mistr nasbírá lístky a appka rovnou ukáže,
 * kolik už je navezeno proti plánu pokládky. Ne archiv papírů, ale kontrola.
 *
 * ── Kam se ukládá fotka ─────────────────────────────────────────────────────
 * Firebase Storage vyžaduje u nového projektu placený plán Blaze, který zatím
 * není. Fotka se proto ukládá zmenšená přímo do databáze, ale do ODDĚLENÉHO
 * uzlu `/vazni_foto/{id}`, který se načítá teprve při otevření lístku. Kdyby
 * visela u záznamu, stahovala by se při každém načtení seznamu a bezplatný
 * limit by se vyčerpal během pár dnů.
 *
 * Až bude Blaze, přepne se to na jednom místě — ve funkcích `ulozFotoListku`
 * a `nactiFotoListku`; zbytek modulu zůstane beze změny.
 * ========================================================================== */

window.allVazni = {};

/* Vytěžení údajů z fotky přes AI. Vyžaduje Cloud Functions (plán Blaze).
 * Kód klienta je připravený — až bude nasazená funkce, stačí přepnout na true
 * a doplnit adresu. */
var AI_VAZNI_ENABLED  = false;
var AI_VAZNI_FN_URL   = 'https://europe-west1-pokladky-msilnice.cloudfunctions.net/vytezVazniListek';

/* Meze pro fotku, ať se nevyčerpá bezplatný limit databáze. */
var FOTO_SIRKA_PX  = 1400;   // vážní lístek musí zůstat čitelný
var FOTO_KVALITA   = 0.68;
var FOTO_MAX_BAJTU = 700 * 1024;

function loadVazni(){
  db.ref('vazni_listky').on('value', function(snap){
    window.allVazni = snap.val() || {};
    if(document.getElementById('vazni-modal') &&
       document.getElementById('vazni-modal').classList.contains('open')) renderVazni();
    if(typeof renderDnes === 'function' && window.currentView === 'dnes') renderDnes();
    if(typeof renderPlan === 'function' && window.currentView === 'plan') renderPlan();
  });
}

/* ── Výběr a součty ─────────────────────────────────────────────────────── */
function vazniFilter(f){
  f = f || {};
  var out = [];
  Object.keys(window.allVazni || {}).forEach(function(id){
    var v = Object.assign({ id:id }, window.allVazni[id]);
    if(!canAccessStavba(v.stavbaId)) return;
    if(f.stavbaId   && v.stavbaId   !== f.stavbaId) return;
    if(f.pokladkaId && v.pokladkaId !== f.pokladkaId) return;
    if(f.datum      && v.datum      !== f.datum) return;
    if(f.od         && v.datum < f.od) return;
    if(f.do         && v.datum > f.do) return;
    out.push(v);
  });
  out.sort(function(a,b){
    if(a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;      // nejnovější nahoře
    return String(b.cas||'').localeCompare(String(a.cas||''));
  });
  return out;
}
/* Kolik tun je navezeno na konkrétní pokládku. */
function navezenoNaPokladku(pid){
  return vazniFilter({ pokladkaId:pid }).reduce(function(a,v){ return a + num(v.tuny); }, 0);
}
function pocetListkuPokladky(pid){ return vazniFilter({ pokladkaId:pid }).length; }

/* ── Zmenšení fotky ─────────────────────────────────────────────────────── */
function zmensiFoto(file, hotovo){
  var reader = new FileReader();
  reader.onload = function(e){
    var img = new Image();
    img.onload = function(){
      var w = img.width, h = img.height;
      if(w > FOTO_SIRKA_PX){ h = Math.round(h * FOTO_SIRKA_PX / w); w = FOTO_SIRKA_PX; }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      var data = c.toDataURL('image/jpeg', FOTO_KVALITA);
      if(data.length > FOTO_MAX_BAJTU){                    // druhý pokus, víc zmáčknout
        c.width = Math.round(w * 0.75); c.height = Math.round(h * 0.75);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        data = c.toDataURL('image/jpeg', 0.55);
      }
      hotovo(data.length > FOTO_MAX_BAJTU ? null : data);
    };
    img.onerror = function(){ hotovo(null); };
    img.src = e.target.result;
  };
  reader.onerror = function(){ hotovo(null); };
  reader.readAsDataURL(file);
}

/* Uložení a načtení fotky. Jediné dvě místa, která se mění po přechodu na Blaze. */
function ulozFotoListku(id, dataUrl){ return db.ref('vazni_foto/' + id).set(dataUrl); }
function nactiFotoListku(id){
  return db.ref('vazni_foto/' + id).once('value').then(function(s){ return s.val(); });
}
function smazFotoListku(id){ return db.ref('vazni_foto/' + id).remove(); }

/* ============================================================================
 * PANEL
 * ========================================================================== */
window._vazniHledat = '';
window._vazniEditId = '';
window._vazniFoto   = null;      // připravená fotka k uložení

function openVazni(){
  if(!needPerm('vazni')) return;
  vazniSetEdit(false);
  openModal('vazni-modal');
  renderVazni();
  document.querySelector('#vazni-modal .modal-box').scrollTop = 0;
}
function vazniHledat(v){ window._vazniHledat = v || ''; renderVazni(); }
function vazniSetEdit(on){
  document.getElementById('vazni-seznam').style.display = on ? 'none' : '';
  document.getElementById('vazni-edit').style.display   = on ? '' : 'none';
}

function renderVazni(){
  var vse = vazniFilter({ stavbaId: seesAllStavby() ? null : window.activeStavbaId });
  var hledat = deaccent(window._vazniHledat);
  if(hledat){
    vse = vse.filter(function(v){
      return deaccent([v.cislo, v.spz, cisTitle('smesi', v.smesId), v.smesText,
                       cisTitle('obalovny', v.obalovnaId), v.obalovnaText, v.poznamka]
                      .filter(Boolean).join(' ')).indexOf(hledat) !== -1;
    });
  }
  var h = '';

  /* Dnešek proti plánu — to je ta hlavní informace. */
  var dnes = ymd();
  var dnesniPokladky = (typeof pokladkyFilter === 'function') ? pokladkyFilter({ datum:dnes }) : [];
  if(dnesniPokladky.length){
    h += '<div class="sekce"><span class="sekce-t">Dnešek proti plánu</span></div>';
    dnesniPokladky.forEach(function(p){
      var navezeno = navezenoNaPokladku(p.id), plan = num(p.tunyPlan);
      var pct = plan ? Math.min(100, Math.round(navezeno / plan * 100)) : 0;
      var hotovo = plan && navezeno >= plan;
      h += '<div class="karta">' +
        '<div class="karta-t"><span>' + escapeHtml(cisTitle('smesi', p.smesId) || vrstvaLabel(p.vrstva) || 'pokládka') +
          '</span><span class="stitek' + (hotovo ? ' ok' : '') + '">' + pocetListkuPokladky(p.id) + ' lístků</span></div>' +
        '<div class="metriky"><div><div class="metrika-h">' + fmtNum(navezeno,0) +
          '<span class="jed">t</span></div><div class="metrika-p">navezeno</div></div>' +
          '<div><div class="metrika-h" style="color:var(--text-2)">' + fmtNum(plan,0) +
          '<span class="jed">t</span></div><div class="metrika-p">plán</div></div>' +
          (plan ? '<div><div class="metrika-h" style="color:' + (hotovo ? 'var(--ok)' : 'var(--text)') + '">' +
            (navezeno > plan ? '+' : '') + fmtNum(navezeno - plan, 0) + '<span class="jed">t</span></div>' +
            '<div class="metrika-p">rozdíl</div></div>' : '') + '</div>' +
        (plan ? '<div class="pruh"><i style="width:' + pct + '%' + (hotovo ? ';background:var(--ok)' : '') + '"></i></div>' : '') +
        '<button class="btn btn-s btn-siroky" style="margin-top:12px" onclick="vazniNovy(\'' + p.id + '\')">' +
          ico('plus',16) + '<span>Přidat lístek k této pokládce</span></button>' +
      '</div>';
    });
  }

  h += '<div class="sekce"><span class="sekce-t">Lístky</span>' +
       (vse.length ? '<span class="stitek"><b>' + fmtNum(vse.reduce(function(a,v){ return a+num(v.tuny); },0),0) + '</b> t celkem</span>' : '') +
       '</div>';
  h += '<label class="pole"><input class="f" placeholder="hledat: číslo, SPZ, směs, obalovna" ' +
       'value="' + escapeHtml(window._vazniHledat) + '" oninput="vazniHledat(this.value)"></label>';

  if(!vse.length){
    h += '<div class="karta"><div class="prazdno">' +
         (window._vazniHledat ? 'Nic nenalezeno.' : 'Zatím žádné vážní lístky.') + '</div></div>';
  } else {
    h += '<div class="karta karta-plocha">';
    var poslDatum = '';
    vse.forEach(function(v){
      if(v.datum !== poslDatum){
        poslDatum = v.datum;
        h += '<div style="padding:10px 16px 6px;background:var(--surface-2)">' +
             '<span class="sekce-t">' + escapeHtml(czDateShort(v.datum)) + '</span></div>';
      }
      var smes = cisTitle('smesi', v.smesId) || v.smesText || '—';
      h += '<div class="polozka" onclick="vazniEdit(\'' + v.id + '\')">' +
             '<div class="polozka-t">' + fmtNum(v.tuny,1) + ' t</div>' +
             '<div class="polozka-telo">' +
               '<div class="polozka-1">' + escapeHtml(smes) +
                 (v.cislo ? ' <span class="tichy-2">· č. ' + escapeHtml(v.cislo) + '</span>' : '') + '</div>' +
               '<div class="polozka-2">' +
                 escapeHtml([v.cas, v.spz, cisTitle('obalovny', v.obalovnaId) || v.obalovnaText]
                            .filter(Boolean).join(' · ')) + '</div>' +
             '</div>' +
             (v.maFoto ? '<span class="radek-ico">' + ico('foto',16) + '</span>' : '') +
             '<span class="radek-sip">' + ico('vpravo',16) + '</span></div>';
    });
    h += '</div>';
    h += '<div class="rada" style="margin-top:12px">' +
         '<button class="btn" onclick="vazniExport()">' + ico('stahnout',17) + '<span>Pro Excel</span></button>' +
         '<button class="btn" onclick="vazniKopirovat()">' + ico('kopirovat',17) + '<span>Kopírovat</span></button></div>';
  }

  h += '<div class="lista-dole"><button class="btn btn-hlavni btn-siroky" onclick="vazniNovy()">' +
       ico('plus',17) + '<span>Nový vážní lístek</span></button></div>';

  document.getElementById('vazni-seznam').innerHTML = h;
}

/* ── Formulář ───────────────────────────────────────────────────────────── */
function vazniNovy(pokladkaId){
  if(!needPerm('vazni')) return;
  window._vazniEditId = '';
  window._vazniFoto = null;
  var dnes = ymd();
  var pokladky = (typeof pokladkyFilter === 'function') ? pokladkyFilter({ datum:dnes }) : [];
  var p = pokladkaId ? (window.allPokladky[pokladkaId] || {}) : (pokladky.length === 1 ? pokladky[0] : {});
  window._vazni = {
    stavbaId:   p.stavbaId || window.activeStavbaId,
    pokladkaId: pokladkaId || (pokladky.length === 1 ? pokladky[0].id : ''),
    datum: dnes,
    cas: String(new Date().getHours()).padStart(2,'0') + ':' + String(new Date().getMinutes()).padStart(2,'0'),
    smesId: p.smesId || '', obalovnaId: p.obalovnaId || '', dopravceId: p.dopravceId || ''
  };
  renderVazniForm();
  vazniSetEdit(true);
  document.querySelector('#vazni-modal .modal-box').scrollTop = 0;
}
function vazniEdit(id){
  window._vazniEditId = id;
  window._vazniFoto = null;
  window._vazni = Object.assign({ id:id }, window.allVazni[id] || {});
  renderVazniForm();
  vazniSetEdit(true);
  document.querySelector('#vazni-modal .modal-box').scrollTop = 0;
  if(window._vazni.maFoto){
    nactiFotoListku(id).then(function(d){
      var el = document.getElementById('vazni-nahled');
      if(el && d) el.innerHTML = '<img src="' + d + '" alt="vážní lístek" ' +
        'style="width:100%;border-radius:var(--r-s);border:1px solid var(--line)" ' +
        'onclick="vazniZvetsit(this.src)">';
    });
  }
}
function vazniZvetsit(src){
  var o = document.getElementById('vazni-lupa');
  o.innerHTML = '<img src="' + src + '" style="max-width:100%;max-height:100%;object-fit:contain">';
  o.style.display = 'flex';
}

function renderVazniForm(){
  var v = window._vazni, h = '';
  var pokladky = pokladkyFilter({ datum: v.datum });

  h += '<button class="btn btn-cisty btn-s" style="margin-bottom:12px" onclick="vazniSetEdit(false)">' +
       ico('zpet',16) + '<span>Zpět na seznam</span></button>';

  /* Fotka lístku */
  h += '<div class="sekce"><span class="sekce-t">Fotka lístku</span></div>';
  h += '<div id="vazni-nahled" style="margin-bottom:10px"></div>';
  h += '<div class="rada">' +
       '<button class="btn" onclick="document.getElementById(\'vazni-foto-in\').click()">' +
         ico('foto',17) + '<span>Vyfotit</span></button>' +
       '<button class="btn" onclick="document.getElementById(\'vazni-foto-lib\').click()">' +
         ico('galerie',17) + '<span>Z telefonu</span></button>' +
       (v.maFoto ? '<button class="btn btn-cisty btn-nebezpeci" onclick="vazniSmazFoto()">' +
         ico('kos',16) + '<span>Smazat fotku</span></button>' : '') + '</div>';
  h += '<div class="napoveda" style="margin-top:10px">' +
       (AI_VAZNI_ENABLED
         ? 'Po vyfocení se údaje zkusí načíst samy.'
         : 'Údaje zatím vyplň ručně — automatické čtení z fotky přijde, až bude na Firebase placený plán.') +
       '</div>';

  h += '<div class="sekce"><span class="sekce-t">Údaje z lístku</span></div>';
  h += '<div class="mrizka-2">' +
       pole('Tuny *', '<input class="f" type="number" step="any" inputmode="decimal" id="vz-tuny" value="' + escapeHtml(v.tuny||'') + '">') +
       pole('Číslo lístku', '<input class="f" id="vz-cislo" inputmode="numeric" value="' + escapeHtml(v.cislo||'') + '">') + '</div>';
  h += '<div class="mrizka-2">' +
       pole('Datum', '<input class="f" type="date" id="vz-datum" value="' + escapeHtml(v.datum||ymd()) + '" onchange="vazniUpd()">') +
       pole('Čas', '<input class="f" type="time" id="vz-cas" value="' + escapeHtml(v.cas||'') + '">') + '</div>';
  h += pole('Směs', '<select class="f" id="vz-smes">' + cisOptions('smesi', v.smesId, '— vyber nebo napiš níž —') + '</select>');
  if(!cisList('smesi').length || !v.smesId){
    h += pole('Směs (ručně)', '<input class="f" id="vz-smestext" value="' + escapeHtml(v.smesText||'') + '" placeholder="ACO 11+">');
  }
  h += '<div class="mrizka-2">' +
       pole('SPZ', '<input class="f" id="vz-spz" autocapitalize="characters" value="' + escapeHtml(v.spz||'') + '">') +
       pole('Obalovna', '<select class="f" id="vz-obalovna">' + cisOptions('obalovny', v.obalovnaId) + '</select>') + '</div>';

  h += '<div class="sekce"><span class="sekce-t">Kam patří</span></div>';
  h += pole('Stavba', '<select class="f" id="vz-stavba" onchange="vazniUpd()">' +
       mojeStavby().map(function(s){ return '<option value="' + s.id + '"' + (s.id===v.stavbaId?' selected':'') + '>' +
         escapeHtml(s.nazev) + '</option>'; }).join('') + '</select>');
  h += pole('Pokládka', '<select class="f" id="vz-pokladka"><option value="">— nepřiřazeno —</option>' +
       pokladky.map(function(p){
         return '<option value="' + p.id + '"' + (p.id===v.pokladkaId?' selected':'') + '>' +
           escapeHtml((cisTitle('smesi', p.smesId) || vrstvaLabel(p.vrstva) || 'pokládka') + ' · ' +
                      fmtNum(p.tunyPlan,0) + ' t · ' + stavbaNazev(p.stavbaId)) + '</option>';
       }).join('') + '</select>');
  if(!pokladky.length){
    h += '<div class="napoveda" style="margin-top:-8px">Na tenhle den není naplánovaná žádná pokládka. ' +
         'Lístek se uloží i tak — přiřadit ho půjde později.</div>';
  }
  h += pole('Poznámka', '<textarea class="f" id="vz-poznamka">' + escapeHtml(v.poznamka||'') + '</textarea>');

  h += '<div class="lista-dole"><div class="rada">' +
       '<button class="btn btn-hlavni" onclick="vazniUloz()">' + ico('fajfka',17) + '<span>Uložit</span></button>' +
       '<button class="btn" onclick="vazniSetEdit(false)">Zrušit</button></div>';
  if(window._vazniEditId){
    h += '<button class="btn btn-cisty btn-nebezpeci btn-siroky btn-s" style="margin-top:8px" onclick="vazniSmaz()">' +
         ico('kos',16) + '<span>Smazat lístek</span></button>';
  }
  h += '</div>';
  document.getElementById('vazni-edit').innerHTML = h;
}

function vazniCti(){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var v = window._vazni;
  v.tuny       = num(g('vz-tuny'), null);
  v.cislo      = g('vz-cislo');
  v.datum      = g('vz-datum');
  v.cas        = g('vz-cas');
  v.smesId     = g('vz-smes');
  v.smesText   = g('vz-smestext');
  v.spz        = (g('vz-spz') || '').toUpperCase();
  v.obalovnaId = g('vz-obalovna');
  v.stavbaId   = g('vz-stavba');
  v.pokladkaId = g('vz-pokladka');
  v.poznamka   = g('vz-poznamka');
  return v;
}
function vazniUpd(){
  var box = document.querySelector('#vazni-modal .modal-box'), y = box ? box.scrollTop : 0;
  vazniCti(); renderVazniForm();
  if(box) box.scrollTop = y;
}

function vazniFotoVybrana(input){
  var f = input.files && input.files[0]; if(!f) return;
  showToast('Zpracovávám fotku…');
  zmensiFoto(f, function(data){
    input.value = '';
    if(!data){ showToast('Fotku se nepodařilo zmenšit natolik, aby šla uložit. Zkus ji vyfotit znovu.', 5000); return; }
    window._vazniFoto = data;
    var el = document.getElementById('vazni-nahled');
    if(el) el.innerHTML = '<img src="' + data + '" alt="vážní lístek" ' +
      'style="width:100%;border-radius:var(--r-s);border:1px solid var(--line)" onclick="vazniZvetsit(this.src)">';
    showToast('Fotka připravená. Ulož lístek.');
    if(AI_VAZNI_ENABLED) vazniAiVytez(data);
  });
}
function vazniSmazFoto(){
  if(!confirm('Smazat fotku lístku?')) return;
  window._vazniFoto = null;
  window._vazni.maFoto = false;
  if(window._vazniEditId) smazFotoListku(window._vazniEditId);
  var el = document.getElementById('vazni-nahled'); if(el) el.innerHTML = '';
  renderVazniForm();
}

function vazniUloz(){
  var v = vazniCti();
  if(!v.tuny){ showToast('Vyplň tuny — to je to hlavní, co se z lístku počítá.', 3600); return; }
  if(!v.stavbaId){ showToast('Vyber stavbu.'); return; }
  var id = window._vazniEditId || ('v' + newId());
  var rec = {
    stavbaId:v.stavbaId, pokladkaId:v.pokladkaId || null, datum:v.datum, cas:v.cas,
    cislo:v.cislo, smesId:v.smesId || null, smesText:v.smesText || null, tuny:v.tuny,
    spz:v.spz, obalovnaId:v.obalovnaId || null, poznamka:v.poznamka,
    maFoto: !!(window._vazniFoto || v.maFoto),
    upravilUid: myUid(), upravilTs: Date.now()
  };
  if(!window._vazniEditId){
    rec.uid = myUid(); rec.author = (window.currentUser||{}).name || ''; rec.ts = Date.now();
  }
  db.ref('vazni_listky/' + id).update(rec)
    .then(function(){
      if(window._vazniFoto) return ulozFotoListku(id, window._vazniFoto);
    })
    .then(function(){
      window._vazniFoto = null;
      vazniSetEdit(false);
      showToast('Lístek uložen.');
    })
    .catch(function(e){ showToast('Uložení se nepovedlo: ' + ((e && e.message) || e), 5000); });
}

function vazniSmaz(){
  var id = window._vazniEditId; if(!id) return;
  var v = window.allVazni[id] || {};
  if(v.uid && v.uid !== myUid() && !seesAllStavby()){
    showToast('Smazat lístek může jen ten, kdo ho zapsal.', 3600); return;
  }
  if(!confirm('Opravdu smazat tenhle vážní lístek?')) return;
  smazFotoListku(id);
  db.ref('vazni_listky/' + id).remove()
    .then(function(){ vazniSetEdit(false); showToast('Smazáno.'); });
}

/* ── Vytěžení AI (čeká na plán Blaze) ───────────────────────────────────── */
function vazniAiVytez(dataUrl){
  if(!AI_VAZNI_ENABLED) return;
  showToast('Čtu údaje z lístku…');
  fbAuth.currentUser.getIdToken().then(function(token){
    return fetch(AI_VAZNI_FN_URL, {
      method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + token },
      body: JSON.stringify({ image: dataUrl.split(',')[1], mime:'image/jpeg' })
    });
  }).then(function(r){ return r.json(); }).then(function(o){
    if(!o || !o.ok || !o.fields){ showToast('Z fotky se nic vyčíst nepodařilo, vyplň to ručně.', 4000); return; }
    var f = o.fields;
    ['tuny','cislo','spz','cas','datum'].forEach(function(k){
      var el = document.getElementById('vz-' + k);
      if(el && f[k] && !el.value) el.value = f[k];
    });
    if(f.smes){ var st = document.getElementById('vz-smestext'); if(st && !st.value) st.value = f.smes; }
    showToast('Údaje doplněny — zkontroluj je.', 4000);
  }).catch(function(){ showToast('Čtení z fotky selhalo, vyplň to ručně.', 4000); });
}

/* ── Export ─────────────────────────────────────────────────────────────── */
var VAZNI_SLOUPCE = [
  { k:'datum',    l:'Datum' },   { k:'cas',      l:'Čas' },
  { k:'cislo',    l:'Číslo lístku' }, { k:'smes', l:'Směs' },
  { k:'tuny',     l:'Tuny' },    { k:'spz',      l:'SPZ' },
  { k:'obalovna', l:'Obalovna' },{ k:'stavba',   l:'Stavba' },
  { k:'pokladka', l:'Pokládka' },{ k:'author',   l:'Zapsal' }
];
function vazniRadky(){
  return vazniFilter({ stavbaId: seesAllStavby() ? null : window.activeStavbaId }).map(function(v){
    var p = window.allPokladky[v.pokladkaId] || {};
    return {
      datum: czDate(v.datum), cas: v.cas || '', cislo: v.cislo || '',
      smes: cisTitle('smesi', v.smesId) || v.smesText || '',
      tuny: v.tuny ? fmtNum(v.tuny,1) : '', spz: v.spz || '',
      obalovna: cisTitle('obalovny', v.obalovnaId) || v.obalovnaText || '',
      stavba: stavbaNazev(v.stavbaId),
      pokladka: v.pokladkaId ? ((cisTitle('smesi', p.smesId) || vrstvaLabel(p.vrstva) || '') + ' ' + fmtNum(p.tunyPlan,0) + ' t') : '',
      author: v.author || ''
    };
  });
}
function vazniText(sep){
  var radky = vazniRadky();
  var out = [ VAZNI_SLOUPCE.map(function(c){ return c.l; }).join(sep) ];
  radky.forEach(function(r){
    out.push(VAZNI_SLOUPCE.map(function(c){
      var x = String(r[c.k] === undefined ? '' : r[c.k]);
      return (sep === ';' && (x.indexOf(';') !== -1 || x.indexOf('"') !== -1)) ? '"' + x.replace(/"/g,'""') + '"' : x;
    }).join(sep));
  });
  return out.join('\n');
}
function vazniExport(){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + vazniText(';')], { type:'text/csv;charset=utf-8' }));
  a.download = 'vazni_listky_' + ymd() + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Staženo.');
}
function vazniKopirovat(){
  var txt = vazniText('\t');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ showToast('Zkopírováno — vlož do Excelu.', 3000); })
      .catch(function(){ objKopieFallback(txt); });
  } else objKopieFallback(txt);
}
