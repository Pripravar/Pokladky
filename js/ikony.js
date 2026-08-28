/* ============================================================================
 * POKLÁDKY — js/ikony.js
 * Jednotná sada kreslených ikon (inline SVG).
 *
 * Proč ne emoji: emoji se na každém telefonu kreslí jinak, jsou barevné,
 * různě velké a působí lacině. Tyhle ikony mají všude stejnou tloušťku tahu,
 * dědí barvu textu (currentColor) a nic se kvůli nim nestahuje ze sítě.
 * ========================================================================== */

var IKONY = {
  /* navigace */
  kalendar:  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tyden:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M3 9h18"/>',
  mrizka:    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  menu:      '<path d="M3 6h18M3 12h18M3 18h18"/>',

  /* ovládání */
  plus:      '<path d="M12 5v14M5 12h14"/>',
  vlevo:     '<path d="M15 18l-6-6 6-6"/>',
  vpravo:    '<path d="M9 18l6-6-6-6"/>',
  dolu:      '<path d="M6 9l6 6 6-6"/>',
  zavrit:    '<path d="M18 6L6 18M6 6l12 12"/>',
  fajfka:    '<path d="M20 6L9 17l-5-5"/>',
  zpet:      '<path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  hledat:    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  nastaveni: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',

  /* stav */
  vystraha:  '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  zamek:     '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  info:      '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  presypaci: '<path d="M6 2h12M6 22h12M8 2v4a4 4 0 0 0 4 4 4 4 0 0 0 4-4V2M8 22v-4a4 4 0 0 1 4-4 4 4 0 0 1 4 4v4"/>',
  brouk:     '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M9 6a3 3 0 0 1 6 0M19 8l-3 1.5M5 8l3 1.5M20 13h-4M4 13h4M19 18l-3-1.5M5 18l3-1.5"/>',

  /* věci ze stavby */
  stavba:    '<path d="M1 6l7-3 8 3 7-3v15l-7 3-8-3-7 3V6z"/><path d="M8 3v15M16 6v15"/>',
  misto:     '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  hodiny:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  parta:     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M17 3.1a4 4 0 0 1 0 7.75"/>',
  osoba:     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  obalovna:  '<path d="M2 20V9l6 4V9l6 4V5h4a2 2 0 0 1 2 2v13z"/><path d="M2 20h20"/>',
  auto:      '<rect x="1" y="5" width="14" height="11" rx="1.5"/><path d="M15 9h4l4 4v3h-8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  stroj:     '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-8 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-8l-3.7 3.8z"/>',
  vrstvy:    '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  smes:      '<circle cx="7" cy="16" r="3"/><circle cx="15" cy="17" r="2.2"/><circle cx="12" cy="10" r="2.6"/><circle cx="18" cy="11" r="1.8"/><circle cx="6" cy="9" r="1.7"/>',

  /* moduly */
  vaha:      '<path d="M12 3v18M8 21h8M5 7h14"/><path d="M5 7L2 14h6zM19 7l-3 7h6z"/>',
  foto:      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  galerie:   '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  palivo:    '<path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M2 22h12M6 8h4"/><path d="M17 8l3 3v8a2 2 0 0 1-4 0v-5h-3"/>',
  penize:    '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15 9.2A3.4 3.4 0 0 0 12.3 8h-1.1a2 2 0 0 0 0 4h1.6a2 2 0 0 1 0 4h-1.1A3.4 3.4 0 0 1 9 14.8"/>',
  material:  '<path d="M12 2L3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
  lekarna:   '<rect x="2" y="6" width="20" height="15" rx="2"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M12 11v5M9.5 13.5h5"/>',
  laborator: '<path d="M10 2v6.3L4.6 18A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-3L14 8.3V2"/><path d="M9 2h6M7.6 14h8.8"/>',
  seznam:    '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  dokument:  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',

  /* akce */
  stahnout:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  nahrat:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  kopirovat: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  mail:      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  kos:       '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>',
  tuzka:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>'
};

/* Vrátí inline SVG ikonu. Velikost v pixelech, barvu dědí z textu. */
function ico(nazev, velikost){
  var d = IKONY[nazev];
  if(!d) return '';
  var s = velikost || 18;
  return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
         'aria-hidden="true">' + d + '</svg>';
}
