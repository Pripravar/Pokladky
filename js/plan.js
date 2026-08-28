/* ============================================================================
 * POKLÁDKY — js/plan.js
 * „Můj týden" — plán pokládek jednoho stavbyvedoucího.
 *
 * Podle konceptu: každý si plní svůj vlastní prázdný týden, ve společném
 * dispečinku se pak ukazují kolize. Tenhle pohled je ta „vlastní" strana.
 * ========================================================================== */

window._planMonday = weekMonday(ymd());

function planPosun(n){ window._planMonday = addDays(window._planMonday, n*7); renderPlan(); }
function planSkok(monday){ window._planMonday = monday; renderPlan(); }

function renderPlan(){
  var el = document.getElementById('view-plan'); if(!el) return;
  if(!hasPerm('plan')){ el.innerHTML = zamcenoHtml('Plán'); return; }
  if(!mojeStavby().length){
    el.innerHTML = '<div class="karta"><div class="prazdno">Nejdřív si založ stavbu.</div>' +
      '<button class="btn btn-hlavni btn-siroky" onclick="openNovaStavba()">' +
      ico('plus',17) + '<span>Nová stavba</span></button></div>';
    return;
  }

  var monday = window._planMonday, dny = weekDays(monday);
  var moje = pokladkyFilter({ od:dny[0], do:dny[6] });
  var h = tydenListaHtml(monday, 'planPosun');

  var tento = weekMonday(ymd()), pristi = addDays(tento, 7);
  h += '<div class="segmenty">' +
       '<button class="' + (monday===tento?'on':'') + '" onclick="planSkok(\'' + tento + '\')">tento týden</button>' +
       '<button class="' + (monday===pristi?'on':'') + '" onclick="planSkok(\'' + pristi + '\')">příští týden</button>' +
       '</div>';

  /* Uzávěrka — objednávky se dělají týden dopředu, ať to nikoho nepřekvapí. */
  if(monday === pristi){
    var hod = doUzaverky(), potvrzen = tydenPotvrzen(monday);
    if(potvrzen){
      h += '<div class="karta" style="border-color:rgba(63,207,142,.35)">' +
           '<div class="udaj" style="color:var(--ok);font-size:14px">' + ico('fajfka',17) +
           '<span>Příští týden máš potvrzený.</span></div></div>';
    } else if(hod > 0){
      h += '<div class="karta" style="border-color:rgba(240,165,63,.35)">' +
           '<div class="udaj" style="font-size:14px">' + ico('hodiny',17) +
           '<span>Do uzávěrky zbývá <b>' + fmtNum(hod,0) + ' h</b> (čtvrtek 12:00). ' +
           'Pak jde objednávka balené a nasazení aut.</span></div>' +
           '<button class="btn btn-ok btn-siroky" style="margin-top:14px" onclick="potvrditTyden(\'' + monday + '\')">' +
           ico('fajfka',17) + '<span>Potvrdit příští týden</span></button></div>';
    } else {
      h += '<div class="karta pozor">' +
           '<div class="udaj" style="color:var(--accent-ink);font-size:14px">' + ico('vystraha',17) +
           '<span><b>Uzávěrka už proběhla.</b> Změny je potřeba domluvit s dispečinkem.</span></div>' +
           '<button class="btn btn-s btn-siroky" style="margin-top:14px" onclick="potvrditTyden(\'' + monday + '\')">Přesto potvrdit</button></div>';
    }
  }

  var tuny = moje.reduce(function(a,p){ return a + num(p.tunyPlan); }, 0);
  var kolizi = moje.filter(function(p){ return kolizePokladky(p).length; }).length;
  h += '<div class="stitky" style="margin-bottom:8px">' +
       '<span class="stitek"><b>' + moje.length + '</b> pokládek</span>' +
       '<span class="stitek"><b>' + fmtNum(tuny,0) + '</b> t</span>' +
       (kolizi ? '<span class="stitek zly">' + ico('vystraha',13) + '<b>' + kolizi + '</b> s kolizí</span>' : '') +
       '</div>';

  var viceStaveb = seesAllStavby() || mojeStavby().length > 1;
  dny.forEach(function(d){
    var den = moje.filter(function(p){ return p.datum === d; });
    var dnesJe = (d === ymd());
    var tunyDne = den.reduce(function(a,p){ return a + num(p.tunyPlan); }, 0);
    h += '<div class="sekce">' +
         '<span class="sekce-t"' + (dnesJe ? ' style="color:var(--accent-ink)"' : '') + '>' +
           escapeHtml(czDateShort(d)) + (dnesJe ? ' · dnes' : '') +
           (tunyDne ? ' <span class="tichy-2">· ' + fmtNum(tunyDne,0) + ' t</span>' : '') + '</span>' +
         '<button class="btn btn-ikona btn-cisty" onclick="openPokladka(\'\',\'' + d + '\')" title="Přidat pokládku">' +
           ico('plus',18) + '</button></div>';
    if(!den.length){
      h += '<div class="karta" style="padding:12px 16px"><span class="mensi tichy-2">volno</span></div>';
    } else {
      den.forEach(function(p){ h += pokladkaKartaHtml(p, { sStavbou: viceStaveb }); });
    }
  });

  h += '<button class="btn btn-hlavni btn-siroky" id="btn-nova-pokladka" style="margin-top:16px" onclick="openPokladka()">' +
       ico('plus',17) + '<span>Nová pokládka</span></button>';
  el.innerHTML = h;
  applyPermsToUI();
}

/* Sdílená lišta pro překlikávání týdnů (plán i dispečink). */
function tydenListaHtml(monday, fnPosun){
  var a = ymdToDate(monday), b = ymdToDate(addDays(monday,6));
  return '<div class="tyden-lista">' +
    '<button class="btn btn-ikona" onclick="' + fnPosun + '(-1)">' + ico('vlevo',20) + '</button>' +
    '<div class="tl-stred"><div class="tl-c">' + isoWeekKey(monday).replace('-W',' · týden ') + '</div>' +
    '<div class="tl-d">' + a.getDate() + '. ' + (a.getMonth()+1) + '. – ' + b.getDate() + '. ' + (b.getMonth()+1) + '. ' + b.getFullYear() + '</div></div>' +
    '<button class="btn btn-ikona" onclick="' + fnPosun + '(1)">' + ico('vpravo',20) + '</button></div>';
}
function zamcenoHtml(co){
  return '<div class="karta"><div class="prazdno">' +
    '<div style="color:var(--text-3);margin-bottom:10px">' + ico('zamek',28) + '</div>' +
    escapeHtml(co) + ' Ti administrátor nepovolil.</div></div>';
}
