/* ============================================================================
 * POKLÁDKY — js/core.js
 * Jádro: konfigurace, databáze (Firebase nebo lokální náhrada), přihlášení,
 * uživatelé, práva (FEATURES/hasPerm), pomocné funkce, přepínání pohledů.
 *
 * Načítá se jako PRVNÍ. Všechno ostatní na něm staví.
 * ========================================================================== */

/* ── Konfigurace ─────────────────────────────────────────────────────────
 * Tenhle config NENÍ tajemství — u webových Firebase aplikací je veřejný vždycky
 * a sám o sobě nikomu nic neotevře. Data chrání pravidla databáze
 * (database.rules.json): kdo není přihlášený a schválený administrátorem,
 * nepřečte ani nezapíše nic. Na GitHubu je proto jen kód, žádná data.
 *
 * Past: dokud apiKey obsahuje slovo 'PLACEHOLDER', jede appka v ukázkovém režimu
 * (bez přihlašování, data jen v prohlížeči). Jakákoliv jiná hodnota zapne
 * přihlašovací bránu. */
var FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDDB9XO7jf_vs-6jMordlQFO6uatSs8n7M',
  authDomain:        'pokladky-msilnice.firebaseapp.com',
  databaseURL:       'https://pokladky-msilnice-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'pokladky-msilnice',
  storageBucket:     'pokladky-msilnice.firebasestorage.app',
  messagingSenderId: '1094246768215',
  appId:             '1:1094246768215:web:006321f04db4723b52cd12'
};
var ADMIN_UIDS = [];              // UID administrátorů (volitelné, doplňuje se až za provozu)
/* Účty, které jsou administrátorem VŽDY — bez ohledu na to, kdo se přihlásí první
 * a co je zapsané v databázi. Pojistka proti tomu, aby appku odemknul někdo jiný,
 * a záchrana, kdyby si admin omylem odebral práva. */
var ADMIN_EMAILS = ['arasid33@gmail.com'];
var STORAGE_BUCKET_URL = '';      // EU bucket pro fotky (doplní se později)

function authConfigOk(){
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PLACEHOLDER') === -1);
}
function isDemoMode(){ return !authConfigOk(); }

/* ============================================================================
 * LOKÁLNÍ NÁHRADA DATABÁZE (demo režim)
 * Napodobuje tu část Firebase Realtime Database API, kterou appka používá,
 * nad localStorage. Díky tomu jde celá aplikace proklikat a otestovat dřív,
 * než vůbec vznikne Firebase projekt — a stejný kód pak beze změny přejde
 * na skutečnou databázi.
 * ========================================================================== */
