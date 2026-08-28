/* ============================================================================
 * POKLÁDKY — js/sprava.js
 * Správa účtů: schvalování nových lidí, role, práva, přístup ke stavbám,
 * blokování a mazání účtů.
 *
 * Stavěno podle osvědčeného vzoru z aplikací staveb, včetně pastí, které tam
 * byly draze zjištěné:
 *   • u přihlášení jménem a telefonem vzniká NOVÝ účet na každém zařízení
 *     i po smazání dat prohlížeče → duplicitní jména jsou normální, ne chyba.
 *     Panel je hlídá a ukazuje, který účet je ten živý (podle poslední návštěvy).
 *   • smazání účtu NENÍ zákaz — dotyčný se může přihlásit znovu a objeví se
 *     jako nový čekatel. Trvalé odepření = zablokovat.
 *
 * Klientská práva jsou jen pohodlí; skutečné vynucení dělají pravidla databáze.
 * ========================================================================== */

window._spravaHledat = '';

function openSprava(){
  if(!needPerm('sprava')) return;
  openModal('sprava-modal');
  renderSpravaUzivatelu();
}
function spravaHledat(v){ window._spravaHledat = v || ''; renderSpravaUzivatelu(); }

/* Kolikrát se stejné jméno v seznamu opakuje (odhalí duplicitní účty). */
function _pocetStejnychJmen(){
  var poc = {};
  Object.keys(window.allUsers || {}).forEach(function(uid){
    var j = deaccent((window.allUsers[uid] || {}).name || '');
    if(j) poc[j] = (poc[j] || 0) + 1;
  });
  return poc;
}
function _jeOnline(u){ return u.lastSeen && (Date.now() - u.lastSeen) < 5*60*1000; }
function _kdyNaposled(u){
  if(!u.lastSeen) return 'nikdy';
  var min = Math.round((Date.now() - u.lastSeen) / 60000);
  if(min < 1)    return 'právě teď';
  if(min < 60)   return 'před ' + min + ' min';
  if(min < 1440) return 'před ' + Math.round(min/60) + ' h';
  return czDate(ymd(new Date(u.lastSeen)));
}
var ZPUSOB_POPIS = { google:'účet Google', email:'e-mail a heslo', telefon:'jméno a telefon' };
var ZPUSOB_IKONA = { google:'mail', email:'mail', telefon:'osoba' };

function renderSpravaUzivatelu(){
  var vsichni = Object.keys(window.allUsers || {});
  var hledat = deaccent(window._spravaHledat);
  var poc = _pocetStejnychJmen();

  var cekaji = [], aktivni = [], blokovani = [];
  vsichni.forEach(function(uid){
    var u = window.allUsers[uid] || {};
    if(hledat){
      var kde = deaccent([u.name, u.email, u.phone].filter(Boolean).join(' '));
      if(kde.indexOf(hledat) === -1) return;
    }
    if(u.blocked) blokovani.push(uid);
    else if(u.approved !== true) cekaji.push(uid);
    else aktivni.push(uid);
  });
  var dleNavstevy = function(a,b){ return ((window.allUsers[b]||{}).lastSeen||0) - ((window.allUsers[a]||{}).lastSeen||0); };
  cekaji.sort(dleNavstevy); aktivni.sort(dleNavstevy); blokovani.sort(dleNavstevy);

  var h = '';
  h += '<label class="pole" style="margin-bottom:14px"><span class="popis">Hledat</span>' +
       '<input class="f" placeholder="jméno, e-mail, telefon" value="' + escapeHtml(window._spravaHledat) + '" ' +
       'oninput="spravaHledat(this.value)"></label>';

  h += '<div class="stitky" style="margin-bottom:16px">' +
       (cekaji.length ? '<span class="stitek varovny">' + ico('presypaci',13) + 'čeká <b>' + cekaji.length + '</b></span>' : '') +
       '<span class="stitek ok">' + ico('fajfka',13) + 'aktivních <b>' + aktivni.length + '</b></span>' +
       (blokovani.length ? '<span class="stitek zly">' + ico('zamek',13) + 'blokováno <b>' + blokovani.length + '</b></span>' : '') +
       '</div>';

  if(cekaji.length){
    h += '<div class="sekce"><span class="sekce-t">Čekají na schválení</span></div>';
    cekaji.forEach(function(uid){ h += _kartaUzivatele(uid, poc, true); });
  }
  h += '<div class="sekce"><span class="sekce-t">Aktivní účty</span></div>';
  if(!aktivni.length) h += '<div class="karta"><div class="prazdno">Nikdo tu zatím není.</div></div>';
  aktivni.forEach(function(uid){ h += _kartaUzivatele(uid, poc, false); });

  if(blokovani.length){
    h += '<div class="sekce"><span class="sekce-t">Zablokovaní</span></div>';
    blokovani.forEach(function(uid){ h += _kartaUzivatele(uid, poc, false); });
  }
  document.getElementById('sprava-list').innerHTML = h;
}

