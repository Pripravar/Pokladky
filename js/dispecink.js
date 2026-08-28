/* ============================================================================
 * POKLÁDKY — js/dispecink.js
 * Společný týdenní plán všech staveb + hlídání kolizí.
 *
 * Podle konceptu: každý stavbyvedoucí plní svůj vlastní týden, ve společném
 * pohledu se ukazují kolize, a dispečer je ten, kdo do společného plánu sahá.
 *
 * Rozvržení: na telefonu se sází po DNECH (jeden sloupec, palcem projedeš týden),
 * na širokém displeji mřížka dny × party. Sedmisloupcová tabulka na mobilu nedává
 * smysl — musel by ses v ní posouvat do stran a stejně nic nepřečteš.
 * ========================================================================== */

window._dispMonday = weekMonday(ymd());

/* ── Kolize ─────────────────────────────────────────────────────────────── */
function kolizePokladky(p){
  if(!p || !p.datum || p.stav === 'zruseno') return [];
  var k = [];
  var denni = Object.keys(window.allPokladky || {}).map(function(id){
    return Object.assign({ id:id }, window.allPokladky[id]);
  }).filter(function(x){ return x.datum === p.datum && x.id !== p.id && x.stav !== 'zruseno'; });

  if(p.partaId && denni.some(function(x){ return x.partaId === p.partaId; })){
    k.push('parta 2× v jeden den');
  }
  var moje = cisGet('party', p.partaId);
  if(moje){
    var mojeStroje = moje.stroje || [], mojiLide = moje.lide || [];
    var kolStroj = {}, kolClovek = {};
    denni.forEach(function(x){
      if(!x.partaId || x.partaId === p.partaId) return;
      var jina = cisGet('party', x.partaId); if(!jina) return;
      (jina.stroje||[]).forEach(function(s){ if(mojeStroje.indexOf(s) !== -1) kolStroj[s] = true; });
      (jina.lide||[]).forEach(function(l){ if(mojiLide.indexOf(l) !== -1) kolClovek[l] = true; });
    });
    Object.keys(kolStroj).forEach(function(s){ k.push('stroj ' + (cisTitle('stroje', s) || '?') + ' na dvou místech'); });
    Object.keys(kolClovek).forEach(function(l){ k.push(cisTitle('lide', l) + ' na dvou místech'); });
  }
  if(p.obalovnaId){
    var ob = cisGet('obalovny', p.obalovnaId);
    if(ob && num(ob.kapacitaTden) > 0){
      var suma = num(p.tunyPlan) + denni.filter(function(x){ return x.obalovnaId === p.obalovnaId; })
                                        .reduce(function(a,x){ return a + num(x.tunyPlan); }, 0);
      if(suma > num(ob.kapacitaTden)){
        k.push('obalovna ' + fmtNum(suma,0) + ' t > kapacita ' + fmtNum(ob.kapacitaTden,0) + ' t');
      }
    }
  }
  if(p.dopravceId && p.dopravaAut){
    var d = cisGet('dopravci', p.dopravceId);
    if(d){
      var osmi = (p.typAuta === 'osmikolka');
      var kDispozici = num(osmi ? d.pocetOsmikolek : d.pocetVan);
      if(kDispozici > 0){
        var potreba = num(p.dopravaAut) + denni.filter(function(x){
          return x.dopravceId === p.dopravceId && (x.typAuta === 'osmikolka') === osmi;
        }).reduce(function(a,x){ return a + num(x.dopravaAut); }, 0);
        if(potreba > kDispozici) k.push('potřeba ' + potreba + ' aut, dopravce má ' + kDispozici);
      }
    }
  }
  return k;
}

function kolizeTydne(monday){
  var dny = weekDays(monday), out = [];
  pokladkyFilter({ od:dny[0], do:dny[6] }).forEach(function(p){
    var k = kolizePokladky(p);
    if(k.length) out.push({ p:p, kolize:k });
  });
  return out;
}
function updateKolizeBadge(){
  var el = document.getElementById('badge-kolize'); if(!el) return;
  var n = kolizeTydne(window._dispMonday).length;
  if(n){ el.textContent = n; el.style.display = 'block'; } else { el.style.display = 'none'; }
}