var LocalDB = (function(){
  var KEY = 'pokladky_localdb_v1';
  var data = {};
  var listeners = [];            // {path, event, cb}
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){ data = {}; }

  function save(){ try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e){} }
  function parts(p){ return String(p||'').split('/').filter(Boolean); }
  function get(p){
    var n = data, ps = parts(p);
    for(var i=0;i<ps.length;i++){ if(n===null||typeof n!=='object') return null; n = n[ps[i]]; if(n===undefined) return null; }
    return (n===undefined) ? null : n;
  }
  function put(p, v){
    var ps = parts(p);
    if(!ps.length){ data = (v===null?{}:v); save(); return; }
    var n = data;
    for(var i=0;i<ps.length-1;i++){
      if(n[ps[i]]===undefined || n[ps[i]]===null || typeof n[ps[i]]!=='object') n[ps[i]] = {};
      n = n[ps[i]];
    }
    if(v === null) delete n[ps[ps.length-1]]; else n[ps[ps.length-1]] = v;
    save();
  }
  // Upozorní posluchače na cestě i na všech nadřazených cestách (jako RTDB).
  function fire(p){
    var ps = parts(p);
    var paths = [''];
    for(var i=0;i<ps.length;i++) paths.push(ps.slice(0,i+1).join('/'));
    listeners.forEach(function(l){
      if(paths.indexOf(l.path) !== -1 || l.path.indexOf(p + '/') === 0){
        try { l.cb(snapshot(l.path)); } catch(e){ console.warn('LocalDB listener:', e); }
      }
    });
  }
  function snapshot(p){
    var v = get(p), key = parts(p).pop() || null;
    return {
      key: key,
      val: function(){ return v; },
      exists: function(){ return v !== null && v !== undefined; },
      child: function(c){ return snapshot(p ? p + '/' + c : c); },
      forEach: function(fn){
        if(!v || typeof v !== 'object') return;
        Object.keys(v).forEach(function(k){ fn(snapshot(p ? p + '/' + k : k)); });
      },
      numChildren: function(){ return (v && typeof v === 'object') ? Object.keys(v).length : 0; }
    };
  }
  var pushCounter = 0;
  function newKey(){
    pushCounter++;
    return '-L' + Date.now().toString(36) + pushCounter.toString(36).padStart(3,'0');
  }
  function ref(path){
    path = String(path||'').replace(/^\/+|\/+$/g,'');
    var api = {
      key: parts(path).pop() || null,
      toString: function(){ return 'local://' + path; },
      child: function(c){ return ref(path ? path + '/' + c : c); },
      parent: function(){ var ps = parts(path); ps.pop(); return ref(ps.join('/')); },
      on: function(event, cb){ var l={path:path,event:event,cb:cb}; listeners.push(l);
                               setTimeout(function(){ try{ cb(snapshot(path)); }catch(e){} },0); return cb; },
      off: function(event, cb){ listeners = listeners.filter(function(l){
                                 return !(l.path===path && (!cb || l.cb===cb)); }); },
      once: function(){ var s = snapshot(path);
                        return { then: function(f){ try{ f(s); }catch(e){ console.warn(e); }
                                                    return { catch:function(){ return this; }, then:function(g){ g&&g(); return this; } }; },
                                 catch: function(){ return this; } }; },
      set:    function(v){ put(path, v===undefined?null:v); fire(path); return _p(); },
      update: function(o){ Object.keys(o||{}).forEach(function(k){ put(path+'/'+k, o[k]); }); fire(path); return _p(); },
      remove: function(){ put(path, null); fire(path); return _p(); },
      push:   function(v){ var k = newKey(); var r = ref(path + '/' + k);
                           if(v !== undefined){ r.set(v); } return r; },
      // Dotazovací metody jsou v demo režimu jen průchozí (filtruje se v JS).
      orderByChild: function(){ return api; }, orderByKey: function(){ return api; },
      equalTo: function(){ return api; }, limitToLast: function(){ return api; },
      startAt: function(){ return api; }, endAt: function(){ return api; }
    };
    return api;
  }
  function _p(){ var o = { then:function(f){ f && f(); return o; }, catch:function(){ return o; } }; return o; }
  return { ref: ref, _dump: function(){ return data; },
           _wipe: function(){ data = {}; save(); fire(''); } };
})();

/* ── Inicializace Firebase / databáze ────────────────────────────────── */
var db = null, fbAuth = null, fbApp = null;
(function initBackend(){
  if(authConfigOk() && typeof firebase !== 'undefined'){
    try {
      fbApp  = firebase.initializeApp(FIREBASE_CONFIG);
      db     = firebase.database();
      fbAuth = firebase.auth();
    } catch(e){ console.error('Firebase init selhal:', e); }
  }
  if(!db){ db = LocalDB; console.info('POKLÁDKY: demo režim — data se ukládají jen v tomto prohlížeči.'); }
})();

/* ============================================================================
 * POMOCNÉ FUNKCE
 * ========================================================================== */