function _kartaUzivatele(uid, poc, ceka){
  var u = window.allUsers[uid] || {};
  var jaSam = (uid === myUid());
  var duplicit = poc[deaccent(u.name || '')] || 0;
  var zpusob = u.zpusob || (u.email ? 'google' : 'telefon');
  var kontakt = u.email || u.phone || '—';

  var h = '<div class="karta' + (ceka ? '' : '') + '"' + (ceka ? ' style="border-color:rgba(240,165,63,.4)"' : '') + '>';
  h += '<div class="karta-t"><span style="display:flex;align-items:center;gap:8px">' +
         (_jeOnline(u) ? '<span class="stav-tecka ok"></span>' : '') +
         escapeHtml(u.name || '(bez jména)') +
         (jaSam ? ' <span class="stitek on">to jsi ty</span>' : '') + '</span>' +
       (u.blocked ? '<span class="stitek zly">zablokován</span>'
                  : (u.approved === true ? '<span class="stitek ok">schválen</span>'
                                         : '<span class="stitek varovny">čeká</span>')) + '</div>';

  h += '<div class="udaje" style="border:none;margin:-4px 0 12px;padding:0">' +
       udajHtml(ZPUSOB_IKONA[zpusob] || 'osoba', escapeHtml(kontakt) + ' <span class="tichy-2">· ' +
                escapeHtml(ZPUSOB_POPIS[zpusob] || zpusob) + '</span>') +
       udajHtml('hodiny', 'naposledy ' + escapeHtml(_kdyNaposled(u))) +
       (duplicit > 1 ? '<div class="udaj" style="color:var(--warn)">' + ico('vystraha',15) +
          '<span>Stejné jméno má <b>' + duplicit + ' účtů</b>. U přihlášení telefonem je to normální — ' +
          'každé zařízení má vlastní účet. Ten živý poznáš podle poslední návštěvy, ostatní smaž.</span></div>' : '') +
       '</div>';

  if(ceka){
    h += '<div class="rada">' +
         '<button class="btn btn-ok" onclick="spravaApprove(\'' + uid + '\',true)">' + ico('fajfka',17) + '<span>Schválit</span></button>' +
         '<button class="btn" onclick="spravaDelete(\'' + uid + '\')">' + ico('kos',16) + '<span>Zamítnout</span></button>' +
         '</div>';
    return h + '</div>';
  }

  h += '<label class="pole" style="margin-bottom:12px"><span class="popis">Role</span>' +
       '<select class="f" onchange="spravaSetRole(\'' + uid + '\',this.value)">' +
         Object.keys(ROLE_LABEL).map(function(r){
           return '<option value="' + r + '"' + ((u.role||'ctenar') === r ? ' selected' : '') + '>' +
                  escapeHtml(ROLE_LABEL[r]) + '</option>'; }).join('') +
       '</select></label>';

  h += '<div class="rada">' +
       '<button class="btn btn-s" onclick="spravaPerms(\'' + uid + '\')">' + ico('zamek',15) + '<span>Práva</span></button>' +
       '<button class="btn btn-s" onclick="spravaStavby(\'' + uid + '\')">' + ico('stavba',15) + '<span>Stavby</span></button>' +
       (u.blocked
         ? '<button class="btn btn-s" onclick="spravaBlock(\'' + uid + '\',false)">Odblokovat</button>'
         : '<button class="btn btn-s" onclick="spravaBlock(\'' + uid + '\',true)"' + (jaSam ? ' disabled style="opacity:.4"' : '') + '>Zablokovat</button>') +
       (u.approved === true ? '<button class="btn btn-s" onclick="spravaApprove(\'' + uid + '\',false)">Zrušit schválení</button>' : '') +
       (jaSam ? '' : '<button class="btn btn-s btn-cisty btn-nebezpeci" onclick="spravaDelete(\'' + uid + '\')">' + ico('kos',15) + '<span>Smazat účet</span></button>') +
       '</div>';
  return h + '</div>';
}