/* ── Potvrzení týdne ────────────────────────────────────────────────────── */
var UZAVERKA_DEN = 4;      // čtvrtek (1 = pondělí)
var UZAVERKA_HOD = 12;

function tydenPotvrzen(monday, uid){
  var t = (window._dispTydny || {})[isoWeekKey(monday)] || {};
  return !!(t.potvrzeno && t.potvrzeno[uid || myUid()]);
}
function potvrditTyden(monday){
  var upd = {}; upd['potvrzeno/' + myUid()] = Date.now();
  db.ref('dispecink/' + isoWeekKey(monday)).update(upd);
  showToast('Týden potvrzen. Dispečink teď vidí, že máš hotovo.', 3200);
}
function loadDispecinkTydny(){
  db.ref('dispecink').on('value', function(snap){
    window._dispTydny = snap.val() || {};
    if(window.currentView === 'dispecink') renderDispecink();
    if(window.currentView === 'plan' && typeof renderPlan === 'function') renderPlan();
  });
}
function doUzaverky(){
  var mondayTento = ymdToDate(weekMonday(ymd()));
  var uz = new Date(mondayTento);
  uz.setDate(uz.getDate() + (UZAVERKA_DEN - 1));
  uz.setHours(UZAVERKA_HOD, 0, 0, 0);
  return (uz - new Date()) / 3600000;
}

/* ============================================================================
 * POHLED
 * ========================================================================== */
function dispPosun(n){ window._dispMonday = addDays(window._dispMonday, n*7); renderDispecink(); updateKolizeBadge(); }

function renderDispecink(){
  var el = document.getElementById('view-dispecink'); if(!el) return;
  if(!hasPerm('dispecink')){ el.innerHTML = zamcenoHtml('Dispečink'); return; }

  var monday = window._dispMonday, dny = weekDays(monday);
  var vsechny = pokladkyFilter({ od:dny[0], do:dny[6] });
  var kolize = kolizeTydne(monday);
  var tuny = vsechny.reduce(function(a,p){ return a + num(p.tunyPlan); }, 0);
  var h = tydenListaHtml(monday, 'dispPosun');

  h += '<div class="stitky" style="margin-bottom:16px">' +
       '<span class="stitek"><b>' + vsechny.length + '</b> pokládek</span>' +
       '<span class="stitek"><b>' + fmtNum(tuny,0) + '</b> t celkem</span>' +
       (kolize.length
         ? '<span class="stitek zly">' + ico('vystraha',13) + '<b>' + kolize.length + '</b> kolizí</span>'
         : '<span class="stitek ok">' + ico('fajfka',13) + 'bez kolizí</span>') + '</div>';

  if(kolize.length){
    h += '<div class="karta karta-plocha pozor">' +
         '<div class="karta-t" style="padding:16px 16px 4px;color:var(--accent-ink)">' +
           '<span>' + ico('vystraha',16) + ' Kolize v týdnu</span></div>';
    kolize.forEach(function(k){
      h += '<div class="radek" onclick="openPokladka(\'' + k.p.id + '\')">' +
             '<div class="radek-telo"><div class="radek-t">' + escapeHtml(czDateShort(k.p.datum)) +
             ' · ' + escapeHtml(stavbaNazev(k.p.stavbaId)) + '</div>' +
             '<div class="radek-p" style="color:var(--accent-ink);white-space:normal">' +
               escapeHtml(k.kolize.join(' · ')) + '</div></div>' +
             '<span class="radek-sip">' + ico('vpravo',16) + '</span></div>';
    });
    h += '</div>';
  }

  h += jeMobil() ? rozvrhPoDnechHtml(dny, vsechny) : rozvrhMrizkaHtml(dny, vsechny);
  h += zatizeniObalovenHtml(dny, vsechny);
  h += potvrzeniTydneHtml(monday);

  h += '<button class="btn btn-hlavni btn-siroky" id="btn-objednavky" style="margin-top:16px" onclick="openObjednavky()">' +
       ico('mail',17) + '<span>Objednávky — balená a nasazení</span></button>';

  el.innerHTML = h;
  applyPermsToUI();
}