function escapeHtml(s){
  return String(s===null||s===undefined?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
/* Odstraní diakritiku — pro hledání a našeptávání ("cerpadlo" najde "čerpadlo"). */
function deaccent(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
}
function showToast(msg, ms){
  var t = document.getElementById('toast'); if(!t) return;
  t.innerHTML = msg; t.style.display = 'block';
  clearTimeout(window._toastT);
  window._toastT = setTimeout(function(){ t.style.display = 'none'; }, ms || 2600);
}
function newId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ── Datum a čas ─────────────────────────────────────────────────────── */
var DNY_CZ = ['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];
var DNY_ZK = ['Ne','Po','Út','St','Čt','Pá','So'];
function ymd(d){
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function ymdToDate(s){ var p = String(s||'').split('-'); return new Date(+p[0], (+p[1]||1)-1, +p[2]||1); }
function czDate(s){ var d = ymdToDate(s); return d.getDate() + '. ' + (d.getMonth()+1) + '. ' + d.getFullYear(); }
function czDateShort(s){ var d = ymdToDate(s); return DNY_ZK[d.getDay()] + ' ' + d.getDate() + '. ' + (d.getMonth()+1) + '.'; }
function addDays(s, n){ var d = ymdToDate(s); d.setDate(d.getDate() + n); return ymd(d); }

/* ISO týden: klíč 'YYYY-Www'. Týden začíná pondělím (jako harmonogram). */
function isoWeekKey(s){
  var d = ymdToDate(s || ymd());
  var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 4 - (t.getDay() || 7));                  // čtvrtek téhož týdne
  var rok = t.getFullYear();
  var jan1 = new Date(rok, 0, 1);
  var tyden = Math.ceil(((t - jan1) / 86400000 + 1) / 7);
  return rok + '-W' + String(tyden).padStart(2,'0');
}
/* Pondělí týdne, ve kterém leží dané datum. */
function weekMonday(s){
  var d = ymdToDate(s || ymd());
  var dow = d.getDay() || 7;                                       // Ne=7
  d.setDate(d.getDate() - (dow - 1));
  return ymd(d);
}
/* Sedm dnů týdne (pondělí→neděle) jako pole 'YYYY-MM-DD'. */
function weekDays(mondayYmd){
  var out = [];
  for(var i=0;i<7;i++) out.push(addDays(mondayYmd, i));
  return out;
}
function weekLabel(mondayYmd){
  var a = ymdToDate(mondayYmd), b = ymdToDate(addDays(mondayYmd,6));
  return isoWeekKey(mondayYmd).replace('-W',' · týden ') + '  (' +
         a.getDate() + '. ' + (a.getMonth()+1) + '. – ' + b.getDate() + '. ' + (b.getMonth()+1) + '.)';
}

/* ── Čísla ───────────────────────────────────────────────────────────── */
function num(v, def){ var n = parseFloat(String(v===null||v===undefined?'':v).replace(',','.')); return isNaN(n) ? (def===undefined?0:def) : n; }
function fmtNum(n, des){
  if(n === null || n === undefined || isNaN(n)) return '–';
  var s = Number(n).toFixed(des===undefined?1:des);
  return s.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
function fmtKm(m){ var km = Math.floor(m/1000); return km + ',' + String(Math.round(m%1000)).padStart(3,'0'); }

/* ============================================================================
 * PRÁVA — role, funkce, hasPerm
 * Pravidlo #4 ze skillu: KAŽDÁ funkce i vrstva má svůj klíč a jde vypnout.
 * Klientské právo je jen pohodlí — skutečné vynucení dělají pravidla databáze.
 * ========================================================================== */
var FEATURES = [
  { key:'dnes',       label:'Dnešek (přehled dne)',            btns:['tab-dnes'] },
  { key:'plan',       label:'Můj týden (plán pokládek)',       btns:['tab-plan'] },
  { key:'pokladka',   label:'Zakládání a úprava pokládky',      btns:['btn-nova-pokladka'] },
  { key:'dispecink',  label:'Dispečink (plán všech staveb)',    btns:['tab-dispecink'] },
  { key:'objednavky', label:'Objednávky balené a nasazení',     btns:['btn-objednavky'] },
  { key:'stavby',     label:'Zakládání staveb',                btns:['btn-nova-stavba'] },
  { key:'ciselniky',  label:'Číselníky (lidi, stroje, party…)', btns:['btn-ciselniky'] },
  { key:'vazni',      label:'Vážní lístky',                     btns:['btn-vazni'] },
  { key:'foto',       label:'Focení a galerie',                 btns:['btn-foto','btn-galerie'] },
  { key:'dochazka',   label:'Docházka / šichtovka',             btns:['btn-dochazka'] },
  { key:'stroje',     label:'Tankování a servisy strojů',        btns:['btn-tankovani','btn-servisy'] },
  { key:'vydani',     label:'Drobná vydání (soukromé)',         btns:['btn-vydani'] },
  { key:'material',   label:'Spotřební materiál',               btns:['btn-material'] },
  { key:'urazy',      label:'Úrazy (formulář)',                 btns:['btn-urazy'] },
  { key:'kvalita',    label:'KZP / TePř / zkoušky',             btns:['btn-kvalita'] },
  { key:'chat',       label:'Chat',                             btns:['btn-chat'] },
  { key:'sprava',     label:'Správa uživatelů a práv',          btns:['btn-sprava'] },
  { key:'prepinac',   label:'Přepínač mezi appkami (rozcestník)',     btns:[] },
  { key:'beruska',    label:'Nahlásit chybu / vylepšení',       btns:['btn-report'] }
];

/* Výchozí práva podle role. Individuální perms[key] má vždy přednost. */
var ROLE_PERMS = {
  admin:          '*',
  dispecer:       ['dnes','plan','pokladka','dispecink','objednavky','stavby','ciselniky','vazni','foto','chat','prepinac','beruska'],
  vedouciProvozu: '*',
  stavbyvedouci:  ['dnes','plan','pokladka','dispecink','objednavky','stavby','ciselniky','vazni','foto','dochazka','stroje','vydani','material','urazy','kvalita','chat','prepinac','beruska'],
  mistr:          ['dnes','plan','vazni','foto','dochazka','stroje','material','chat','beruska'],
  doprava:        ['dispecink','objednavky','chat','beruska'],
  ctenar:         ['dnes','plan','dispecink','foto','chat','beruska']
};
var ROLE_LABEL = {
  admin:'Administrátor', dispecer:'Dispečer', vedouciProvozu:'Vedoucí provozu',
  stavbyvedouci:'Stavbyvedoucí', mistr:'Mistr', doprava:'Doprava',
  ctenar:'Jen čtení'
};

window.currentUser = null;
window.allUsers = {};
window._usersLoaded = false;

function myUid(){ return (window.currentUser && window.currentUser.uid) || null; }
function myRecord(){ var u = myUid(); return (u && window.allUsers[u]) || {}; }
function myRole(){ return myRecord().role || (isDemoMode() ? 'admin' : 'ctenar'); }

function jeAdminEmail(email){
  return ADMIN_EMAILS.indexOf(String(email || '').trim().toLowerCase()) !== -1;
}
function isAdmin(uid){
  uid = uid || myUid();
  if(!uid) return false;
  if(ADMIN_UIDS.indexOf(uid) !== -1) return true;
  var u = window.allUsers[uid] || {};
  if(jeAdminEmail(u.email)) return true;
  if(uid === myUid() && jeAdminEmail((window.currentUser || {}).email)) return true;
  return u.role === 'admin';
}
function isBlocked(uid){
  uid = uid || myUid(); if(!uid) return false;
  return !!(window.allUsers[uid] && window.allUsers[uid].blocked);
}

function hasPerm(feature){
  var me = myUid();
  if(!me) return false;
  if(isBlocked()) return false;
  if(isAdmin()) return true;
  // Účet smazaný administrátorem (nebo záznam chybí) → nic. Kdyby se sem spadlo
  // na výchozí roli, měl by smazaný uživatel najednou víc práv, ne míň.
  if(window._usersLoaded && !window.allUsers[me]) return false;
  var u = myRecord();
  if(u.perms && u.perms[feature] === true)  return true;    // individuální doplněk
  if(u.perms && u.perms[feature] === false) return false;   // individuální odebrání
  var def = ROLE_PERMS[u.role || 'ctenar'];
  if(def === '*') return true;
  return !!(def && def.indexOf(feature) !== -1);
}
/* Guard na vstupu funkce. Schovat tlačítko nestačí — tohle patří do KAŽDÉ open*(). */
function needPerm(feature){
  if(hasPerm(feature)) return true;
  var f = FEATURES.filter(function(x){ return x.key === feature; })[0];
  showToast(((f && f.label) || feature) + ' Ti administrátor nepovolil.', 3000);
  return false;
}
/* Skryje tlačítka funkcí, na které uživatel nemá právo. */
function applyPermsToUI(){
  if(!myUid()) return;
  FEATURES.forEach(function(f){
    var on = hasPerm(f.key);
    (f.btns||[]).forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.style.display = on ? '' : 'none';
    });
  });
  document.querySelectorAll('[data-perm]').forEach(function(el){
    el.style.display = hasPerm(el.getAttribute('data-perm')) ? '' : 'none';
  });
  // Plovoucí přepínač staveb z rozcestníku OZ-JIH
  window.MSWState = { override: hasPerm('prepinac') };
  if(typeof window.MSWInit === 'function') window.MSWInit(window.MSWState);
}

/* ── Přístup ke stavbám ──────────────────────────────────────────────── */
/* Kdo vidí všechny stavby: admin, vedoucí provozu, dispečer. Ostatní jen svoje. */
function seesAllStavby(){
  var r = myRole();
  return isAdmin() || r === 'vedouciProvozu' || r === 'dispecer';
}
function canAccessStavba(sid){
  if(!sid) return false;
  if(seesAllStavby()) return true;
  var u = myRecord();
  return !!(u.stavby && u.stavby[sid]);
}
/* „Malý admin" — stavbyvedoucí, který stavbu založil, spravuje přístupy k ní. */
function isStavbaAdmin(sid){
  if(seesAllStavby()) return true;
  var s = (window.allStavby || {})[sid];
  if(!s) return false;
  return s.vlastnikUid === myUid() || !!(s.admini && s.admini[myUid()]);
}

/* ============================================================================
 * PŘIHLÁŠENÍ
 * ========================================================================== */
function showAuthError(msg){
  var el = document.getElementById('auth-error'); if(el) el.textContent = msg || '';
}
var AUTH_POHLEDY = ['main','telefon','jmeno','email','pending'];
function _setAuthView(name){
  AUTH_POHLEDY.forEach(function(v){
    var el = document.getElementById('auth-view-' + v);
    if(el) el.classList.toggle('on', v === name);
  });
  showAuthError('');
}
function showMainView(){ _setAuthView('main'); }
function showPhoneView(){ _setAuthView('telefon'); setTimeout(function(){ var e=document.getElementById('tel-input'); if(e) e.focus(); },80); }
function showNameView(){ _setAuthView('jmeno'); setTimeout(function(){ var e=document.getElementById('jmeno-input'); if(e) e.focus(); },80); }
function showEmailView(){ _setAuthView('email'); setTimeout(function(){ var e=document.getElementById('mail-input'); if(e) e.focus(); },80); }

/* ── Přihlášení jménem a telefonem (bez SMS) ─────────────────────────────
 * Stejné jako v ostatních appkách: člověk napíše číslo a celé jméno, appka
 * si ho zapamatuje a přihlásí ho anonymním účtem Firebase. Není to ověření
 * totožnosti — skutečnou branou je schválení administrátorem. */
function startPhoneLogin(){
  var tel = (document.getElementById('tel-input').value || '').trim();
  if(tel.replace(/\D/g,'').length < 9){ showAuthError('Zadej celé telefonní číslo.'); return; }
  window._prihlasTelefon = tel;
  showNameView();
}
function savePhoneUserName(){
  var jmeno = (document.getElementById('jmeno-input').value || '').trim();
  if(jmeno.split(/\s+/).length < 2){
    showAuthError('Napiš celé jméno i příjmení — podle toho Tě administrátor pozná.'); return;
  }
  if(!fbAuth){ showAuthError('Přihlášení není nastavené.'); return; }
  localStorage.setItem('pokladky_jmeno', jmeno);
  localStorage.setItem('pokladky_telefon', window._prihlasTelefon || '');
  fbAuth.signInAnonymously()
    .then(function(res){ completeLogin(res.user, jmeno, window._prihlasTelefon); })
    .catch(function(e){ showAuthError('Přihlášení se nepovedlo: ' + ((e && e.message) || e)); });
}

/* ── Přihlášení e-mailem a heslem ────────────────────────────────────────
 * Pro každého, kdo nemá Gmail (firemní pošta na Microsoftu apod.). */
function signInEmail(){
  var mail = (document.getElementById('mail-input').value || '').trim();
  var heslo = document.getElementById('heslo-input').value || '';
  if(!mail || !heslo){ showAuthError('Vyplň e-mail i heslo.'); return; }
  if(!fbAuth){ showAuthError('Přihlášení není nastavené.'); return; }
  fbAuth.signInWithEmailAndPassword(mail, heslo)
    .catch(function(e){
      var k = e && e.code;
      if(k === 'auth/user-not-found' || k === 'auth/invalid-credential'){
        showAuthError('Účet neexistuje, nebo nesedí heslo. Zakládáš se poprvé? Použij „Vytvořit účet".');
      } else if(k === 'auth/wrong-password'){ showAuthError('Nesprávné heslo.'); }
      else if(k === 'auth/invalid-email'){ showAuthError('Tohle není platný e-mail.'); }
      else { showAuthError('Přihlášení se nepovedlo: ' + ((e && e.message) || e)); }
    });
}
function registerEmail(){
  var mail = (document.getElementById('mail-input').value || '').trim();
  var heslo = document.getElementById('heslo-input').value || '';
  var jmeno = (document.getElementById('mail-jmeno-input').value || '').trim();
  if(!mail || !heslo){ showAuthError('Vyplň e-mail i heslo.'); return; }
  if(heslo.length < 6){ showAuthError('Heslo musí mít aspoň 6 znaků.'); return; }
  if(jmeno.split(/\s+/).length < 2){
    showAuthError('Napiš celé jméno i příjmení — podle toho Tě administrátor pozná.'); return;
  }
  if(!fbAuth){ showAuthError('Přihlášení není nastavené.'); return; }
  fbAuth.createUserWithEmailAndPassword(mail, heslo)
    .then(function(res){
      try { res.user.updateProfile({ displayName: jmeno }); } catch(e){}
      completeLogin(res.user, jmeno);
    })
    .catch(function(e){
      var k = e && e.code;
      if(k === 'auth/email-already-in-use'){ showAuthError('Na tenhle e-mail už účet existuje — přihlas se heslem.'); }
      else if(k === 'auth/weak-password'){ showAuthError('Heslo je moc slabé, dej aspoň 6 znaků.'); }
      else if(k === 'auth/invalid-email'){ showAuthError('Tohle není platný e-mail.'); }
      else { showAuthError('Založení účtu se nepovedlo: ' + ((e && e.message) || e)); }
    });
}

function signInWithGoogle(){
  if(!fbAuth){ showAuthError('Přihlášení zatím není nastavené (chybí Firebase projekt).'); return; }
  var p = new firebase.auth.GoogleAuthProvider();
  fbAuth.signInWithPopup(p).catch(function(e){
    if(e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')){
      sessionStorage.setItem('pendingGoogleRedirect','1');
      fbAuth.signInWithRedirect(p);
    } else { showAuthError('Přihlášení se nepovedlo: ' + ((e && e.message) || e)); }
  });
}
function signOutUser(){
  try { if(fbAuth) fbAuth.signOut(); } catch(e){}
  if(isDemoMode()){ localStorage.removeItem('pokladky_demo_user'); }
  localStorage.removeItem('pokladky_jmeno');
  localStorage.removeItem('pokladky_telefon');
  location.reload();
}

/* Dokončení přihlášení — společné pro Google i demo režim. */
function completeLogin(user, nameOverride, phoneOverride){
  var name = nameOverride || user.displayName || localStorage.getItem('pokladky_jmeno') ||
             (user.email ? user.email.split('@')[0] : 'uživatel');
  var tel  = phoneOverride || user.phoneNumber || localStorage.getItem('pokladky_telefon') || '';
  window.currentUser = {
    uid: user.uid, name: name, email: user.email || '', phone: tel,
    photo: user.photoURL || ''
  };
  var zpusob = user.isAnonymous ? 'telefon'
             : ((user.providerData || []).some(function(x){ return x && x.providerId === 'google.com'; }) ? 'google' : 'email');
  window.currentUser.zpusob = zpusob;
  var upd = { uid:user.uid, name:name, email:window.currentUser.email,
              photo:window.currentUser.photo, zpusob:zpusob, lastSeen:Date.now() };
  if(tel) upd.phone = tel;
  db.ref('uzivatele/' + user.uid).update(upd);

  db.ref('uzivatele/' + user.uid).once('value').then(function(snap){
    var u = snap.val() || {};
    if(u.blocked === true){
      window.currentUser = null;
      showAuthError('Tvůj přístup do aplikace zablokoval administrátor.');
      document.getElementById('auth-gate').classList.remove('hide');
      if(fbAuth) fbAuth.signOut();
      return;
    }
    // Pevně určený administrátor — vždy dovnitř a vždy s plnými právy.
    if(jeAdminEmail(window.currentUser.email)){
      if(u.role !== 'admin' || u.approved !== true){
        db.ref('uzivatele/' + user.uid).update({ role:'admin', approved:true });
      }
      _enterApp(); return;
    }
    // Nikdo jiný se administrátorem nestane sám od sebe — čeká na schválení.
    // (Dřív tu bylo pravidlo „kdo se přihlásí první, je admin". S pevně určeným
    //  administrátorem je zbytečné a byla by to díra: stačilo by se přihlásit dřív.)
    // Roli nepřiřazujeme sami — pravidla databáze zápis role povolí jen adminovi.
    // Novému člověku ji nastaví administrátor, když ho schvaluje.
    if(u.approved !== true && ADMIN_UIDS.indexOf(user.uid) === -1){
      _showPendingApproval(user.uid, name); return;
    }
    _enterApp();
  });
}

function _showPendingApproval(uid, name){
  var g = document.getElementById('auth-gate'); if(g) g.classList.remove('hide');
  _setAuthView('');
  var p = document.getElementById('auth-view-pending');
  if(p){
    p.classList.add('on');
    var nm = document.getElementById('pending-name'); if(nm) nm.textContent = name;
  }
  db.ref('uzivatele/' + uid + '/approved').on('value', function(s){
    if(s.val() === true){
      db.ref('uzivatele/' + uid + '/approved').off();
      if(p) p.classList.remove('on');
      _enterApp();
    }
  });
}

/* Vpuštění do aplikace — odsud se rozjíždí načítání dat všech modulů. */
function _enterApp(){
  var gate = document.getElementById('auth-gate'); if(gate) gate.classList.add('hide');
  vykresliOdznakUzivatele();

  loadAllUsers();
  if(typeof loadCiselniky === 'function') loadCiselniky();
  if(typeof loadStavby    === 'function') loadStavby();
  if(typeof loadPokladky  === 'function') loadPokladky();
  if(typeof loadDispecinkTydny === 'function') loadDispecinkTydny();
  if(typeof loadVazni === 'function') loadVazni();
}

/* Živě sleduje uživatele — po změně práv adminem se UI samo přepočítá. */
function loadAllUsers(){
  db.ref('uzivatele').on('value', function(snap){
    window.allUsers = snap.val() || {};
    window._usersLoaded = snap.exists();          // prázdná/nenačtená DB nikoho neodhlásí
    if(isBlocked()){ showToast('Přístup byl zablokován.', 6000); setTimeout(signOutUser, 1500); return; }
    // Administrátor mi smazal účet, zatímco appka běží.
    if(snap.exists() && myUid() && !window.allUsers[myUid()] && !jeAdminEmail((window.currentUser||{}).email)){
      showToast('Tvůj účet odstranil administrátor.', 4000);
      setTimeout(signOutUser, 1800); return;
    }
    applyPermsToUI();
    updateSchvaleniBadge();
    if(typeof renderSpravaUzivatelu === 'function' && document.getElementById('sprava-modal').classList.contains('open')) renderSpravaUzivatelu();
  });
}

/* ============================================================================
 * PŘEPÍNÁNÍ POHLEDŮ (spodní lišta)
 * ========================================================================== */
window.currentView = 'dnes';
function showView(name){
  var feat = { dnes:'dnes', plan:'plan', dispecink:'dispecink', vice:null }[name];
  if(feat && !needPerm(feat)) return;
  window.currentView = name;
  window._rezimMobil = jeMobil();          // v jakém rozvržení se teď kreslí
  document.querySelectorAll('.view').forEach(function(v){
    v.classList.toggle('active', v.id === 'view-' + name);
  });
  document.querySelectorAll('#tabbar button').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-view') === name);
  });
  document.getElementById('content').scrollTop = 0;
  var fn = window['render' + name.charAt(0).toUpperCase() + name.slice(1)];
  if(typeof fn === 'function') fn();
}

