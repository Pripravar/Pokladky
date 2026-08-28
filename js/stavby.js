/* ============================================================================
 * POKLÁDKY — js/stavby.js
 * Stavby (úseky pokládky) a přepínání mezi nimi.
 *
 * Klíčový rozdíl proti aplikacím staveb: stavbu si zakládá SÁM stavbyvedoucí
 * (staveb je hodně, od malých po velké, a jsou operativní — nedává smysl to
 * hrnout na jednoho člověka). Kdo stavbu založil, je jejím „malým adminem".
 * ========================================================================== */

window.allStavby = {};
window.activeStavbaId = localStorage.getItem('pokladky_stavba') || '';

function loadStavby(){
  db.ref('stavby').on('value', function(snap){
    window.allStavby = snap.val() || {};
    // Pokud vybraná stavba zmizela nebo k ní uživatel nemá přístup, přepni na první dostupnou.
    if(!window.activeStavbaId || !window.allStavby[window.activeStavbaId] || !canAccessStavba(window.activeStavbaId)){
      var prvni = mojeStavby()[0];
      window.activeStavbaId = prvni ? prvni.id : '';
      if(window.activeStavbaId) localStorage.setItem('pokladky_stavba', window.activeStavbaId);
    }
    renderStavbaSwitch();
    if(typeof renderDnes === 'function' && window.currentView === 'dnes') renderDnes();
    if(typeof renderPlan === 'function' && window.currentView === 'plan') renderPlan();
  });
}

/* Stavby, které smí přihlášený vidět — seřazené: aktivní první, pak podle názvu. */
function mojeStavby(){
  var out = [];
  Object.keys(window.allStavby || {}).forEach(function(id){
    if(!canAccessStavba(id)) return;
    var s = window.allStavby[id] || {};
    out.push({ id:id, nazev:s.nazev || '(bez názvu)', kod:s.kod || '',
               stav:s.stav || 'aktivni', vlastnikUid:s.vlastnikUid || '', osa:s.osa || null });
  });
  out.sort(function(a,b){
    if(a.stav !== b.stav) return a.stav === 'aktivni' ? -1 : 1;
    return a.nazev.localeCompare(b.nazev, 'cs');
  });
  return out;
}
function aktivniStavba(){ return window.allStavby[window.activeStavbaId] || null; }
function stavbaNazev(sid){
  var s = window.allStavby[sid];
  return s ? (s.nazev || '(bez názvu)') : '—';
}

function setActiveStavba(sid){
  if(!canAccessStavba(sid)){ showToast('K téhle stavbě nemáš přístup.'); return; }
  window.activeStavbaId = sid;
  localStorage.setItem('pokladky_stavba', sid);
  closeModal('stavba-modal');
  renderStavbaSwitch();
  showView(window.currentView);
  showToast(stavbaNazev(sid));
}

function renderStavbaSwitch(){
  var el = document.getElementById('stavba-switch'); if(!el) return;
  var s = aktivniStavba();
  el.innerHTML = '<span class="sw-nazev">' + (s ? escapeHtml(s.nazev) : 'Založ první stavbu') + '</span>' +
                 '<span class="sw-caret">' + ico('dolu', 16) + '</span>';
}

/* ── Přepínač / seznam staveb ────────────────────────────────────────── */
function openStavbaSwitcher(){
  var list = mojeStavby(), h = '';
  if(!list.length){
    h += '<div class="prazdno">Zatím nemáš žádnou stavbu.<br>Založit ji trvá dvě minuty.</div>';
  }
  list.forEach(function(s){
    var akt = (s.id === window.activeStavbaId);
    var popis = (s.osa && s.osa.body && s.osa.body.length >= 2)
      ? 'km ' + fmtNum(num(s.osa.kmStart),3).replace(/\s/g,'') + ' – ' + fmtNum(num(s.osa.kmEnd),3).replace(/\s/g,'')
      : 'osa není zakreslená';
    h += '<div class="radek" onclick="setActiveStavba(\'' + s.id + '\')">' +
           '<span class="radek-ico"' + (akt ? ' style="color:var(--accent-ink)"' : '') + '>' +
             ico(s.stav === 'aktivni' ? 'stavba' : 'fajfka', 19) + '</span>' +
           '<div class="radek-telo"><div class="radek-t">' + escapeHtml(s.nazev) + '</div>' +
           '<div class="radek-p">' + escapeHtml(s.kod ? s.kod + ' · ' : '') + popis + '</div></div>' +
           (akt ? '<span class="stitek on">tady jsi</span>' : '') +
           (isStavbaAdmin(s.id)
             ? '<button class="btn btn-ikona btn-cisty" onclick="event.stopPropagation();openStavbaEdit(\'' + s.id + '\')">' +
               ico('tuzka',17) + '</button>' : '') +
         '</div>';
  });
  document.getElementById('stavba-list').innerHTML = h;
  openModal('stavba-modal');
}

