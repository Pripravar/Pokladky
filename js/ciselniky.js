/* ============================================================================
 * POKLÁDKY — js/ciselniky.js
 * Firemní číselníky: lidi, stroje, party, obalovny, směsi, dopravci.
 *
 * Proč jsou v appce první: podle konceptu se u pokládky mění jen kde / jaká
 * vrstva / jaká tloušťka / jaká směs / jaká obalovna. Lidi, stroje a party
 * zůstávají stejné. Jakmile je má appka v číselníku, zadání pokládky je pár
 * klepnutí místo přepisování stále stejných údajů.
 *
 * Číselníky jsou SDÍLENÉ napříč stavbami (jsou firemní, ne per-stavba).
 * ========================================================================== */

window.ciselniky = { lide:{}, stroje:{}, party:{}, obalovny:{}, smesi:{}, dopravci:{} };

var STROJ_TYPY = ['finišer','válec','fréza','nakladač','vůz (vana)','vůz (osmikolka)',
                  'osobní auto','postřikovač','kropička','jiné'];
var VRSTVY = [
  { k:'obrusna',    l:'obrusná' },
  { k:'lozni',      l:'ložní' },
  { k:'podkladni',  l:'podkladní' },
  { k:'vyrovnavka', l:'vyrovnávka' },
  { k:'sanace',     l:'sanace' }
];
/* Zpětná kompatibilita: dřív tu byla „ložisková" a postřik jako vrstva. */
var VRSTVY_STARE = { loziska:'lozni', postrik:'' };
function vrstvaKlic(k){ return (VRSTVY_STARE[k] !== undefined) ? VRSTVY_STARE[k] : k; }
function vrstvaLabel(k){
  k = vrstvaKlic(k);
  var v = VRSTVY.filter(function(x){ return x.k===k; })[0];
  return v ? v.l : (k||'');
}

/* ── Definice číselníků ─────────────────────────────────────────────────
 * Jeden popis → seznam, formulář, import i našeptávání. Přidat pole = přidat
 * řádek sem, nikam jinam sahat netřeba. */
