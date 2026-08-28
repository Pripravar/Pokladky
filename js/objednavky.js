/* ============================================================================
 * POKLÁDKY — js/objednavky.js
 * Objednávka balené a nasazení aut — GENEROVANÉ z karet pokládek.
 *
 * Appka se nesnaží lézt do cizích systémů: udělá tabulku v požadovaném tvaru
 * a nabídne ji zkopírovat, stáhnout nebo poslat mailem tak, jak jsou na ni zvyklí.
 * Na telefonu se místo tabulky sází karty po dnech — jinak by se v ní nedalo číst.
 * ========================================================================== */

window._objMonday = addDays(weekMonday(ymd()), 7);   // výchozí = příští týden
window._objView   = 'balena';

function openObjednavky(){
  if(!needPerm('objednavky')) return;
  openModal('obj-modal');
  renderObjednavky();
  document.querySelector('#obj-modal .modal-box').scrollTop = 0;
}
function objSetView(v){ window._objView = v; renderObjednavky(); }
function objPosun(n){ window._objMonday = addDays(window._objMonday, n*7); renderObjednavky(); }

/* ── Sestavení řádků ────────────────────────────────────────────────────── */
function objRadkyBalena(monday){
  var dny = weekDays(monday);
  return pokladkyFilter({ od:dny[0], do:dny[6] })
    .filter(function(p){ return p.obalovnaId || p.smesId; })
    .map(function(p){
      return { _p:p, _datum:p.datum,
        den:DNY_ZK[ymdToDate(p.datum).getDay()], datum:czDate(p.datum),
        obalovna:cisTitle('obalovny', p.obalovnaId) || '', smes:cisTitle('smesi', p.smesId) || '',
        tuny:p.tunyPlan ? fmtNum(p.tunyPlan,0) : '', stavba:stavbaNazev(p.stavbaId),
        cas:p.casStart || '', auta:p.dopravaAut || '' };
    })
    .sort(function(a,b){ return (a.obalovna + a._datum).localeCompare(b.obalovna + b._datum, 'cs'); });
}
function objRadkyNasazeni(monday){
  var dny = weekDays(monday);
  return pokladkyFilter({ od:dny[0], do:dny[6] })
    .filter(function(p){ return num(p.dopravaAut) > 0; })
    .map(function(p){
      return { _p:p, _datum:p.datum,
        den:DNY_ZK[ymdToDate(p.datum).getDay()], datum:czDate(p.datum),
        dopravce:cisTitle('dopravci', p.dopravceId) || '',
        typ:(p.typAuta === 'osmikolka') ? 'osmikolka' : 'vana',
        pocet:p.dopravaAut || '', stavba:stavbaNazev(p.stavbaId),
        obalovna:cisTitle('obalovny', p.obalovnaId) || '',
        cas:p.casStart || '', tuny:p.tunyPlan ? fmtNum(p.tunyPlan,0) : '' };
    })
    .sort(function(a,b){ return (a._datum + a.dopravce).localeCompare(b._datum + b.dopravce, 'cs'); });
}

var OBJ_SLOUPCE = {
  balena:   [ {k:'den',l:'Den'}, {k:'datum',l:'Datum'}, {k:'obalovna',l:'Obalovna'}, {k:'smes',l:'Směs'},
              {k:'tuny',l:'Tuny'}, {k:'stavba',l:'Stavba'}, {k:'cas',l:'Začátek'}, {k:'auta',l:'Aut'} ],
  nasazeni: [ {k:'den',l:'Den'}, {k:'datum',l:'Datum'}, {k:'dopravce',l:'Dopravce'}, {k:'typ',l:'Typ vozu'},
              {k:'pocet',l:'Počet'}, {k:'stavba',l:'Stavba'}, {k:'obalovna',l:'Obalovna'},
              {k:'cas',l:'Nakládka od'}, {k:'tuny',l:'Tuny'} ]
};
function objRadky(){
  return (window._objView === 'balena') ? objRadkyBalena(window._objMonday) : objRadkyNasazeni(window._objMonday);
}

