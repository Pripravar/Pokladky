/* ============================================================================
 * POKLÁDKY — js/dnes.js
 * Úvodní obrazovka „Dnešek" a nabídka „Více".
 *
 * Záměrně NENÍ vstupním bodem mapa (jako u aplikací staveb), ale DEN.
 * Mistr na pokládce potřebuje vidět: co se dnes pokládá, kde, kolik tun,
 * s kým — a mít po ruce tlačítka, která během směny opravdu použije.
 * ========================================================================== */

function renderDnes(){
  var el = document.getElementById('view-dnes'); if(!el) return;
  var dnes = ymd(), d = new Date(), h = '';

  h += '<div class="nadpis-den">' +
       '<div class="nd-dow">' + DNY_CZ[d.getDay()] + '</div>' +
       '<div class="nd-datum">' + czDate(dnes) + '</div></div>';

  /* Někdo nový čeká na schválení — dokud ho admin nepustí dál, nedostane se nikam.
     Proto to nesmí být schované v nabídce, ale rovnou na úvodní obrazovce. */
  var ceka = (typeof pocetCekajicich === 'function') ? pocetCekajicich() : 0;
  if(ceka){
    h += '<div class="karta klik" style="border-color:rgba(240,165,63,.5);background:var(--warn-soft)" ' +
         'onclick="openSprava()">' +
         '<div class="udaj" style="color:var(--warn);font-size:14.5px;align-items:center">' +
           ico('vystraha',20) +
           '<span><b>' + ceka + (ceka === 1 ? ' člověk čeká' : (ceka < 5 ? ' lidé čekají' : ' lidí čeká')) +
           ' na schválení.</b><br>Dokud je nepustíš dál, do aplikace se nedostanou.</span>' +
           '<span style="margin-left:auto">' + ico('vpravo',18) + '</span>' +
         '</div></div>';
  }

  /* Průvodce nastavením — dokud appka nemá základ, je tohle to nejužitečnější,
     co na úvodní obrazovce může být. Po naplnění zmizí. */
  var kroky = setupKroky(), zbyva = kroky.filter(function(k){ return !k.hotovo; });
  if(zbyva.length){
    h += '<div class="karta"><div class="karta-t"><span>Než se rozjedeme</span>' +
         '<span class="stitek">' + (kroky.length - zbyva.length) + ' / ' + kroky.length + '</span></div>' +
         '<div style="margin:0 -16px -16px">';
    kroky.forEach(function(k){
      h += '<div class="radek' + (k.hotovo ? ' hotovo' : '') + '" onclick="' + k.akce + '">' +
             '<span class="radek-ico" style="' + (k.hotovo ? 'color:var(--ok)' : '') + '">' +
               ico(k.hotovo ? 'fajfka' : k.ico, 18) + '</span>' +
             '<div class="radek-telo"><div class="radek-t">' + escapeHtml(k.t) + '</div>' +
             '<div class="radek-p">' + escapeHtml(k.s) + '</div></div>' +
             (k.hotovo ? '' : '<span class="radek-sip">' + ico('vpravo',16) + '</span>') +
           '</div>';
    });
    h += '</div></div>';
  }

  /* Dnešní pokládky */
  if(!mojeStavby().length){
    h += '<div class="karta"><div class="prazdno">Zatím nemáš žádnou stavbu.<br>' +
         'Založit ji trvá dvě minuty.</div>' +
         '<button class="btn btn-hlavni btn-siroky" onclick="openNovaStavba()">' +
         ico('plus',17) + '<span>Založit stavbu</span></button></div>';
  } else {
    var dnesni = pokladkyFilter({ datum:dnes });
    var tuny = dnesni.reduce(function(a,p){ return a + num(p.tunyPlan); }, 0);
    h += '<div class="sekce"><span class="sekce-t">Dnešní pokládky</span>' +
         (dnesni.length ? '<span class="stitek"><b>' + fmtNum(tuny,0) + '</b> t</span>' : '') + '</div>';
    if(!dnesni.length){
      h += '<div class="karta"><div class="prazdno">Na dnešek není naplánovaná žádná pokládka.</div>' +
           '<button class="btn btn-siroky" id="btn-nova-pokladka" onclick="openPokladka(\'\',\'' + dnes + '\')">' +
           ico('plus',17) + '<span>Naplánovat pokládku</span></button></div>';
    } else {
      dnesni.forEach(function(p){ h += pokladkaKartaHtml(p, { sStavbou: dnesni.length > 1 || seesAllStavby() }); });
    }
  }

  /* Rychlé akce — to, co se během směny mačká nejčastěji */
  h += '<div class="sekce"><span class="sekce-t">Rychlé akce</span></div><div class="rada-2">' +
       '<button class="btn" id="btn-vazni" onclick="openVazni()">' + ico('vaha',18) + '<span>Vážní lístek</span></button>' +
       rychlaAkce('btn-foto',      'foto',   'Vyfotit',      2) +
       rychlaAkce('btn-dochazka',  'parta',  'Docházka',     2) +
       rychlaAkce('btn-tankovani', 'palivo', 'Tankování',    3) +
       '</div>';

  el.innerHTML = h;
  applyPermsToUI();
}
function rychlaAkce(id, ikona, nazev, faze){
  return '<button class="btn" id="' + id + '" onclick="modulBrzy(\'' + nazev + '\',' + faze + ')">' +
         ico(ikona,18) + '<span>' + nazev + '</span></button>';
}