/* ── Modaly ──────────────────────────────────────────────────────────── */
function openModal(id){ var m = document.getElementById(id); if(m) m.classList.add('open'); }
function closeModal(id){ var m = document.getElementById(id); if(m) m.classList.remove('open'); }

/* ============================================================================
 * START
 * ========================================================================== */
function bootApp(){
  // Demo režim: přihlašování se přeskočí, pracuje se jako místní administrátor.
  if(isDemoMode()){
    var demo = null;
    try { demo = JSON.parse(localStorage.getItem('pokladky_demo_user') || 'null'); } catch(e){}
    if(!demo){
      demo = { uid:'demo-' + newId(), displayName:'Zkušební uživatel', email:'', photoURL:'' };
      localStorage.setItem('pokladky_demo_user', JSON.stringify(demo));
    }
    db.ref('uzivatele/' + demo.uid).update({
      uid:demo.uid, name:demo.displayName, role:'admin', approved:true, lastSeen:Date.now()
    });
    completeLogin(demo);
    var b = document.getElementById('demo-badge'); if(b) b.style.display = '';
    return;
  }
  // Ostrý režim — brána zůstane, dokud se někdo nepřihlásí.
  document.getElementById('auth-gate').classList.remove('hide');
  showMainView();
  if(sessionStorage.getItem('pendingGoogleRedirect')){
    sessionStorage.removeItem('pendingGoogleRedirect');
    fbAuth.getRedirectResult().catch(function(){});
  }
  fbAuth.onAuthStateChanged(function(user){
    if(user) completeLogin(user, user.isAnonymous ? localStorage.getItem('pokladky_jmeno') : null);
    else { window.currentUser = null; document.getElementById('auth-gate').classList.remove('hide'); showMainView(); }
  });
}

