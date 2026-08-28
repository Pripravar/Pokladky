/* ============================================================================
 * POKLÁDKY — js/pokladka.js
 * Karta pokládky: JEDNO zadání, ze kterého appka odvodí všechno ostatní.
 *
 * Z jedné vyplněné karty se počítá:
 *   • tuny  (z plochy a tloušťky, nebo obráceně plocha z tun)
 *   • potřebný počet aut (výkon party × doba obrátky / nosnost auta)
 *   • řádek do objednávky balené i do nasazení aut
 *   • řádek do společného týdenního plánu (dispečink)
 * Stavbyvedoucí to tedy nezadává čtyřikrát do čtyř tabulek.
 * ========================================================================== */

window.allPokladky = {};

var POK_STAVY = {
  navrh:      { l:'návrh',        t:'' },
  potvrzeno:  { l:'potvrzeno',    t:'ok' },
  dispecink:  { l:'z dispečinku', t:'varovny' },
  hotovo:     { l:'hotovo',       t:'ok' },
  zruseno:    { l:'zrušeno',      t:'' }
};

function loadPokladky(){
  db.ref('pokladky').on('value', function(snap){
    window.allPokladky = snap.val() || {};
    if(typeof renderDnes === 'function'      && window.currentView === 'dnes')      renderDnes();
    if(typeof renderPlan === 'function'      && window.currentView === 'plan')      renderPlan();
    if(typeof renderDispecink === 'function' && window.currentView === 'dispecink') renderDispecink();
    if(typeof updateKolizeBadge === 'function') updateKolizeBadge();
  });
}