var CIS_DEFS = {
  lide: {
    ico:'osoba', nazev:'Lidé', jedn:'osoba',
    fields:[
      { k:'jmeno',   l:'Jméno a příjmení', req:true },
      { k:'profese', l:'Profese',          hint:'finišerista, řidič válce, dlaždič…', navrh:true },
      { k:'tel',     l:'Telefon',          type:'tel' },
      { k:'osCislo', l:'Osobní číslo' }
    ],
    title:function(r){ return r.jmeno; },
    sub:  function(r){ return [r.profese, r.tel].filter(Boolean).join(' · '); }
  },
  stroje: {
    ico:'stroj', nazev:'Stroje a auta', jedn:'stroj',
    fields:[
      { k:'nazev',             l:'Název',                  req:true, hint:'Vögele S1800, Hamm HD+ 90…' },
      { k:'typ',               l:'Typ',                    sel:STROJ_TYPY },
      { k:'spz',               l:'SPZ / evidenční číslo' },
      { k:'mth',               l:'Stav motohodin',         type:'number' },
      { k:'servisIntervalMth', l:'Servisní interval (mth)',type:'number', hint:'např. 500' },
      { k:'posledniServisMth', l:'Servis naposledy při (mth)', type:'number' },
      { k:'posledniServisDatum', l:'Datum posledního servisu', type:'date' }
    ],
    title:function(r){ return r.nazev; },
    sub:  function(r){ return [r.typ, r.spz, (r.mth ? fmtNum(r.mth,0)+' mth' : '')].filter(Boolean).join(' · '); }
  },
  party: {
    ico:'parta', nazev:'Party (čety)', jedn:'parta',
    fields:[
      { k:'nazev',     l:'Název party', req:true, hint:'Parta 1 – Novák' },
      { k:'vedouciId', l:'Vedoucí (mistr)', ref:'lide' },
      { k:'lide',      l:'Osazenstvo',  multi:'lide' },
      { k:'stroje',    l:'Stroje party', multi:'stroje' }
    ],
    title:function(r){ return r.nazev; },
    sub:  function(r){
      var n = (r.lide||[]).length, s = (r.stroje||[]).length;
      return [ cisTitle('lide', r.vedouciId), n ? n+' lidí' : '', s ? s+' strojů' : '' ]
             .filter(Boolean).join(' · ');
    }
  },
  obalovny: {
    ico:'obalovna', nazev:'Obalovny', jedn:'obalovna',
    fields:[
      { k:'nazev',        l:'Název / místo', req:true },
      { k:'poloha',       l:'Poloha',        mapa:true },
      { k:'kapacitaTden', l:'Denní kapacita pro nás (t)', type:'number', hint:'nad ni appka hlásí kolizi' },
      { k:'kontakt',      l:'Kontakt (telefon, e-mail)' }
    ],
    title:function(r){ return r.nazev; },
    sub:  function(r){ return [ (r.lat ? 'na mapě' : 'bez polohy'),
                                r.kapacitaTden ? fmtNum(r.kapacitaTden,0)+' t/den' : '' ].filter(Boolean).join(' · '); }
  },
  smesi: {
    ico:'smes', nazev:'Směsi', jedn:'směs',
    fields:[
      { k:'kod',          l:'Označení',  req:true, hint:'ACO 11+, ACL 16+, ACP 22+…' },
      { k:'vrstva',       l:'Vrstva',    sel:VRSTVY.map(function(v){ return v.l; }) },
      { k:'objHmotnost',  l:'Objemová hmotnost (t/m³)', type:'number', hint:'obvykle 2,4 – slouží k přepočtu m² na tuny' },
      { k:'tloustkaMin',  l:'Tloušťka od (mm)', type:'number' },
      { k:'tloustkaMax',  l:'Tloušťka do (mm)', type:'number' }
    ],
    title:function(r){ return r.kod; },
    sub:  function(r){ return [ r.vrstva, r.objHmotnost ? fmtNum(r.objHmotnost,2)+' t/m³' : '',
                                (r.tloustkaMin||r.tloustkaMax) ? (r.tloustkaMin||'?')+'–'+(r.tloustkaMax||'?')+' mm' : ''
                              ].filter(Boolean).join(' · '); }
  },
  dopravci: {
    ico:'auto', nazev:'Dopravci', jedn:'dopravce',
    fields:[
      { k:'nazev',            l:'Dopravce',  req:true },
      { k:'kontakt',          l:'Kontakt' },
      { k:'pocetVan',         l:'Počet van',        type:'number' },
      { k:'nosnostVana',      l:'Nosnost vany (t)', type:'number', hint:'obvykle 24' },
      { k:'pocetOsmikolek',   l:'Počet osmikolek',  type:'number' },
      { k:'nosnostOsmikolka', l:'Nosnost osmikolky (t)', type:'number', hint:'obvykle 16' }
    ],
    title:function(r){ return r.nazev; },
    sub:  function(r){ return [ r.pocetVan ? r.pocetVan+'× vana' : '',
                                r.pocetOsmikolek ? r.pocetOsmikolek+'× osmikolka' : '',
                                r.kontakt ].filter(Boolean).join(' · '); }
  }
};
var CIS_ORDER = ['lide','stroje','party','obalovny','smesi','dopravci'];

/* ── Načtení ────────────────────────────────────────────────────────── */
function loadCiselniky(){
  CIS_ORDER.forEach(function(typ){
    db.ref('ciselniky/' + typ).on('value', function(snap){
      window.ciselniky[typ] = snap.val() || {};
      cisFillDatalists();
      if(document.getElementById('cis-modal') &&
         document.getElementById('cis-modal').classList.contains('open')) renderCiselnik();
    });
  });
}

/* ── Čtení ──────────────────────────────────────────────────────────── */
function cisList(typ){
  var o = window.ciselniky[typ] || {}, def = CIS_DEFS[typ];
  return Object.keys(o).map(function(id){
    var r = Object.assign({}, o[id]); r.id = id; return r;
  }).filter(function(r){ return r.aktivni !== false; })
    .sort(function(a,b){ return String(def.title(a)||'').localeCompare(String(def.title(b)||''), 'cs'); });
}
function cisGet(typ, id){ var r = (window.ciselniky[typ]||{})[id]; return r ? Object.assign({id:id}, r) : null; }
function cisTitle(typ, id){ var r = cisGet(typ, id); return r ? (CIS_DEFS[typ].title(r) || '') : ''; }