/* ── Pohled ─────────────────────────────────────────────────────────────── */
function renderObjednavky(){
  var monday = window._objMonday, view = window._objView;
  var radky = objRadky(), cols = OBJ_SLOUPCE[view];
  var h = tydenListaHtml(monday, 'objPosun');

  h += '<div class="segmenty">' +
       '<button class="' + (view==='balena'?'on':'') + '" onclick="objSetView(\'balena\')">' +
         ico('obalovna',16) + '<span>Balená</span></button>' +
       '<button class="' + (view==='nasazeni'?'on':'') + '" onclick="objSetView(\'nasazeni\')">' +
         ico('auto',16) + '<span>Nasazení aut</span></button></div>';

  if(!radky.length){
    h += '<div class="karta"><div class="prazdno">Na tenhle týden zatím není co objednávat.<br>' +
         'Nejdřív naplánuj pokládky v <b>Můj týden</b>.</div></div>';
    document.getElementById('obj-body').innerHTML = h;
    return;
  }

  /* Souhrn */
  h += '<div class="stitky" style="margin-bottom:16px">';
  if(view === 'balena'){
    var podle = {};
    radky.forEach(function(r){
      var o = r.obalovna || '(bez obalovny)';
      podle[o] = (podle[o] || 0) + num(String(r.tuny).replace(/\s/g,''));
    });
    Object.keys(podle).forEach(function(o){
      h += '<span class="stitek">' + escapeHtml(o) + ' <b>' + fmtNum(podle[o],0) + ' t</b></span>';
    });
  } else {
    var celkem = radky.reduce(function(a,r){ return a + num(r.pocet); }, 0);
    h += '<span class="stitek">celkem <b>' + celkem + '</b> vozů za týden</span>';
  }
  h += '</div>';

  h += jeMobil() ? objKartyHtml(radky, view) : objTabulkaHtml(radky, cols);

  h += '<div class="lista-dole"><div class="rada">' +
       '<button class="btn btn-hlavni" onclick="objKopirovat()">' + ico('kopirovat',17) + '<span>Kopírovat</span></button>' +
       '<button class="btn" onclick="objStahnoutCsv()">' + ico('stahnout',17) + '<span>Pro Excel</span></button>' +
       '<button class="btn" onclick="objMail()">' + ico('mail',17) + '<span>E-mail</span></button></div>' +
       '<div class="napoveda" style="margin:12px 0 0">Kopírování vloží tabulku rovnou do Excelu — sloupce se rozdělí samy. ' +
       'Zvýrazněné řádky mají kolizi; vyřeš ji radši před odesláním.</div></div>';

  document.getElementById('obj-body').innerHTML = h;
}