/* ── Zakládání a úprava stavby ───────────────────────────────────────── */
function openNovaStavba(){
  if(!needPerm('stavby')) return;
  window._editStavbaId = '';
  window._osaBody = [];
  document.getElementById('stavba-form-title').textContent = 'Nová stavba';
  ['st-nazev','st-kod','st-objednatel'].forEach(function(id){ document.getElementById(id).value = ''; });
  document.getElementById('st-kmstart').value = '0';
  document.getElementById('st-stav').value = 'aktivni';
  document.getElementById('st-delete').style.display = 'none';
  closeModal('stavba-modal');
  openModal('stavba-form-modal');
  osaMapInit(); osaRedraw();
}
function openStavbaEdit(sid){
  if(!isStavbaAdmin(sid)){ showToast('Upravovat stavbu smí jen její zakladatel nebo vedení.', 3200); return; }
  var s = window.allStavby[sid] || {};
  window._editStavbaId = sid;
  window._osaBody = (s.osa && s.osa.body) ? s.osa.body.slice() : [];
  document.getElementById('stavba-form-title').textContent = 'Úprava stavby';
  document.getElementById('st-nazev').value = s.nazev || '';
  document.getElementById('st-kod').value = s.kod || '';
  document.getElementById('st-objednatel').value = s.objednatel || '';
  document.getElementById('st-kmstart').value = (s.osa && s.osa.kmStart !== undefined) ? s.osa.kmStart : '0';
  document.getElementById('st-stav').value = s.stav || 'aktivni';
  document.getElementById('st-delete').style.display = '';
  closeModal('stavba-modal');
  openModal('stavba-form-modal');
  osaMapInit();
  setTimeout(function(){
    osaRedraw();
    if(window._osaMap && window._osaBody.length >= 2) window._osaMap.fitBounds(window._osaBody, { padding:[30,30] });
  }, 200);
}

function saveStavba(){
  var nazev = (document.getElementById('st-nazev').value || '').trim();
  if(!nazev){ showToast('Vyplň název stavby.'); return; }
  var body = window._osaBody || [];
  var delka = polyLength(body);
  var kmStart = num(document.getElementById('st-kmstart').value);
  var sid = window._editStavbaId || ('s' + newId());
  var rec = {
    nazev: nazev,
    kod: (document.getElementById('st-kod').value || '').trim(),
    objednatel: (document.getElementById('st-objednatel').value || '').trim(),
    stav: document.getElementById('st-stav').value,
    osa: { body: body, kmStart: kmStart, kmEnd: +(kmStart + delka/1000).toFixed(3), delkaM: Math.round(delka) }
  };
  if(!window._editStavbaId){
    rec.vlastnikUid = myUid();
    rec.admini = {};
    rec.admini[myUid()] = true;
    rec.ts = Date.now();
  }
  db.ref('stavby/' + sid).update(rec);
  // Zakladatel k ní automaticky dostane přístup (u role, která nevidí všechno).
  if(!window._editStavbaId && myUid()){
    var upd = {}; upd['stavby/' + sid] = true;
    db.ref('uzivatele/' + myUid()).update(upd);
  }
  closeModal('stavba-form-modal');
  window.activeStavbaId = sid;
  localStorage.setItem('pokladky_stavba', sid);
  showToast('Stavba uložena.');
  renderStavbaSwitch();
  showView(window.currentView);
}

function deleteStavba(){
  var sid = window._editStavbaId; if(!sid) return;
  if(!isStavbaAdmin(sid)){ showToast('Mazat smí jen zakladatel nebo vedení.', 3200); return; }
  if(!confirm('Opravdu smazat stavbu „' + stavbaNazev(sid) + '"?\n\nPokládky, fotky a záznamy k ní zůstanou v databázi, ale zmizí ze seznamu.')) return;
  db.ref('stavby/' + sid).remove();
  closeModal('stavba-form-modal');
  window.activeStavbaId = '';
  localStorage.removeItem('pokladky_stavba');
  showToast('Stavba smazána.');
}