/* Kroky prvotního nastavení — vyhodnocují se ze skutečného stavu dat. */
function setupKroky(){
  var mam = function(typ){ return cisList(typ).length > 0; };
  return [
    { t:'Založ stavbu', ico:'stavba', s:'Název, začátek a konec úseku v mapě.',
      hotovo: mojeStavby().length > 0, akce:'openNovaStavba()' },
    { t:'Přidej lidi', ico:'osoba', s:'Osazenstvo part — jednorázově, pak se jen vybírá.',
      hotovo: mam('lide'), akce:"openCiselniky('lide')" },
    { t:'Přidej stroje', ico:'stroj', s:'Finišery, válce, frézy, vozy — i se servisními intervaly.',
      hotovo: mam('stroje'), akce:"openCiselniky('stroje')" },
    { t:'Sestav party', ico:'parta', s:'Kdo s kým a na čem jezdí. Tohle šetří nejvíc času.',
      hotovo: mam('party'), akce:"openCiselniky('party')" },
    { t:'Obalovny a směsi', ico:'obalovna', s:'Směsi jdou vložit jedním klepnutím z běžné sady.',
      hotovo: mam('obalovny') && mam('smesi'), akce:"openCiselniky('obalovny')" },
    { t:'Přidej dopravce', ico:'auto', s:'Počty van a osmikolek — appka z nich počítá potřebu aut.',
      hotovo: mam('dopravci'), akce:"openCiselniky('dopravci')" }
  ];
}

/* Zástupná hláška pro moduly, které přijdou v dalších fázích. */
function modulBrzy(nazev, faze){
  showToast('<b>' + escapeHtml(nazev) + '</b><br>Přijde ve fázi ' + faze + '. Teď stavíme plán a dispečink.', 3600);
}

/* ============================================================================
 * NABÍDKA „VÍCE"
 * ========================================================================== */