/* Telefon: den po dni, uvnitř řádky pokládek. */
function rozvrhPoDnechHtml(dny, vsechny){
  var h = '<div class="sekce"><span class="sekce-t">Rozvrh týdne</span></div>';
  var prazdny = true;
  dny.forEach(function(d){
    var den = vsechny.filter(function(p){ return p.datum === d; });
    if(!den.length) return;
    prazdny = false;
    var tunyDne = den.reduce(function(a,p){ return a + num(p.tunyPlan); }, 0);
    h += '<div class="den-blok"><div class="den-hlava">' +
         '<span class="dh-d' + (d === ymd() ? ' dnes' : '') + '">' + escapeHtml(czDateShort(d)) + '</span>' +
         '<span class="dh-t">' + fmtNum(tunyDne,0) + ' t · ' + den.length + '×</span></div>' +
         '<div class="karta karta-plocha">';
    den.forEach(function(p){
      var pl = kolizePokladky(p).length;
      h += '<div class="polozka' + (pl ? ' pl' : '') + '" onclick="openPokladka(\'' + p.id + '\')">' +
             '<div class="polozka-t">' + fmtNum(p.tunyPlan,0) + ' t</div>' +
             '<div class="polozka-telo">' +
               '<div class="polozka-1">' + escapeHtml(cisTitle('smesi', p.smesId) || vrstvaLabel(p.vrstva) || '—') +
                 ' · ' + escapeHtml(stavbaNazev(p.stavbaId)) + '</div>' +
               '<div class="polozka-2">' + escapeHtml(cisTitle('party', p.partaId) || 'bez party') +
                 (p.casStart ? ' · ' + escapeHtml(p.casStart) : '') + '</div></div>' +
             (pl ? '<span style="color:var(--accent-ink)">' + ico('vystraha',17) + '</span>'
                 : '<span class="radek-sip">' + ico('vpravo',16) + '</span>') +
           '</div>';
    });
    h += '</div></div>';
  });
  if(prazdny) h += '<div class="karta"><div class="prazdno">V tomhle týdnu není naplánovaná žádná pokládka.</div></div>';
  return h;
}

/* Široký displej: mřížka dny × party. */
function rozvrhMrizkaHtml(dny, vsechny){
  var party = cisList('party');
  var h = '<div class="sekce"><span class="sekce-t">Rozdělení po partách</span></div>';
  if(!party.length){
    return h + '<div class="karta"><div class="prazdno">Nejsou založené party.</div>' +
      '<button class="btn btn-s btn-siroky" onclick="openCiselniky(\'party\')">Založit party</button></div>';
  }
  h += '<div class="tbl-obal"><table class="tbl"><tr><th style="min-width:150px">Parta</th>' +
       dny.map(function(d){ return '<th>' + escapeHtml(czDateShort(d)) + '</th>'; }).join('') + '</tr>';
  party.forEach(function(pa){
    h += '<tr><td><b>' + escapeHtml(pa.nazev) + '</b><br><span class="maly tichy-2">' +
         escapeHtml(cisTitle('lide', pa.vedouciId) || '') + '</span></td>';
    dny.forEach(function(d){
      var bunka = vsechny.filter(function(p){ return p.partaId === pa.id && p.datum === d; });
      var pl = bunka.some(function(p){ return kolizePokladky(p).length; });
      h += '<td' + (pl ? ' class="bunka-pl"' : '') + '>';
      if(!bunka.length) h += '<span class="tichy-2">–</span>';
      bunka.forEach(function(p){
        h += '<div style="cursor:pointer;margin-bottom:6px" onclick="openPokladka(\'' + p.id + '\')">' +
             '<b>' + fmtNum(p.tunyPlan,0) + ' t</b> ' + escapeHtml(cisTitle('smesi', p.smesId) || '') +
             '<br><span class="maly tichy-2">' + escapeHtml(stavbaNazev(p.stavbaId)) + '</span></div>';
      });
      h += '</td>';
    });
    h += '</tr>';
  });
  h += '</table></div>';
  var bezParty = vsechny.filter(function(p){ return !p.partaId; });
  if(bezParty.length){
    h += '<div class="napoveda" style="margin-top:10px">' + bezParty.length +
         ' pokládek nemá přiřazenou partu — v mřížce nejsou vidět.</div>';
  }
  return h;
}