/* ============================================================================
 * DROBNÉ POMOCNÍKY ROZHRANÍ
 * ========================================================================== */

/* Úzký displej = telefon. Některé pohledy se na něm kreslí jinak
 * (dispečink a objednávky místo široké tabulky sázejí karty po dnech). */
function jeMobil(){ return window.innerWidth < 760; }

/* Kolik lidí čeká na schválení. Vidí to jen ten, kdo je smí schvalovat. */
function pocetCekajicich(){
  if(!hasPerm('sprava')) return 0;
  var n = 0;
  Object.keys(window.allUsers || {}).forEach(function(uid){
    var u = window.allUsers[uid] || {};
    if(u.approved !== true && !u.blocked) n++;
  });
  return n;
}
/* Rozsvítí upozornění na čekající: u avatara a na záložce Více. */
function updateSchvaleniBadge(){
  var n = pocetCekajicich();
  [['badge-schvaleni', 'user-badge'], ['badge-vice', null]].forEach(function(par){
    var el = document.getElementById(par[0]); if(!el) return;
    el.textContent = n > 9 ? '9+' : n;
    el.style.display = n ? 'flex' : 'none';
  });
  if(typeof renderDnes === 'function' && window.currentView === 'dnes') renderDnes();
}

/* Odznak uživatele v hlavičce — iniciály, nebo profilová fotka z Googlu. */
function vykresliOdznakUzivatele(){
  var el = document.getElementById('user-badge'); if(!el) return;
  var u = window.currentUser || {};
  var vnitrek;
  if(u.photo){
    vnitrek = '<img src="' + escapeHtml(u.photo) + '" alt="">';
  } else {
    var casti = String(u.name || '?').trim().split(/\s+/);
    var ini = (casti[0] || '?').charAt(0) + (casti.length > 1 ? casti[casti.length-1].charAt(0) : '');
    vnitrek = '<span class="ini">' + escapeHtml(ini.toUpperCase()) + '</span>';
  }
  el.innerHTML = vnitrek + '<span class="odznak" id="badge-schvaleni"></span>';
  updateSchvaleniBadge();
}