/* Telefon: karty po dnech místo široké tabulky. */
function objKartyHtml(radky, view){
  var podleDne = {};
  radky.forEach(function(r){ (podleDne[r._datum] = podleDne[r._datum] || []).push(r); });
  var h = '';
  Object.keys(podleDne).sort().forEach(function(d){
    var den = podleDne[d];
    var soucet = den.reduce(function(a,r){
      return a + num(String(view === 'balena' ? r.tuny : r.pocet).replace(/\s/g,''));
    }, 0);
    h += '<div class="den-blok"><div class="den-hlava">' +
         '<span class="dh-d' + (d === ymd() ? ' dnes' : '') + '">' + escapeHtml(czDateShort(d)) + '</span>' +
         '<span class="dh-t">' + fmtNum(soucet,0) + (view === 'balena' ? ' t' : ' vozů') + '</span></div>' +
         '<div class="karta karta-plocha">';
    den.forEach(function(r){
      var pl = kolizePokladky(r._p).length;
      h += '<div class="polozka' + (pl ? ' pl' : '') + '" onclick="openPokladka(\'' + r._p.id + '\')">' +
           '<div class="polozka-t">' + escapeHtml(view === 'balena' ? r.tuny + ' t' : r.pocet + '×') + '</div>' +
           '<div class="polozka-telo">' +
             '<div class="polozka-1">' + escapeHtml(view === 'balena' ? (r.smes + ' · ' + r.obalovna) : (r.typ + ' · ' + r.dopravce)) + '</div>' +
             '<div class="polozka-2">' + escapeHtml(r.stavba) + (r.cas ? ' · od ' + escapeHtml(r.cas) : '') + '</div>' +
           '</div>' +
           (pl ? '<span style="color:var(--accent-ink)">' + ico('vystraha',17) + '</span>' : '') +
           '</div>';
    });
    h += '</div></div>';
  });
  return h;
}
function objTabulkaHtml(radky, cols){
  var h = '<div class="tbl-obal"><table class="tbl"><tr>' +
          cols.map(function(c){ return '<th>' + escapeHtml(c.l) + '</th>'; }).join('') + '</tr>';
  radky.forEach(function(r){
    h += '<tr' + (kolizePokladky(r._p).length ? ' class="zly"' : '') + '>' +
         cols.map(function(c){ return '<td>' + escapeHtml(r[c.k] === undefined ? '' : r[c.k]) + '</td>'; }).join('') + '</tr>';
  });
  return h + '</table></div>';
}

/* ── Export ─────────────────────────────────────────────────────────────── */
function objText(sep){
  var cols = OBJ_SLOUPCE[window._objView], radky = objRadky();
  var out = [ cols.map(function(c){ return c.l; }).join(sep) ];
  radky.forEach(function(r){
    out.push(cols.map(function(c){
      var v = String(r[c.k] === undefined ? '' : r[c.k]);
      return (sep === ';' && (v.indexOf(';') !== -1 || v.indexOf('"') !== -1))
        ? '"' + v.replace(/"/g,'""') + '"' : v;
    }).join(sep));
  });
  return out.join('\n');
}
function objNazev(){
  return (window._objView === 'balena' ? 'balena_' : 'nasazeni_') +
         isoWeekKey(window._objMonday).replace('-','_');
}
function objKopirovat(){
  var txt = objText('\t');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt)
      .then(function(){ showToast('Zkopírováno. Vlož do Excelu nebo do mailu.', 3000); })
      .catch(function(){ objKopieFallback(txt); });
  } else objKopieFallback(txt);
}
function objKopieFallback(txt){
  var ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast('Zkopírováno.'); }
  catch(e){ showToast('Kopírování se nepovedlo — vyber text ručně.', 3200); }
  document.body.removeChild(ta);
}
function objStahnoutCsv(){
  var csv = '﻿' + objText(';');                 // BOM, ať Excel pozná diakritiku
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  a.download = objNazev() + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Staženo: ' + objNazev() + '.csv', 3000);
}
function objMail(){
  var jeBalena = (window._objView === 'balena');
  var a = ymdToDate(window._objMonday), b = ymdToDate(addDays(window._objMonday,6));
  var obdobi = a.getDate() + '. ' + (a.getMonth()+1) + '. – ' + b.getDate() + '. ' + (b.getMonth()+1) + '. ' + b.getFullYear();
  var predmet = (jeBalena ? 'Objednávka balené — ' : 'Nasazení vozů — ') + isoWeekKey(window._objMonday) + ' (' + obdobi + ')';
  var telo = (jeBalena ? 'Dobrý den,\n\nposílám objednávku balené na týden ' : 'Dobrý den,\n\nposílám požadavek na nasazení vozů na týden ') +
             obdobi + ':\n\n' + objText('\t') + '\n\nDěkuji.\n';
  location.href = 'mailto:?subject=' + encodeURIComponent(predmet) + '&body=' + encodeURIComponent(telo);
}