/* ── Akce ───────────────────────────────────────────────────────────────── */
function spravaSetRole(uid, role){
  if(uid === myUid() && role !== 'admin'){
    if(!confirm('Měníš roli sám sobě — přijdeš o práva administrátora. Opravdu?')){ renderSpravaUzivatelu(); return; }
  }
  db.ref('uzivatele/' + uid).update({ role: role })
    .then(function(){ showToast('Role změněna na: ' + (ROLE_LABEL[role] || role)); })
    .catch(function(){ showToast('Změnu role odmítla databáze — jsi přihlášený jako administrátor?', 4000); });
}
function spravaApprove(uid, on){
  var u = window.allUsers[uid] || {};
  var upd = { approved: !!on };
  if(on && !u.role) upd.role = 'mistr';         // ať nový člověk nezůstane bez role
  db.ref('uzivatele/' + uid).update(upd)
    .then(function(){ showToast(on ? 'Schváleno. Roli a přístup ke stavbám nastav níž.' : 'Schválení zrušeno.', 3600); })
    .catch(function(){ showToast('Databáze zápis odmítla.', 4000); });
}
function spravaBlock(uid, on){
  if(uid === myUid()){ showToast('Sám sebe zablokovat nemůžeš.'); return; }
  if(on && !confirm('Zablokovat ' + ((window.allUsers[uid]||{}).name || uid) + '?\n\nOkamžitě ho to vyhodí z aplikace a už se nedostane dovnitř.')) return;
  db.ref('uzivatele/' + uid).update({ blocked: !!on })
    .then(function(){ showToast(on ? 'Zablokováno.' : 'Odblokováno.'); })
    .catch(function(){ showToast('Databáze zápis odmítla.', 4000); });
}

/* Mazání účtu. POZOR: není to zákaz — viz hláška, kterou uživateli ukazujeme. */
function spravaDelete(uid){
  if(uid === myUid()){ showToast('Sám sebe smazat nemůžeš.'); return; }
  var u = window.allUsers[uid] || {};
  var varovani = 'Smazat účet „' + (u.name || uid) + '"?\n\n' +
    'POZOR: tohle NENÍ zákaz. Smaže se jen záznam v aplikaci — když se dotyčný ' +
    'přihlásí znovu, objeví se jako nový čekatel.\n\n' +
    'Chceš-li mu přístup trvale odepřít, použij Zablokovat.\n\n' +
    'Mazání se hodí na duplicitní účty (jeden člověk, víc zařízení).';
  if(!confirm(varovani)) return;
  if(u.role === 'admin' && !confirm('Tohle je účet administrátora. Opravdu smazat?')) return;
  db.ref('uzivatele/' + uid).remove()
    .then(function(){ showToast('Účet smazán ze seznamu.'); })
    .catch(function(){ showToast('Databáze mazání odmítla.', 4000); });
}