/* Naplní našeptávače (<datalist>) hodnotami, které už někdo zadal. */
function cisFillDatalists(){
  CIS_ORDER.forEach(function(typ){
    (CIS_DEFS[typ].fields || []).forEach(function(f){
      if(!f.navrh) return;
      var dl = document.getElementById('dl-' + typ + '-' + f.k); if(!dl) return;
      var set = {};
      cisList(typ).forEach(function(r){ var v = (r[f.k]||'').trim(); if(v) set[v] = true; });
      dl.innerHTML = Object.keys(set).sort(function(a,b){ return a.localeCompare(b,'cs'); })
        .map(function(v){ return '<option value="' + escapeHtml(v) + '">'; }).join('');
    });
  });
}
/* <option> seznam pro výběr z číselníku — používají ho i ostatní moduly. */
function cisOptions(typ, selected, prazdny){
  var h = '<option value="">' + escapeHtml(prazdny || '— vyber —') + '</option>';
  cisList(typ).forEach(function(r){
    h += '<option value="' + r.id + '"' + (r.id === selected ? ' selected' : '') + '>' +
         escapeHtml(CIS_DEFS[typ].title(r) || '') + '</option>';
  });
  return h;
}

/* ============================================================================
 * UŽIVATELSKÉ ROZHRANÍ
 * ========================================================================== */
window._cisTyp = 'lide';
window._cisEditId = '';

function openCiselniky(typ){
  if(!needPerm('ciselniky')) return;
  window._cisTyp = typ || window._cisTyp;
  cisSetEdit(false);
  openModal('cis-modal');
  renderCiselnik();
}
function cisSwitch(typ){ window._cisTyp = typ; cisSetEdit(false); renderCiselnik(); }

function renderCiselnik(){
  var typ = window._cisTyp, def = CIS_DEFS[typ];
  document.getElementById('cis-tabs').innerHTML = CIS_ORDER.map(function(t){
    var d = CIS_DEFS[t], n = cisList(t).length;
    return '<button class="stitek' + (t === typ ? ' on' : '') + '" onclick="cisSwitch(\'' + t + '\')">' +
           ico(d.ico, 15) + '<span>' + escapeHtml(d.nazev) + '</span>' + (n ? ' <b>' + n + '</b>' : '') + '</button>';
  }).join('');

  var rows = cisList(typ), h = '';
  if(!rows.length){
    h = '<div class="prazdno">Zatím tu nic není.<br>Přidej první položku tlačítkem dole' +
        ((typ === 'smesi' || typ === 'stroje') ? ', nebo použij <b>Vložit běžnou sadu</b>.' : '.') + '</div>';
  }
  rows.forEach(function(r){
    h += '<div class="radek" onclick="cisEdit(\'' + r.id + '\')">' +
           '<span class="radek-ico">' + ico(def.ico, 19) + '</span>' +
           '<div class="radek-telo"><div class="radek-t">' + escapeHtml(def.title(r) || '(bez názvu)') + '</div>' +
           '<div class="radek-p">' + escapeHtml(def.sub(r) || '') + '</div></div>' +
           '<span class="radek-sip">' + ico('vpravo', 16) + '</span></div>';
  });
  document.getElementById('cis-list').innerHTML = h;
  document.getElementById('cis-add-btn').innerHTML = ico('plus', 17) + '<span>Přidat: ' + escapeHtml(def.jedn) + '</span>';
  document.getElementById('cis-seed-btn').style.display = (typ === 'smesi' || typ === 'stroje') ? '' : 'none';
}

function cisSetEdit(on){
  document.getElementById('cis-browse').style.display = on ? 'none' : '';
  document.getElementById('cis-edit').style.display   = on ? '' : 'none';
}

