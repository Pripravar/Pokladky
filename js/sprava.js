/* ============================================================================
 * POKLÁDKY — js/sprava.js
 * Správa uživatelů: schvalování, role, individuální práva, přístup ke stavbám.
 *
 * Klientská práva jsou jen pohodlí. Skutečné vynucení dělají pravidla databáze
 * (database.rules.json) — zablokovaný nesmí nic zapsat a cizí stavbu nepřečte.
 * ========================================================================== */

function openSprava(){
  if(!needPerm('sprava')) return;
  openModal('sprava-modal');
  renderSpravaUzivatelu();
}

function renderSpravaUzivatelu(){
  var uids = Object.keys(window.allUsers || {});
  uids.sort(function(a,b){
    var ua = window.allUsers[a] || {}, ub = window.allUsers[b] || {};
    var ca = (ua.approved === true) ? 1 : 0, cb = (ub.approved === true) ? 1 : 0;
    if(ca !== cb) return ca - cb;                              // neschválení nahoru
    return String(ua.name||'').localeCompare(String(ub.name||''), 'cs');
  });
  var ceka = uids.filter(function(u){ return (window.allUsers[u]||{}).approved !== true && !isAdmin(u); }).length;

  var h = '';
  if(ceka) h += '<div class="stitky" style="margin-bottom:14px"><span class="stitek varovny">' +
                ico('presypaci',13) + 'Čeká na schválení: <b>' + ceka + '</b></span></div>';
  if(!uids.length) h += '<div class="karta"><div class="prazdno">Zatím tu není žádný uživatel.</div></div>';

  uids.forEach(function(uid){
    var u = window.allUsers[uid] || {}, jaSam = (uid === myUid());
    var stitek = u.blocked   ? '<span class="stitek zly">zablokován</span>'
               : (u.approved === true ? '<span class="stitek ok">schválen</span>'
                                      : '<span class="stitek varovny">čeká</span>');
    h += '<div class="karta">' +
      '<div class="karta-t"><span>' + escapeHtml(u.name || '(bez jména)') +
        (jaSam ? ' <span class="stitek on">to jsi ty</span>' : '') + '</span>' + stitek + '</div>' +
      '<div class="radek-p" style="margin:-8px 0 14px">' + escapeHtml(u.email || u.phone || uid) + '</div>' +
      '<label class="pole" style="margin-bottom:12px"><span class="popis">Role</span>' +
        '<select class="f" onchange="spravaSetRole(\'' + uid + '\',this.value)">' +
          Object.keys(ROLE_LABEL).map(function(r){
            return '<option value="' + r + '"' + ((u.role||'ctenar') === r ? ' selected' : '') + '>' +
                   escapeHtml(ROLE_LABEL[r]) + '</option>'; }).join('') +
        '</select></label>' +
      '<div class="rada">' +
        (u.approved === true
          ? '<button class="btn btn-s" onclick="spravaApprove(\'' + uid + '\',false)">Zrušit schválení</button>'
          : '<button class="btn btn-s btn-ok" onclick="spravaApprove(\'' + uid + '\',true)">' + ico('fajfka',15) + '<span>Schválit</span></button>') +
        (u.blocked
          ? '<button class="btn btn-s" onclick="spravaBlock(\'' + uid + '\',false)">Odblokovat</button>'
          : '<button class="btn btn-s" onclick="spravaBlock(\'' + uid + '\',true)"' + (jaSam ? ' disabled style="opacity:.4"' : '') + '>Zablokovat</button>') +
        '<button class="btn btn-s" onclick="spravaPerms(\'' + uid + '\')">' + ico('zamek',15) + '<span>Práva</span></button>' +
        '<button class="btn btn-s" onclick="spravaStavby(\'' + uid + '\')">' + ico('stavba',15) + '<span>Stavby</span></button>' +
      '</div></div>';
  });
  document.getElementById('sprava-list').innerHTML = h;
}

