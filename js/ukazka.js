/* ============================================================================
 * POKLÁDKY — js/ukazka.js
 * Ukázková data pro režim bez databáze.
 *
 * Spustí se JEN tehdy, když appka nemá vyplněný Firebase (isDemoMode) — tedy
 * na veřejné ukázce, kterou si někdo otevře, aby si appku proklikal. Jakmile
 * se doplní ostrá databáze, tenhle soubor už nikdy nic nezapíše.
 *
 * Data zůstávají v prohlížeči toho, kdo si ukázku otevřel; nikam se neodesílají.
 * ========================================================================== */
function naplnUkazkovaData(){
  if(!isDemoMode()) return;                                  // v ostrém provozu ani ťuk

  if(localStorage.getItem('pokladky_ukazka_v1') === '1') return;
  localStorage.setItem('pokladky_ukazka_v1', '1');

  var po = weekMonday(ymd());
  var ut = addDays(po,1), st = addDays(po,2), ct = addDays(po,3), pa = addDays(po,4);

  var lide = {
    L1:{jmeno:'Jan Novák',    profese:'finišerista'},
    L2:{jmeno:'Petr Dvořák',  profese:'řidič válce'},
    L3:{jmeno:'Josef Malý',   profese:'mistr'},
    L4:{jmeno:'Marek Beneš',  profese:'dlaždič'},
    L5:{jmeno:'Tomáš Kříž',   profese:'řidič válce'}
  };
  var stroje = {
    S1:{nazev:'Vögele S1800',       typ:'finišer', spz:'1AB 1111', mth:4200, servisIntervalMth:500, posledniServisMth:4000},
    S2:{nazev:'Hamm HD+ 90',        typ:'válec',   spz:'2CD 2222', mth:3100, servisIntervalMth:500, posledniServisMth:2900},
    S3:{nazev:'Bomag BW 154',       typ:'válec',   spz:'3EF 3333', mth:2450, servisIntervalMth:500, posledniServisMth:2200},
    S4:{nazev:'Wirtgen W 100',      typ:'fréza',   spz:'4GH 4444', mth:1980, servisIntervalMth:500, posledniServisMth:1800},
    S5:{nazev:'Vögele S1300 (malý)',typ:'finišer', spz:'5IJ 5555', mth:1120, servisIntervalMth:500, posledniServisMth:900}
  };
  var party = {
    P1:{nazev:'Parta 1 – Novák',  vedouciId:'L3', vykonTh:70, lide:['L1','L2','L3'], stroje:['S1','S2']},
    P2:{nazev:'Parta 2 – Dvořák', vedouciId:'L2', vykonTh:55, lide:['L2','L4'],      stroje:['S2','S3']},
    P3:{nazev:'Parta 3 – malá',   vedouciId:'L4', vykonTh:35, lide:['L4','L5'],      stroje:['S5','S3']}
  };
  var obalovny = {
    O1:{nazev:'Obalovna Chrudim',    lat:49.9510, lng:15.7950, kapacitaTden:600, kontakt:'+420 601 111 222'},
    O2:{nazev:'Obalovna Havl. Brod', lat:49.6100, lng:15.5800, kapacitaTden:450, kontakt:'+420 602 333 444'}
  };
  var dopravci = {
    D1:{nazev:'Doprava Široký', kontakt:'+420 603 555 666', pocetVan:8, nosnostVana:24, pocetOsmikolek:4, nosnostOsmikolka:16}
  };
  var stavby = {
    ST1:{nazev:'II/150 Nasavrky – průtah', kod:'2026-114', stav:'aktivni', objednatel:'KSÚS Pardubice',
         osa:{ body:[[49.8420,15.8010],[49.8455,15.8120],[49.8480,15.8240]], kmStart:12.5, kmEnd:14.284, delkaM:1784 }},
    ST2:{nazev:'III/3405 Slatiňany',       kod:'2026-121', stav:'aktivni', objednatel:'KSÚS Pardubice',
         osa:{ body:[[49.8700,15.8300],[49.8760,15.8420]], kmStart:0, kmEnd:1.1, delkaM:1100 }},
    ST3:{nazev:'II/343 Ždírec – obchvat',  kod:'2026-098', stav:'aktivni', objednatel:'Kraj Vysočina',
         osa:{ body:[[49.6900,15.8100],[49.6960,15.8250],[49.7010,15.8390]], kmStart:3.2, kmEnd:5.4, delkaM:2200 }}
  };

  function zapis(cesta, obj, extra){
    Object.keys(obj).forEach(function(k){
      db.ref(cesta + '/' + k).update(Object.assign({ ts:Date.now() }, obj[k], extra || {}));
    });
  }
  zapis('ciselniky/lide', lide);
  zapis('ciselniky/stroje', stroje);
  zapis('ciselniky/party', party);
  zapis('ciselniky/obalovny', obalovny);
  zapis('ciselniky/dopravci', dopravci);

  SEED_SMESI.forEach(function(s, i){ db.ref('ciselniky/smesi/M' + i).update(Object.assign({ ts:Date.now() }, s)); });
  var smes = function(kod){
    for(var i=0;i<SEED_SMESI.length;i++) if(SEED_SMESI[i].kod === kod) return 'M' + i;
    return '';
  };

  var uid = (window.currentUser && window.currentUser.uid) || 'ukazka';
  Object.keys(stavby).forEach(function(k){
    db.ref('stavby/' + k).update(Object.assign({ vlastnikUid:uid, ts:Date.now() }, stavby[k]));
  });
  var mojeStavbyUpd = {};
  Object.keys(stavby).forEach(function(k){ mojeStavbyUpd['stavby/' + k] = true; });
  db.ref('uzivatele/' + uid).update(mojeStavbyUpd);

  /* Týden s pokládkami — schválně obsahuje i pár kolizí, ať je vidět, co appka hlídá. */
  var pokladky = [
    { id:'PK1', stavbaId:'ST1', datum:po, vrstva:'podkladni', smesId:smes('ACP 22+'), tloustkaMm:80,
      plochaM2:3200, tunyPlan:614, usek:{kmOd:12.5,kmDo:12.9,popis:'levý pruh'}, partaId:'P1',
      obalovnaId:'O1', dopravceId:'D1', typAuta:'vana', dopravaAut:5, casStart:'06:00', stav:'hotovo' },
    { id:'PK2', stavbaId:'ST1', datum:ut, vrstva:'loziska', smesId:smes('ACL 16+'), tloustkaMm:50,
      plochaM2:5000, tunyPlan:600, usek:{kmOd:12.5,kmDo:13.2,popis:'pravý pruh'}, partaId:'P1',
      obalovnaId:'O1', dopravceId:'D1', typAuta:'vana', dopravaAut:5, casStart:'06:00', stav:'potvrzeno' },
    { id:'PK3', stavbaId:'ST2', datum:ut, vrstva:'obrusna', smesId:smes('ACO 11+'), tloustkaMm:40,
      plochaM2:2000, tunyPlan:200, usek:{kmOd:0,kmDo:0.5,popis:''}, partaId:'P1',
      obalovnaId:'O1', dopravceId:'D1', typAuta:'vana', dopravaAut:6, casStart:'07:00', stav:'navrh' },
    { id:'PK4', stavbaId:'ST2', datum:st, vrstva:'obrusna', smesId:smes('ACO 11+'), tloustkaMm:40,
      plochaM2:3000, tunyPlan:288, usek:{kmOd:0.5,kmDo:1.1,popis:''}, partaId:'P2',
      obalovnaId:'O1', dopravceId:'D1', typAuta:'vana', dopravaAut:3, casStart:'06:00', stav:'potvrzeno' },
    { id:'PK5', stavbaId:'ST3', datum:st, vrstva:'loziska', smesId:smes('ACL 16+'), tloustkaMm:60,
      plochaM2:2400, tunyPlan:346, usek:{kmOd:3.2,kmDo:3.8,popis:'obchvat, první úsek'}, partaId:'P3',
      obalovnaId:'O2', dopravceId:'D1', typAuta:'osmikolka', dopravaAut:4, casStart:'06:30', stav:'potvrzeno' },
    { id:'PK6', stavbaId:'ST1', datum:ct, vrstva:'obrusna', smesId:smes('ACO 11 S'), tloustkaMm:40,
      plochaM2:5200, tunyPlan:499, usek:{kmOd:12.5,kmDo:13.2,popis:'oba pruhy'}, partaId:'P1',
      obalovnaId:'O1', dopravceId:'D1', typAuta:'vana', dopravaAut:5, casStart:'06:00', stav:'potvrzeno' },
    { id:'PK7', stavbaId:'ST3', datum:pa, vrstva:'obrusna', smesId:smes('ACO 11+'), tloustkaMm:40,
      plochaM2:2800, tunyPlan:269, usek:{kmOd:3.8,kmDo:4.5,popis:''}, partaId:'P3',
      obalovnaId:'O2', dopravceId:'D1', typAuta:'osmikolka', dopravaAut:3, casStart:'06:30', stav:'navrh' }
  ];
  pokladky.forEach(function(p){
    var id = p.id; delete p.id;
    db.ref('pokladky/' + id).update(Object.assign({ vytvorilUid:uid, vytvorilName:'Ukázka', ts:Date.now() }, p));
  });
}