function cisNew(){ cisEdit(''); }
function cisEdit(id){
  var typ = window._cisTyp, def = CIS_DEFS[typ];
  window._cisEditId = id || '';
  var r = id ? (cisGet(typ, id) || {}) : {};
  var h = '';
  def.fields.forEach(function(f){
    var v = r[f.k];
    h += '<label class="pole"><span class="popis">' + escapeHtml(f.l) + (f.req ? ' *' : '') + '</span>';
    if(f.sel){
      h += '<select class="f" id="cf-' + f.k + '"><option value="">— vyber —</option>' +
           f.sel.map(function(o){ return '<option' + (o === v ? ' selected' : '') + '>' + escapeHtml(o) + '</option>'; }).join('') +
           '</select>';
    } else if(f.ref){
      h += '<select class="f" id="cf-' + f.k + '">' + cisOptions(f.ref, v) + '</select>';
    } else if(f.multi){
      var vybrane = Array.isArray(v) ? v : [];
      var polozky = cisList(f.multi);
      h += '<div class="vyber-box" id="cf-' + f.k + '" data-multi="' + f.multi + '">';
      if(!polozky.length){
        h += '<div class="napoveda" style="margin:0;padding:12px">Nejdřív naplň číselník „' +
             escapeHtml(CIS_DEFS[f.multi].nazev) + '".</div>';
      }
      polozky.forEach(function(p){
        h += '<label><input type="checkbox" value="' + p.id + '"' +
             (vybrane.indexOf(p.id) !== -1 ? ' checked' : '') + '>' +
             escapeHtml(CIS_DEFS[f.multi].title(p) || '') + '</label>';
      });
      h += '</div>';
    } else if(f.mapa){
      h += '<div class="mrizka-2">' +
             '<input class="f" id="cf-lat" placeholder="šířka" value="' + escapeHtml(r.lat===undefined?'':r.lat) + '">' +
             '<input class="f" id="cf-lng" placeholder="délka" value="' + escapeHtml(r.lng===undefined?'':r.lng) + '">' +
           '</div>' +
           '<button class="btn btn-s" style="margin-top:8px" onclick="openMapPick()">' +
           ico('misto',16) + '<span>Vybrat na mapě</span></button>';
    } else {
      h += '<input class="f" id="cf-' + f.k + '" type="' + (f.type || 'text') + '"' +
           (f.type === 'number' ? ' inputmode="decimal" step="any"' : '') +
           (f.navrh ? ' list="dl-' + typ + '-' + f.k + '"' : '') +
           ' value="' + escapeHtml(v===undefined||v===null?'':v) + '"' +
           (f.hint ? ' placeholder="' + escapeHtml(f.hint) + '"' : '') + '>';
      if(f.navrh) h += '<datalist id="dl-' + typ + '-' + f.k + '"></datalist>';
    }
    // Nápověda je u textových polí už jako placeholder — pod polem ji vypisujeme
    // jen tam, kde ji uživatel jinak neuvidí (výběry a seznamy).
    if(f.hint && (f.sel || f.ref || f.multi || f.mapa)){
      h += '<div class="napoveda" style="margin:6px 0 0">' + escapeHtml(f.hint) + '</div>';
    }
    h += '</label>';
  });
  document.getElementById('cis-edit-fields').innerHTML = h;
  document.getElementById('cis-edit-title').textContent = (id ? 'Úprava — ' : 'Nová položka — ') + def.jedn;
  document.getElementById('cis-del').style.display = id ? '' : 'none';
  cisSetEdit(true);
  cisFillDatalists();
}

function cisSave(){
  var typ = window._cisTyp, def = CIS_DEFS[typ], rec = {};
  var chyba = '';
  def.fields.forEach(function(f){
    if(f.mapa){
      var la = document.getElementById('cf-lat').value, ln = document.getElementById('cf-lng').value;
      rec.lat = la === '' ? null : num(la); rec.lng = ln === '' ? null : num(ln);
      return;
    }
    var el = document.getElementById('cf-' + f.k); if(!el) return;
    if(f.multi){
      rec[f.k] = Array.prototype.slice.call(el.querySelectorAll('input:checked')).map(function(c){ return c.value; });
      return;
    }
    var v = (el.value || '').trim();
    if(f.req && !v) chyba = chyba || ('Vyplň: ' + f.l);
    rec[f.k] = (f.type === 'number') ? (v === '' ? null : num(v)) : v;
  });
  if(chyba){ showToast(chyba); return; }
  var id = window._cisEditId || ('c' + newId());
  rec.upravilUid = myUid(); rec.upravilTs = Date.now();
  if(!window._cisEditId) rec.ts = Date.now();
  db.ref('ciselniky/' + typ + '/' + id).update(rec);
  showToast('Uloženo.');
  cisSetEdit(false);
}

function cisDelete(){
  var typ = window._cisTyp, id = window._cisEditId; if(!id) return;
  if(!confirm('Opravdu smazat „' + cisTitle(typ, id) + '" z číselníku?')) return;
  db.ref('ciselniky/' + typ + '/' + id).remove();
  showToast('Smazáno.');
  cisSetEdit(false);
}