/* Výběr pokládek. Vždy respektuje přístup ke stavbám. */
function pokladkyFilter(f){
  f = f || {};
  var out = [];
  Object.keys(window.allPokladky || {}).forEach(function(id){
    var p = Object.assign({ id:id }, window.allPokladky[id]);
    if(!canAccessStavba(p.stavbaId)) return;
    if(p.stav === 'zruseno' && !f.iZrusene) return;
    if(f.datum    && p.datum !== f.datum) return;
    if(f.stavbaId && p.stavbaId !== f.stavbaId) return;
    if(f.partaId  && p.partaId !== f.partaId) return;
    if(f.od       && p.datum < f.od) return;
    if(f.do       && p.datum > f.do) return;
    out.push(p);
  });
  out.sort(function(a,b){
    if(a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
    return String(a.casStart||'').localeCompare(String(b.casStart||''));
  });
  return out;
}

/* ============================================================================
 * DOPOČTY
 * ========================================================================== */
function tunyZPlochy(plochaM2, tloustkaMm, smesId){
  var s = cisGet('smesi', smesId);
  var oh = (s && num(s.objHmotnost)) || 2.4;
  return num(plochaM2) * (num(tloustkaMm)/1000) * oh;
}
function plochaZTun(tuny, tloustkaMm, smesId){
  var s = cisGet('smesi', smesId);
  var oh = (s && num(s.objHmotnost)) || 2.4;
  var t = num(tloustkaMm)/1000;
  return (t > 0 && oh > 0) ? num(tuny) / (t * oh) : 0;
}

/* Návrh počtu aut. Vrací i mezivýsledky, ať je vidět, z čeho číslo vzniklo —
 * je to jen NÁVRH, poslední slovo má vždy stavbyvedoucí. */
var KOEF_SILNICE  = 1.3;   // vzdušná čára → skutečná délka po silnici
var RYCHLOST_KMH  = 50;    // průměr plné a prázdné jízdy
var NAKLADKA_H    = 0.25;  // 15 min na obalovně
var VYKLADKA_H    = 0.20;  // 12 min u finišeru
var VYKON_DEFAULT = 60;    // t/h, když parta nemá vyplněný výkon

function navrhAut(p){
  var out = { auta:null, duvod:'' };
  var obalovna = cisGet('obalovny', p.obalovnaId);
  var stavba   = window.allStavby[p.stavbaId];
  if(!obalovna || !obalovna.lat){ out.duvod = 'obalovna nemá zadanou polohu'; return out; }
  if(!stavba || !stavba.osa || !(stavba.osa.body||[]).length){ out.duvod = 'stavba nemá zakreslenou osu'; return out; }

  var parta   = cisGet('party', p.partaId);
  var vykon   = (parta && num(parta.vykonTh)) || VYKON_DEFAULT;
  var doprava = cisGet('dopravci', p.dopravceId);
  var osmi    = (p.typAuta === 'osmikolka');
  var nosnost = doprava ? num(osmi ? doprava.nosnostOsmikolka : doprava.nosnostVana) : 0;
  if(!nosnost) nosnost = osmi ? 16 : 24;

  var vzdalKm = haversine(stavba.osa.body[0], [num(obalovna.lat), num(obalovna.lng)]) / 1000 * KOEF_SILNICE;
  var jizdaH  = vzdalKm / RYCHLOST_KMH;
  var cyklusH = 2*jizdaH + NAKLADKA_H + VYKLADKA_H;

  out.auta        = Math.max(1, Math.ceil(vykon * cyklusH / nosnost));
  out.vzdalKm     = vzdalKm;
  out.jizdaMin    = jizdaH * 60;
  out.cyklusMin   = cyklusH * 60;
  out.vykon       = vykon;
  out.nosnost     = nosnost;
  out.vykonZParty = !!(parta && num(parta.vykonTh));
  return out;
}

/* ============================================================================
 * KARTA V SEZNAMU
 * ========================================================================== */
function pokladkaKartaHtml(p, opts){
  opts = opts || {};
  var st = POK_STAVY[p.stav] || POK_STAVY.navrh;
  var kolize = (typeof kolizePokladky === 'function') ? kolizePokladky(p) : [];
  var usek = (p.usek && p.usek.kmOd !== null && p.usek.kmOd !== undefined && p.usek.kmOd !== '')
    ? 'km ' + fmtNum(p.usek.kmOd,3).replace(/\s/g,'') + (p.usek.kmDo ? ' – ' + fmtNum(p.usek.kmDo,3).replace(/\s/g,'') : '')
    : '';
  var kde = [usek, (p.usek && p.usek.popis) || ''].filter(Boolean).join(' · ');

  var h = '<div class="karta klik' + (kolize.length ? ' pozor' : '') + '" onclick="openPokladka(\'' + p.id + '\')">';

  h += '<div class="karta-t"><span>' + escapeHtml(cisTitle('smesi', p.smesId) || vrstvaLabel(p.vrstva) || 'pokládka') +
       '</span><span class="stitek ' + st.t + '">' + escapeHtml(st.l) + '</span></div>';

  h += '<div class="metriky">' +
       '<div><div class="metrika-h">' + fmtNum(p.tunyPlan,0) + '<span class="jed">t</span></div>' +
       '<div class="metrika-p">' + escapeHtml(vrstvaLabel(p.vrstva) || 'vrstva') + '</div></div>';
  if(p.tloustkaMm) h += '<div><div class="metrika-h">' + fmtNum(p.tloustkaMm,0) + '<span class="jed">mm</span></div><div class="metrika-p">tloušťka</div></div>';
  if(p.plochaM2)   h += '<div><div class="metrika-h">' + fmtNum(p.plochaM2,0) + '<span class="jed">m²</span></div><div class="metrika-p">plocha</div></div>';
  h += '</div>';

  h += '<div class="udaje">';
  if(opts.sStavbou) h += udajHtml('stavba', escapeHtml(stavbaNazev(p.stavbaId)));
  if(kde)           h += udajHtml('misto',  escapeHtml(kde));
  h += udajHtml('parta', escapeHtml(cisTitle('party', p.partaId) || 'parta není vybraná'));
  h += udajHtml('obalovna', escapeHtml(cisTitle('obalovny', p.obalovnaId) || 'obalovna není vybraná'));
  var doprava = [];
  if(p.dopravaAut) doprava.push('<b>' + p.dopravaAut + '×</b> ' + (p.typAuta === 'osmikolka' ? 'osmikolka' : 'vana'));
  if(p.casStart)   doprava.push('od <b>' + escapeHtml(p.casStart) + '</b>');
  if(doprava.length) h += udajHtml('auto', doprava.join(' · '));
  h += '</div>';

  if(kolize.length){
    h += '<div class="vystraha-box">' + ico('vystraha', 16) + '<span>' + escapeHtml(kolize.join(' · ')) + '</span></div>';
  }
  return h + '</div>';
}
function udajHtml(ikona, text){
  return '<div class="udaj">' + ico(ikona, 15) + '<span>' + text + '</span></div>';
}

/* ============================================================================
 * FORMULÁŘ
 * ========================================================================== */
window._pokEditId = '';

function openPokladka(pid, datum){
  if(!needPerm('pokladka')) return;
  window._pokEditId = pid || '';
  window._pok = pid ? Object.assign({ id:pid }, window.allPokladky[pid]) : {
    datum: datum || ymd(), stavbaId: window.activeStavbaId,
    smena:'den', stav:'navrh', typAuta:'vana', casStart:'06:00'
  };
  document.getElementById('pokladka-title').textContent = pid ? 'Úprava pokládky' : 'Nová pokládka';
  renderPokladkaForm();
  openModal('pokladka-modal');
  document.querySelector('#pokladka-modal .modal-box').scrollTop = 0;
}

function renderPokladkaForm(){
  var p = window._pok, h = '';

  /* Kopie minulé — největší úspora času podle konceptu. */
  if(!window._pokEditId){
    var minula = poslednPokladka(p.stavbaId);
    if(minula){
      h += '<button class="btn btn-siroky" style="margin-bottom:16px" onclick="pokladkaJakoMinule()">' +
           ico('kopirovat',17) + '<span>Jako minule — ' +
           escapeHtml([cisTitle('smesi', minula.smesId), cisTitle('party', minula.partaId)].filter(Boolean).join(', ')) +
           '</span></button>';
    }
  }

  h += '<div class="mrizka-2">' +
       pole('Datum *', '<input class="f" type="date" id="pk-datum" value="' + escapeHtml(p.datum||'') + '" onchange="pokUpd()">') +
       pole('Směna', '<select class="f" id="pk-smena" onchange="pokUpd()">' +
         '<option value="den"' + (p.smena==='den'?' selected':'') + '>denní</option>' +
         '<option value="noc"' + (p.smena==='noc'?' selected':'') + '>noční</option></select>') + '</div>';

  h += pole('Stavba *', '<select class="f" id="pk-stavba" onchange="pokUpd()">' +
       mojeStavby().map(function(s){ return '<option value="' + s.id + '"' + (s.id===p.stavbaId?' selected':'') + '>' +
         escapeHtml(s.nazev) + '</option>'; }).join('') + '</select>');

  h += sekce('Co se pokládá');
  h += '<div class="mrizka-2">' +
       pole('Vrstva', '<select class="f" id="pk-vrstva" onchange="pokUpd()"><option value="">— vyber —</option>' +
         VRSTVY.map(function(v){ return '<option value="' + v.k + '"' + (v.k===p.vrstva?' selected':'') + '>' + escapeHtml(v.l) + '</option>'; }).join('') + '</select>') +
       pole('Směs', '<select class="f" id="pk-smes" onchange="pokUpd()">' + cisOptions('smesi', p.smesId) + '</select>') + '</div>';

  h += '<div class="mrizka-3">' +
       pole('Tloušťka mm', '<input class="f" type="number" inputmode="decimal" id="pk-tloustka" value="' + escapeHtml(p.tloustkaMm||'') + '" oninput="pokPrepocetZPlochy()">') +
       pole('Plocha m²',   '<input class="f" type="number" inputmode="decimal" id="pk-plocha" value="' + escapeHtml(p.plochaM2||'') + '" oninput="pokPrepocetZPlochy()">') +
       pole('Tuny',        '<input class="f" type="number" inputmode="decimal" id="pk-tuny" value="' + escapeHtml(p.tunyPlan||'') + '" oninput="pokPrepocetZTun()">') + '</div>';
  h += '<div class="napoveda">Vyplň, co máš po ruce — plochu, nebo rovnou tuny. Druhé číslo si appka dopočítá.</div>';

  h += '<div class="mrizka-2">' +
       pole('Staničení od (km)', '<input class="f" type="number" step="any" inputmode="decimal" id="pk-kmod" value="' + escapeHtml((p.usek&&p.usek.kmOd)||'') + '">') +
       pole('do (km)',          '<input class="f" type="number" step="any" inputmode="decimal" id="pk-kmdo" value="' + escapeHtml((p.usek&&p.usek.kmDo)||'') + '">') + '</div>';
  h += pole('Kde přesně', '<input class="f" id="pk-usekpopis" value="' + escapeHtml((p.usek&&p.usek.popis)||'') + '" placeholder="pravý jízdní pruh, od mostu k obci">');

  h += sekce('Kdo a čím');
  h += pole('Parta', '<select class="f" id="pk-parta" onchange="pokUpd()">' + cisOptions('party', p.partaId) + '</select>');
  var parta = cisGet('party', p.partaId);
  if(parta){
    var lidi = (parta.lide||[]).map(function(i){ return cisTitle('lide', i); }).filter(Boolean);
    var str  = (parta.stroje||[]).map(function(i){ return cisTitle('stroje', i); }).filter(Boolean);
    h += '<div class="udaje" style="border:none;margin:-8px 0 16px;padding:0">' +
         (lidi.length ? udajHtml('osoba', escapeHtml(lidi.join(', '))) : '') +
         (str.length  ? udajHtml('stroj', escapeHtml(str.join(', '))) : '') + '</div>';
  }

  h += sekce('Materiál a doprava');
  h += pole('Obalovna', '<select class="f" id="pk-obalovna" onchange="pokUpd()">' + cisOptions('obalovny', p.obalovnaId) + '</select>');
  h += '<div class="mrizka-2">' +
       pole('Dopravce', '<select class="f" id="pk-dopravce" onchange="pokUpd()">' + cisOptions('dopravci', p.dopravceId) + '</select>') +
       pole('Typ vozu', '<select class="f" id="pk-typauta" onchange="pokUpd()">' +
         '<option value="vana"' + (p.typAuta!=='osmikolka'?' selected':'') + '>vana</option>' +
         '<option value="osmikolka"' + (p.typAuta==='osmikolka'?' selected':'') + '>osmikolka</option></select>') + '</div>';
  h += '<div class="mrizka-2">' +
       pole('Počet aut', '<input class="f" type="number" inputmode="numeric" id="pk-auta" value="' + escapeHtml(p.dopravaAut||'') + '">') +
       pole('Začátek', '<input class="f" type="time" id="pk-cas" value="' + escapeHtml(p.casStart||'06:00') + '">') + '</div>';
  h += '<div id="pk-navrh" style="margin:-8px 0 16px"></div>';

  h += pole('Poznámka', '<textarea class="f" id="pk-poznamka">' + escapeHtml(p.poznamka||'') + '</textarea>');
  h += pole('Stav', '<select class="f" id="pk-stav">' +
       Object.keys(POK_STAVY).map(function(k){ return '<option value="' + k + '"' + ((p.stav||'navrh')===k?' selected':'') + '>' +
         escapeHtml(POK_STAVY[k].l) + '</option>'; }).join('') + '</select>');

  h += '<div class="lista-dole"><div class="rada">' +
       '<button class="btn btn-hlavni" onclick="savePokladka()">' + ico('fajfka',17) + '<span>Uložit</span></button>' +
       '<button class="btn" onclick="closeModal(\'pokladka-modal\')">Zrušit</button></div>';
  if(window._pokEditId){
    h += '<button class="btn btn-cisty btn-nebezpeci btn-siroky btn-s" style="margin-top:8px" onclick="deletePokladka()">' +
         ico('kos',16) + '<span>Smazat pokládku</span></button>';
  }
  h += '</div>';

  document.getElementById('pokladka-body').innerHTML = h;
  pokRenderNavrh();
}
/* Krátké pomůcky, ať se formulář dobře čte. */
function pole(popis, vnitrek){ return '<label class="pole"><span class="popis">' + escapeHtml(popis) + '</span>' + vnitrek + '</label>'; }
function sekce(t){ return '<div class="sekce"><span class="sekce-t">' + escapeHtml(t) + '</span></div>'; }

function pokRead(){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var p = window._pok;
  p.datum      = g('pk-datum');
  p.smena      = g('pk-smena');
  p.stavbaId   = g('pk-stavba');
  p.vrstva     = g('pk-vrstva');
  p.smesId     = g('pk-smes');
  p.tloustkaMm = num(g('pk-tloustka'), null);
  p.plochaM2   = num(g('pk-plocha'), null);
  p.tunyPlan   = num(g('pk-tuny'), null);
  p.usek       = { kmOd:num(g('pk-kmod'), null), kmDo:num(g('pk-kmdo'), null), popis:g('pk-usekpopis') };
  p.partaId    = g('pk-parta');
  p.obalovnaId = g('pk-obalovna');
  p.dopravceId = g('pk-dopravce');
  p.typAuta    = g('pk-typauta');
  p.dopravaAut = num(g('pk-auta'), null);
  p.casStart   = g('pk-cas');
  p.poznamka   = g('pk-poznamka');
  p.stav       = g('pk-stav') || 'navrh';
  return p;
}
function pokUpd(){
  var box = document.querySelector('#pokladka-modal .modal-box');
  var y = box ? box.scrollTop : 0;
  pokRead(); renderPokladkaForm();
  if(box) box.scrollTop = y;                 // ať pod prstem neuskočí formulář
}
function pokPrepocetZPlochy(){
  var p = pokRead();
  if(p.plochaM2 && p.tloustkaMm){
    var t = Math.round(tunyZPlochy(p.plochaM2, p.tloustkaMm, p.smesId));
    document.getElementById('pk-tuny').value = t; window._pok.tunyPlan = t;
  }
  pokRenderNavrh();
}
function pokPrepocetZTun(){
  var p = pokRead();
  if(p.tunyPlan && p.tloustkaMm){
    var m2 = Math.round(plochaZTun(p.tunyPlan, p.tloustkaMm, p.smesId));
    document.getElementById('pk-plocha').value = m2; window._pok.plochaM2 = m2;
  }
  pokRenderNavrh();
}

function pokRenderNavrh(){
  var el = document.getElementById('pk-navrh'); if(!el) return;
  var p = window._pok, n = navrhAut(p);
  if(n.auta === null){
    el.innerHTML = '<div class="napoveda" style="margin:0">Počet aut appka navrhne, jakmile bude ' +
                   escapeHtml(n.duvod) + '.</div>';
    return;
  }
  var hodin = p.tunyPlan ? (num(p.tunyPlan) / n.vykon) : null;
  el.innerHTML =
    '<div class="karta" style="margin:0;background:var(--surface-2)">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="flex:1"><div class="metrika-h">' + n.auta +
          '<span class="jed">' + (p.typAuta==='osmikolka'?'osmikolek':'van') + '</span></div>' +
          '<div class="metrika-p">návrh</div></div>' +
        '<button class="btn btn-s" onclick="pokPouzitNavrh(' + n.auta + ')">' + ico('fajfka',15) + '<span>Použít</span></button>' +
      '</div>' +
      '<div class="udaje maly">' +
        udajHtml('obalovna', fmtNum(n.vzdalKm,0) + ' km · jízda ' + fmtNum(n.jizdaMin,0) + ' min · obrátka <b>' + fmtNum(n.cyklusMin,0) + ' min</b>') +
        udajHtml('stroj', 'výkon ' + fmtNum(n.vykon,0) + ' t/h' + (n.vykonZParty ? '' : ' (odhad — doplň u party)') +
                 ' · nosnost ' + fmtNum(n.nosnost,0) + ' t' + (hodin ? ' · pokládka ~' + fmtNum(hodin,1) + ' h' : '')) +
      '</div>' +
    '</div>';
}
function pokPouzitNavrh(n){
  document.getElementById('pk-auta').value = n;
  window._pok.dopravaAut = n;
  showToast('Doplněno ' + n + ' aut. Můžeš to přepsat.');
}

function poslednPokladka(sid){
  var vse = pokladkyFilter({ stavbaId: sid || window.activeStavbaId });
  return vse.length ? vse[vse.length-1] : null;
}
function pokladkaJakoMinule(){
  var m = poslednPokladka(window._pok.stavbaId); if(!m) return;
  var p = window._pok;
  ['vrstva','smesId','tloustkaMm','partaId','obalovnaId','dopravceId','typAuta','casStart','smena'].forEach(function(k){ p[k] = m[k]; });
  if(m.usek && m.usek.kmDo) p.usek = { kmOd:m.usek.kmDo, kmDo:null, popis:'' };   // navazuje tam, kde minule skončil
  p.plochaM2 = null; p.tunyPlan = null;
  renderPokladkaForm();
  showToast('Převzato z minulé pokládky. Doplň úsek a množství.', 3200);
}

function savePokladka(){
  var p = pokRead();
  if(!p.datum){ showToast('Vyplň datum.'); return; }
  if(!p.stavbaId){ showToast('Vyber stavbu.'); return; }
  if(!p.tunyPlan && !p.plochaM2){ showToast('Vyplň plochu nebo tuny.'); return; }
  var id = window._pokEditId || ('p' + newId());
  var rec = Object.assign({}, p); delete rec.id;
  rec.upravilUid = myUid(); rec.upravilTs = Date.now();
  if(!window._pokEditId){
    rec.vytvorilUid = myUid();
    rec.vytvorilName = (window.currentUser||{}).name || '';
    rec.ts = Date.now();
  }
  db.ref('pokladky/' + id).update(rec);
  closeModal('pokladka-modal');
  showToast('Pokládka uložena.');
}

function deletePokladka(){
  var id = window._pokEditId; if(!id) return;
  var p = window.allPokladky[id] || {};
  if(p.vytvorilUid && p.vytvorilUid !== myUid() && !seesAllStavby()){
    showToast('Smazat ji může jen ten, kdo ji založil, nebo dispečink.', 3200); return;
  }
  if(!confirm('Opravdu smazat tuhle pokládku?')) return;
  db.ref('pokladky/' + id).remove();
  closeModal('pokladka-modal');
  showToast('Smazáno.');
}