/* Ikony do prvků, které jsou napevno v index.html. */
function vykresliStatickeIkony(){
  var mapa = [
    ['tab-dnes',      'kalendar', 'Dnes'],
    ['tab-plan',      'tyden',    'Můj týden'],
    ['tab-dispecink', 'mrizka',   'Dispečink']
  ];
  mapa.forEach(function(m){
    var b = document.getElementById(m[0]); if(!b) return;
    b.innerHTML = ico(m[1], 22) + '<span>' + m[2] + '</span>' +
                  (m[0] === 'tab-dispecink' ? '<span class="tb-badge" id="badge-kolize"></span>' : '');
  });
  var vice = document.querySelector('#tabbar button[data-view="vice"]');
  if(vice) vice.innerHTML = ico('menu', 22) + '<span>Více</span>' +
                            '<span class="tb-badge" id="badge-vice"></span>';

  document.querySelectorAll('.modal-x').forEach(function(b){ b.innerHTML = ico('zavrit', 20); });
  var znak = document.getElementById('auth-znak');   if(znak) znak.innerHTML = ico('vrstvy', 28);
  var pend = document.getElementById('pending-ico'); if(pend) pend.innerHTML = ico('presypaci', 40);

  var par = [
    ['btn-nova-stavba','plus','Nová stavba'], ['cis-imp-btn','nahrat','Import z Excelu'],
    ['cis-seed-btn','vrstvy','Vložit běžnou sadu'], ['cis-back','zpet','Zpět na seznam'],
    ['cis-del','kos','Smazat'], ['st-delete','kos','Smazat stavbu'],
    ['osa-undo','zpet','Zpět bod'], ['osa-clear','kos','Vymazat osu']
  ];
  par.forEach(function(p){
    var b = document.getElementById(p[0]); if(!b) return;
    b.innerHTML = ico(p[1], p[0].indexOf('cis-del')===0 || p[0]==='st-delete' ? 16 : 17) + '<span>' + p[2] + '</span>';
  });
}

/* Překreslí aktuální pohled, když se změní šířka natolik, že se mění rozvržení
 * (otočení telefonu, zvětšení okna na počítači). Režim si pamatuje ten pohled,
 * který se naposledy kreslil — jinak by se po načtení na ještě neustálené
 * šířce zobrazilo mobilní rozvržení na širokém displeji. */
window._rezimMobil = null;
function prekresliPriZmeneSirky(){
  var m = jeMobil();
  if(window._rezimMobil === m) return;
  window._rezimMobil = m;
  try { showView(window.currentView); } catch(e){}
}
(function sledujSirku(){
  var t = null;
  function napln(){ clearTimeout(t); t = setTimeout(prekresliPriZmeneSirky, 180); }
  window.addEventListener('resize', napln);
  window.addEventListener('orientationchange', napln);
  window.addEventListener('load', napln);
})();