function spravaSetRole(uid, role){
  if(uid === myUid() && role !== 'admin' && isAdmin(uid)){
    if(!confirm('Měníš roli sám sobě — přijdeš o práva administrátora. Opravdu?')){ renderSpravaUzivatelu(); return; }
  }
  db.ref('uzivatele/' + uid).update({ role: role });
  showToast('Role změněna na: ' + (ROLE_LABEL[role] || role));
}
function spravaApprove(uid, on){
  db.ref('uzivatele/' + uid).update({ approved: !!on });
  showToast(on ? 'Schváleno.' : 'Schválení zrušeno.');
}
function spravaBlock(uid, on){
  if(uid === myUid()){ showToast('Sám sebe zablokovat nemůžeš.'); return; }
  db.ref('uzivatele/' + uid).update({ blocked: !!on });
  showToast(on ? 'Zablokováno.' : 'Odblokováno.');
}

/* ── Individuální práva k funkcím ───────────────────────────────────────── */
function spravaPerms(uid){
  var u = window.allUsers[uid] || {}, perms = u.perms || {};
  var role = u.role || 'ctenar', def = ROLE_PERMS[role];
  var h = '<div class="napoveda" style="margin-top:0">Výchozí práva plynou z role <b>' +
          escapeHtml(ROLE_LABEL[role] || role) + '</b>. Tady se dají jednotlivě přidat nebo odebrat.</div>';
  FEATURES.forEach(function(f){
    var vychozi = (def === '*') || (def && def.indexOf(f.key) !== -1);
    var stav = (perms[f.key] === true) ? 'ano' : (perms[f.key] === false) ? 'ne' : '';
    h += '<div class="radek staticky">' +
      '<div class="radek-telo"><div class="radek-t" style="font-size:14px;white-space:normal">' +
        escapeHtml(f.label.replace(/^[^\sA-Za-zÀ-ž]+\s*/, '')) + '</div>' +
      '<div class="radek-p">z role: ' + (vychozi ? 'povoleno' : 'nepovoleno') + '</div></div>' +
      '<select class="f" style="width:120px;min-height:40px;padding:8px;font-size:14px" ' +
        'onchange="spravaSetPerm(\'' + uid + '\',\'' + f.key + '\',this.value)">' +
        '<option value=""' + (stav === '' ? ' selected' : '') + '>dle role</option>' +
        '<option value="ano"' + (stav === 'ano' ? ' selected' : '') + '>povolit</option>' +
        '<option value="ne"' + (stav === 'ne' ? ' selected' : '') + '>zakázat</option>' +
      '</select></div>';
  });
  document.getElementById('sub-title').textContent = 'Práva — ' + (u.name || uid);
  document.getElementById('sub-body').innerHTML = '<div class="karta karta-plocha">' + h + '</div>';
  openModal('sub-modal');
}
function spravaSetPerm(uid, key, val){
  var upd = {};
  upd['perms/' + key] = (val === 'ano') ? true : (val === 'ne') ? false : null;
  db.ref('uzivatele/' + uid).update(upd);
  showToast('Právo upraveno.');
}

/* ── Přístup ke stavbám ─────────────────────────────────────────────────── */
function spravaStavby(uid){
  var u = window.allUsers[uid] || {}, mam = u.stavby || {};
  var vsechny = Object.keys(window.allStavby || {});
  var h = '<div class="napoveda" style="margin-top:0">Ke kterým stavbám má uživatel přístup. ' +
          'Administrátor, vedoucí provozu a dispečer vidí <b>všechny</b> bez ohledu na tenhle seznam.</div>';
  if(!vsechny.length) h += '<div class="prazdno">Zatím není založená žádná stavba.</div>';
  h += '<div class="vyber-box" style="max-height:none">';
  vsechny.forEach(function(sid){
    var s = window.allStavby[sid] || {};
    h += '<label><input type="checkbox"' + (mam[sid] ? ' checked' : '') +
         ' onchange="spravaSetStavba(\'' + uid + '\',\'' + sid + '\',this.checked)">' +
         '<span style="flex:1"><b>' + escapeHtml(s.nazev || sid) + '</b>' +
         (s.vlastnikUid === uid ? ' <span class="stitek">zakladatel</span>' : '') + '</span></label>';
  });
  h += '</div>';
  document.getElementById('sub-title').textContent = 'Stavby — ' + (u.name || uid);
  document.getElementById('sub-body').innerHTML = h;
  openModal('sub-modal');
}
function spravaSetStavba(uid, sid, on){
  var upd = {};
  upd['stavby/' + sid] = on ? true : null;
  db.ref('uzivatele/' + uid).update(upd);
}