/* ── Výběr polohy na mapě (obalovny) ─────────────────────────────────── */
function openMapPick(){
  openModal('mappick-modal');
  if(!window._pickMap){
    window._pickMap = createMap('mappick-map', [49.8, 15.5], 7);
    window._pickMap.on('click', function(e){
      if(window._pickMarker) window._pickMap.removeLayer(window._pickMarker);
      window._pickMarker = L.marker(e.latlng).addTo(window._pickMap);
      window._pickLatLng = [ +e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6) ];
      document.getElementById('mappick-info').textContent =
        'Vybráno: ' + window._pickLatLng[0] + ', ' + window._pickLatLng[1];
    });
  }
  setTimeout(function(){ window._pickMap.invalidateSize(); }, 150);
}
function mapPickConfirm(){
  if(!window._pickLatLng){ showToast('Klepni nejdřív do mapy.'); return; }
  document.getElementById('cf-lat').value = window._pickLatLng[0];
  document.getElementById('cf-lng').value = window._pickLatLng[1];
  closeModal('mappick-modal');
}

/* ============================================================================
 * PŘEDPŘIPRAVENÉ SADY — ať se nemusí ťukat ručně to, co je všude stejné
 * ========================================================================== */
var SEED_SMESI = [
  { kod:'ACO 8',    vrstva:'obrusná',    objHmotnost:2.4, tloustkaMin:25, tloustkaMax:40 },
  { kod:'ACO 11+',  vrstva:'obrusná',    objHmotnost:2.4, tloustkaMin:35, tloustkaMax:50 },
  { kod:'ACO 11 S', vrstva:'obrusná',    objHmotnost:2.4, tloustkaMin:35, tloustkaMax:50 },
  { kod:'ACL 16+',  vrstva:'ložní',  objHmotnost:2.4, tloustkaMin:50, tloustkaMax:70 },
  { kod:'ACL 16 S', vrstva:'ložní',  objHmotnost:2.4, tloustkaMin:50, tloustkaMax:80 },
  { kod:'ACL 22 S', vrstva:'ložní',  objHmotnost:2.4, tloustkaMin:60, tloustkaMax:90 },
  { kod:'ACP 16+',  vrstva:'podkladní',  objHmotnost:2.4, tloustkaMin:50, tloustkaMax:80 },
  { kod:'ACP 22+',  vrstva:'podkladní',  objHmotnost:2.4, tloustkaMin:70, tloustkaMax:110 },
  { kod:'ACP 22 S', vrstva:'podkladní',  objHmotnost:2.4, tloustkaMin:70, tloustkaMax:120 },
  { kod:'VMT 22',   vrstva:'ložní',  objHmotnost:2.4, tloustkaMin:60, tloustkaMax:90 }
];
var SEED_STROJE = [
  { nazev:'Finišer',        typ:'finišer',        servisIntervalMth:500 },
  { nazev:'Válec ocelový',  typ:'válec',          servisIntervalMth:500 },
  { nazev:'Válec pneumatikový', typ:'válec',      servisIntervalMth:500 },
  { nazev:'Fréza',          typ:'fréza',          servisIntervalMth:500 },
  { nazev:'Postřikovač',    typ:'postřikovač',    servisIntervalMth:250 }
];
function cisSeed(){
  var typ = window._cisTyp;
  var sada = (typ === 'smesi') ? SEED_SMESI : (typ === 'stroje') ? SEED_STROJE : null;
  if(!sada) return;
  var stavajici = {};
  cisList(typ).forEach(function(r){ stavajici[deaccent(CIS_DEFS[typ].title(r))] = true; });
  var pridano = 0;
  sada.forEach(function(rec){
    if(stavajici[deaccent(CIS_DEFS[typ].title(rec))]) return;   // nepřidávat, co už tam je
    var kopie = Object.assign({ ts:Date.now() }, rec);
    db.ref('ciselniky/' + typ + '/c' + newId()).update(kopie);
    pridano++;
  });
  showToast(pridano ? ('Přidáno ' + pridano + ' položek.') : 'Vše už v číselníku je.');
}

/* ============================================================================
 * IMPORT Z EXCELU (uloženého jako CSV)
 * Hlavičku páruje podle názvu sloupce bez ohledu na diakritiku a velikost písmen.
 * ========================================================================== */