/* Zatížení obaloven — na telefonu pruhy, na širokém tabulka po dnech. */
function zatizeniObalovenHtml(dny, vsechny){
  var obal = {};
  vsechny.forEach(function(p){
    if(!p.obalovnaId) return;
    obal[p.obalovnaId] = obal[p.obalovnaId] || {};
    obal[p.obalovnaId][p.datum] = (obal[p.obalovnaId][p.datum] || 0) + num(p.tunyPlan);
  });
  var ids = Object.keys(obal);
  if(!ids.length) return '';
  var h = '<div class="sekce"><span class="sekce-t">Zatížení obaloven</span></div>';

  if(jeMobil()){
    h += '<div class="karta karta-plocha">';
    ids.forEach(function(oid){
      var ob = cisGet('obalovny', oid), kap = ob ? num(ob.kapacitaTden) : 0;
      var maxDen = Math.max.apply(null, dny.map(function(d){ return obal[oid][d] || 0; }));
      var celkem = dny.reduce(function(a,d){ return a + (obal[oid][d] || 0); }, 0);
      var pres = kap && maxDen > kap;
      h += '<div class="radek staticky" style="display:block">' +
           '<div style="display:flex;justify-content:space-between;gap:8px">' +
             '<span class="radek-t">' + escapeHtml(cisTitle('obalovny', oid) || '?') + '</span>' +
             '<span class="mensi' + (pres ? '' : ' tichy') + '"' + (pres ? ' style="color:var(--accent-ink);font-weight:700"' : '') + '>' +
               fmtNum(maxDen,0) + ' t' + (kap ? ' / ' + fmtNum(kap,0) + ' t' : '') + '</span></div>' +
           (kap ? '<div class="pruh' + (pres ? ' pl' : '') + '"><i style="width:' +
                  Math.min(100, Math.round(maxDen/kap*100)) + '%"></i></div>' : '') +
           '<div class="radek-p" style="margin-top:5px">nejvíc za den · za týden ' + fmtNum(celkem,0) + ' t</div></div>';
    });
    return h + '</div>';
  }

  h += '<div class="tbl-obal"><table class="tbl"><tr><th style="min-width:150px">Obalovna</th>' +
       dny.map(function(d){ return '<th>' + escapeHtml(czDateShort(d)) + '</th>'; }).join('') + '</tr>';
  ids.forEach(function(oid){
    var ob = cisGet('obalovny', oid), kap = ob ? num(ob.kapacitaTden) : 0;
    h += '<tr><td><b>' + escapeHtml(cisTitle('obalovny', oid) || '?') + '</b>' +
         (kap ? '<br><span class="maly tichy-2">kapacita ' + fmtNum(kap,0) + ' t</span>' : '') + '</td>';
    dny.forEach(function(d){
      var t = obal[oid][d] || 0, pres = kap && t > kap;
      h += '<td' + (pres ? ' style="color:var(--accent-ink);font-weight:800"' : '') + '>' +
           (t ? fmtNum(t,0) : '<span class="tichy-2">–</span>') + '</td>';
    });
    h += '</tr>';
  });
  return h + '</table></div>';
}

function potvrzeniTydneHtml(monday){
  var t = (window._dispTydny || {})[isoWeekKey(monday)] || {};
  var potv = t.potvrzeno || {};
  var lidi = Object.keys(window.allUsers || {}).filter(function(u){
    var z = window.allUsers[u] || {};
    return z.role === 'stavbyvedouci' && !z.blocked;
  });
  if(!lidi.length) return '';
  var h = '<div class="sekce"><span class="sekce-t">Potvrzení týdne</span></div><div class="karta karta-plocha">';
  lidi.forEach(function(u){
    h += '<div class="radek staticky">' +
         '<span class="stav-tecka ' + (potv[u] ? 'ok' : 'ceka') + '"></span>' +
         '<div class="radek-telo"><div class="radek-t">' + escapeHtml((window.allUsers[u]||{}).name || u) + '</div>' +
         '<div class="radek-p">' + (potv[u] ? 'potvrzeno ' + czDate(ymd(new Date(potv[u]))) : 'zatím nepotvrdil') + '</div></div></div>';
  });
  return h + '</div>';
}