function renderVice(){
  var el = document.getElementById('view-vice'); if(!el) return;
  var hotove = [
    { id:'btn-ciselniky',  ico:'seznam',   t:'Číselníky',  s:'Lidi, stroje, party, obalovny, směsi, dopravci', a:'openCiselniky()' },
    { id:'btn-nova-stavba2', ico:'stavba', t:'Stavby',     s:'Založit nebo upravit stavbu', a:'openStavbaSwitcher()' },
    { id:'btn-objednavky', ico:'mail',     t:'Objednávky', s:'Balená a nasazení aut na příští týden', a:'openObjednavky()' },
    { id:'btn-vazni2',     ico:'vaha',     t:'Vážní lístky', s:'Kolik tun se skutečně navezlo', a:'openVazni()' },
    { id:'btn-sprava',     ico:'parta',    t:'Správa uživatelů', s:'Role, práva, přístup ke stavbám', a:'openSprava()' }
  ];
  var chystane = [
    { ico:'galerie',   t:'Fotky',          s:'Galerie po stavbách', f:2 },
    { ico:'palivo',    t:'Tankování a servisy', s:'Motohodiny, intervaly, upozornění', f:3 },
    { ico:'penize',    t:'Drobná vydání',  s:'Limit na stavbyvedoucího', f:4 },
    { ico:'material',  t:'Spotřební materiál', s:'Rukavice, spreje, pásky…', f:4 },
    { ico:'lekarna',   t:'Úrazy',          s:'Interaktivní formulář', f:4 },
    { ico:'laborator', t:'KZP, TePř a zkoušky', s:'Objednávání laboratoře', f:5 }
  ];

  var h = '<div class="sekce"><span class="sekce-t">Aplikace</span></div><div class="karta karta-plocha">';
  hotove.forEach(function(p){
    h += '<div class="radek" id="' + p.id + '" onclick="' + p.a + '">' +
         '<span class="radek-ico">' + ico(p.ico,19) + '</span>' +
         '<div class="radek-telo"><div class="radek-t">' + escapeHtml(p.t) + '</div>' +
         '<div class="radek-p">' + escapeHtml(p.s) + '</div></div>' +
         '<span class="radek-sip">' + ico('vpravo',16) + '</span></div>';
  });
  h += '</div>';

  h += '<div class="sekce"><span class="sekce-t">Chystá se</span></div><div class="karta karta-plocha">';
  chystane.forEach(function(p){
    h += '<div class="radek" onclick="modulBrzy(\'' + p.t + '\',' + p.f + ')">' +
         '<span class="radek-ico" style="opacity:.5">' + ico(p.ico,19) + '</span>' +
         '<div class="radek-telo"><div class="radek-t" style="color:var(--text-2)">' + escapeHtml(p.t) + '</div>' +
         '<div class="radek-p">' + escapeHtml(p.s) + '</div></div>' +
         '<span class="stitek">fáze ' + p.f + '</span></div>';
  });
  h += '</div>';

  h += '<div class="sekce"><span class="sekce-t">Účet</span></div><div class="karta">' +
       '<div class="radek staticky" style="padding:0;border:none;min-height:0">' +
       '<div class="radek-telo"><div class="radek-t">' + escapeHtml((window.currentUser||{}).name || '') + '</div>' +
       '<div class="radek-p">' + escapeHtml(ROLE_LABEL[myRole()] || myRole()) + '</div></div></div>' +
       '<button class="btn btn-s btn-siroky" style="margin-top:14px" onclick="signOutUser()">Odhlásit</button></div>';

  if(isDemoMode()){
    h += '<div class="karta"><div class="karta-t"><span>Zkušební režim</span>' +
         '<span class="stitek varovny">bez přihlášení</span></div>' +
         '<div class="mensi tichy" style="line-height:1.65">Aplikace zatím nemá vlastní databázi, takže se ' +
         'data ukládají jen v tomhle prohlížeči. Všechno jde vyzkoušet, ale kolegové to neuvidí. ' +
         'Po napojení na Firebase se doplní přihlašování a data se začnou sdílet.</div>' +
         '<button class="btn btn-s btn-siroky" style="margin-top:14px" onclick="vymazatDemo()">' +
         ico('kos',16) + '<span>Vymazat zkušební data</span></button></div>';
  }
  el.innerHTML = h;
  applyPermsToUI();
}
function vymazatDemo(){
  if(!confirm('Smazat všechna zkušební data a začít znovu?')) return;
  LocalDB._wipe(); localStorage.removeItem('pokladky_stavba'); location.reload();
}