/* ── Individuální práva k funkcím ───────────────────────────────────────── */
function spravaPerms(uid){
  var u = window.allUsers[uid] || {}, perms = u.perms || {};
  var role = u.role || 'ctenar', def = ROLE_PERMS[role];
  var h = '<div class="napoveda" style="margin-top:0">Výchozí práva plynou z role <b>' +
          escapeHtml(ROLE_LABEL[role] || role) + '</b>. Tady se dají jednotlivě přidat nebo odebrat.</div>' +
          '<div class="karta karta-plocha">';
  FEATURES.forEach(function(f){
    var vychozi = (def === '*') || (def && def.indexOf(f.key) !== -1);
    var stav = (perms[f.key] === true) ? 'ano' : (perms[f.key] === false) ? 'ne' : '';
    h += '<div class="radek staticky">' +
      '<div class="radek-telo"><div class="radek-t" style="font-size:14px;white-space:normal">' +
        escapeHtml(f.label) + '</div>' +
      '<div class="radek-p">z role: ' + (vychozi ? 'povoleno' : 'nepovoleno') + '</div></div>' +
      '<select class="f" style="width:118px;min-height:40px;padding:8px;font-size:14px" ' +
        'onchange="spravaSetPerm(\'' + uid + '\',\'' + f.key + '\',this.value)">' +
        '<option value=""' + (stav === '' ? ' selected' : '') + '>dle role</option>' +
        '<option value="ano"' + (stav === 'ano' ? ' selected' : '') + '>povolit</option>' +
        '<option value="ne"' + (stav === 'ne' ? ' selected' : '') + '>zakázat</option>' +
      '</select></div>';
  });
  document.getElementById('sub-title').textContent = 'Práva — ' + (u.name || uid);
  document.getElementById('sub-body').innerHTML = h + '</div>';
  openModal('sub-modal');
}
function spravaSetPerm(uid, key, val){
  var upd = {};
  upd['perms/' + key] = (val === 'ano') ? true : (val === 'ne') ? false : null;
  db.ref('uzivatele/' + uid).update(upd)
    .then(function(){ showToast('Právo upraveno.'); })
    .catch(function(){ showToast('Databáze zápis odmítla.', 4000); });
}

/* ── Přístup ke stavbám ─────────────────────────────────────────────────── */
function spravaStavby(uid){
  var u = window.allUsers[uid] || {}, mam = u.stavby || {};
  var vsechny = Object.keys(window.allStavby || {});
  var vidiVse = ['admin','vedouciProvozu','dispecer'].indexOf(u.role) !== -1;
  var h = '<div class="napoveda" style="margin-top:0">Ke kterým stavbám má přístup.' +
          (vidiVse ? ' <b>Role ' + escapeHtml(ROLE_LABEL[u.role]) + ' vidí všechny stavby</b> bez ohledu na tenhle seznam.' : '') +
          '</div>';
  if(!vsechny.length) h += '<div class="prazdno">Zatím není založená žádná stavba.</div>';
  else {
    h += '<div class="vyber-box" style="max-height:none">';
    vsechny.forEach(function(sid){
      var s = window.allStavby[sid] || {};
      h += '<label><input type="checkbox"' + (mam[sid] ? ' checked' : '') +
           ' onchange="spravaSetStavba(\'' + uid + '\',\'' + sid + '\',this.checked)">' +
           '<span style="flex:1"><b>' + escapeHtml(s.nazev || sid) + '</b>' +
           (s.vlastnikUid === uid ? ' <span class="stitek">zakladatel</span>' : '') + '</span></label>';
    });
    h += '</div>';
  }
  document.getElementById('sub-title').textContent = 'Stavby — ' + (u.name || uid);
  document.getElementById('sub-body').innerHTML = h;
  openModal('sub-modal');
}
function spravaSetStavba(uid, sid, on){
  var upd = {};
  upd['stavby/' + sid] = on ? true : null;
  db.ref('uzivatele/' + uid).update(upd)
    .catch(function(){ showToast('Databáze zápis odmítla.', 4000); });
}