function cisImportOpen(){
  var typ = window._cisTyp, def = CIS_DEFS[typ];
  document.getElementById('imp-title').textContent = 'Import — ' + def.nazev;
  document.getElementById('imp-cols').innerHTML =
    'V Excelu ulož list jako <b>CSV</b> a vlož ho sem (nebo zkopíruj buňky a vlož je do pole níže).<br>' +
    'Očekávané sloupce: ' + def.fields.filter(function(f){ return !f.multi && !f.mapa; })
      .map(function(f){ return '<b>' + escapeHtml(f.l) + '</b>'; }).join(', ') + '.';
  document.getElementById('imp-text').value = '';
  document.getElementById('imp-preview').innerHTML = '';
  openModal('imp-modal');
}
/* Rozdělí řádek CSV s ohledem na uvozovky. Oddělovač se odhadne z hlavičky. */
function _csvSplit(line, sep){
  var out = [], cur = '', q = false;
  for(var i=0;i<line.length;i++){
    var ch = line[i];
    if(q){
      if(ch === '"' && line[i+1] === '"'){ cur += '"'; i++; }
      else if(ch === '"') q = false;
      else cur += ch;
    } else if(ch === '"') q = true;
    else if(ch === sep){ out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(function(s){ return s.trim(); });
}
function cisImportParse(){
  var typ = window._cisTyp, def = CIS_DEFS[typ];
  var txt = (document.getElementById('imp-text').value || '').replace(/\r/g,'').trim();
  if(!txt){ showToast('Vlož data.'); return; }
  var lines = txt.split('\n').filter(function(l){ return l.trim(); });
  var head = lines[0];
  var sep = (head.split('\t').length > head.split(';').length && head.split('\t').length > head.split(',').length) ? '\t'
          : (head.split(';').length >= head.split(',').length ? ';' : ',');
  var cols = _csvSplit(head, sep).map(deaccent);
  // Sloupec → klíč pole (páruje se podle popisku i podle klíče)
  var mapa = cols.map(function(c){
    var f = def.fields.filter(function(f){
      return !f.multi && !f.mapa &&
             (deaccent(f.l).indexOf(c) === 0 || c.indexOf(deaccent(f.l).split(' ')[0]) === 0 || deaccent(f.k) === c);
    })[0];
    return f ? f.k : null;
  });
  if(!mapa.filter(Boolean).length){ showToast('V hlavičce se nenašel žádný známý sloupec.', 4000); return; }
  var zaznamy = [];
  lines.slice(1).forEach(function(l){
    var v = _csvSplit(l, sep), rec = {}, prazdny = true;
    mapa.forEach(function(k, i){
      if(!k || v[i] === undefined || v[i] === '') return;
      var f = def.fields.filter(function(x){ return x.k === k; })[0];
      rec[k] = (f && f.type === 'number') ? num(v[i]) : v[i];
      prazdny = false;
    });
    if(!prazdny) zaznamy.push(rec);
  });
  window._impZaznamy = zaznamy;
  var nalezene = mapa.filter(Boolean).map(function(k){
    return def.fields.filter(function(f){ return f.k===k; })[0].l; });
  document.getElementById('imp-preview').innerHTML =
    '<div class="mensi" style="margin-top:14px">Rozpoznané sloupce: <b>' + escapeHtml(nalezene.join(', ')) + '</b><br>' +
    'Připraveno k importu: <b>' + zaznamy.length + '</b> řádků.</div>' +
    '<div class="tbl-obal" style="margin-top:10px;max-height:220px;overflow-y:auto"><table class="tbl"><tr>' +
    nalezene.map(function(n){ return '<th>' + escapeHtml(n) + '</th>'; }).join('') + '</tr>' +
    zaznamy.slice(0,8).map(function(r){
      return '<tr>' + mapa.filter(Boolean).map(function(k){
        return '<td>' + escapeHtml(r[k]===undefined?'':r[k]) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</table></div>' +
    (zaznamy.length > 8 ? '<div class="napoveda" style="margin:8px 0 0">…a dalších ' + (zaznamy.length-8) + '</div>' : '');
}
function cisImportRun(){
  var typ = window._cisTyp, def = CIS_DEFS[typ], zaznamy = window._impZaznamy || [];
  if(!zaznamy.length){ showToast('Nejdřív klepni na „Zkontrolovat".'); return; }
  var stavajici = {};
  cisList(typ).forEach(function(r){ stavajici[deaccent(def.title(r))] = r.id; });
  var novych = 0, aktual = 0;
  zaznamy.forEach(function(rec){
    var klic = deaccent(def.title(rec) || '');
    if(!klic) return;
    rec.ts = Date.now();
    if(stavajici[klic]){ db.ref('ciselniky/' + typ + '/' + stavajici[klic]).update(rec); aktual++; }
    else { db.ref('ciselniky/' + typ + '/c' + newId()).update(rec); novych++; }
  });
  closeModal('imp-modal');
  showToast('Nových: ' + novych + ', aktualizovaných: ' + aktual + '.', 4000);
}
