#!/usr/bin/env python3
"""
Sestaví JEDEN soubor `Pokladky-ukazka.html`, který jde poslat kolegovi odkazem.

Rozdíly proti ostré aplikaci:
  • všechny styly, skripty i mapová knihovna jsou vevnitř (nic se nestahuje ze sítě)
  • bez Firebase a bez přihlašování — data zůstávají v prohlížeči toho, kdo ukázku otevře
  • bez přepínače appek z rozcestníku a bez service workeru
  • při prvním otevření se naplní ukázkovými daty (tři stavby, party, týden pokládek)

Spuštění:  python3 build-ukazka.py
"""
import re, os, sys

KOREN = os.path.dirname(os.path.abspath(__file__))
def cti(*c): 
    with open(os.path.join(KOREN, *c), encoding='utf-8') as f: return f.read()

html = cti('index.html')

# ── 1) pryč s tím, co ukázka nepotřebuje ────────────────────────────────────
html = html.replace('<link rel="manifest" href="manifest.json">', '')
html = re.sub(r'\s*<script src="https://www\.gstatic\.com/firebasejs/[^"]+"></script>', '', html)
html = re.sub(r'\s*<!-- Plovoucí přepínač[^>]*-->\s*<script src="https://pripravar\.github\.io[^"]+"[^>]*></script>', '', html)
# poslední <script> blok (úklid plovoucí pilulky) je v ukázce zbytečný
html = re.sub(r'<script>\s*// Pilulka „Stavby".*?</script>', '', html, flags=re.S)
html = html.replace("if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(function(){});", '')

# ── 2) mapová knihovna dovnitř ──────────────────────────────────────────────
html = html.replace('<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>',
                    '<style>\n' + cti('_ukazka', 'leaflet.css') + '\n</style>')
html = html.replace('<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>',
                    '<script>\n' + cti('_ukazka', 'leaflet.js') + '\n</script>')

# ── 3) vlastní styly a moduly dovnitř ───────────────────────────────────────
html = re.sub(r'<link rel="stylesheet" href="css/app\.css\?v=\d+">',
              lambda m: '<style>\n' + cti('css', 'app.css') + '\n</style>', html)

def vloz_modul(m):
    soubor = m.group(1)
    return '<script>\n/* ==== ' + soubor + ' ==== */\n' + cti('js', soubor) + '\n</script>'
html = re.sub(r'<script src="js/([a-z]+\.js)\?v=\d+"></script>', vloz_modul, html)

# ── 4) mapový podklad se v ukázce nenačte — ať je to vidět a nemate to ──────
html = html.replace('</head>', '''<style>
/* V ukázce nejde stáhnout mapový podklad, čára osy se ale kreslí normálně. */
.mapa-box { position:relative; }
.mapa-box::before {
  content:'Mapový podklad se v ukázce nenačítá. Zakreslená osa i výpočty fungují.';
  position:absolute; inset:0; z-index:0; display:flex; align-items:center; justify-content:center;
  text-align:center; padding:24px; font-size:12.5px; line-height:1.6; color:var(--text-3);
}
.mapa-box .leaflet-container { position:relative; z-index:1; background:transparent; }
.ukazka-pas {
  background:var(--warn-soft); border-bottom:1px solid rgba(240,165,63,.3); color:var(--warn);
  font-size:12px; font-weight:600; text-align:center; padding:7px 14px; line-height:1.45;
}
</style>
</head>''')
html = html.replace('<div id="header">',
  '<div class="ukazka-pas">Ukázková verze — data zůstávají jen v tomhle prohlížeči</div>\n<div id="header">')

# ── 4a) ukázka NIKDY nesahá na ostrou databázi ──────────────────────────────
# Teď už má appka vyplněný ostrý Firebase. V ukázce ho musíme přebít zpátky na
# PLACEHOLDER, jinak by soubor rozeslaný kolegům chtěl přihlášení a psal by
# do skutečných dat. Ukázka má běžet výhradně nad prohlížečem toho, kdo ji otevře.
html = re.sub(r"apiKey:\s*'[^']*'", "apiKey:            'PLACEHOLDER_apiKey'", html, count=1)
if "PLACEHOLDER_apiKey" not in html:
    print('CHYBA: nepodařilo se vypnout ostrou databázi v ukázce!'); sys.exit(1)

# ── 4b) co v ukázce nejde, ať se netváří, že jde ────────────────────────────
# Stažení souboru a otevření pošty prohlížeč v ukázce zablokuje. Místo tlačítka,
# které nic neudělá, ukážeme vysvětlení. Kopírování do schránky funguje.
html = html.replace('</body>', '''<script>
(function omezeniUkazky(){
  var vysvetli = function(co){
    return function(){
      showToast('<b>' + co + '</b> funguje v ostré aplikaci.<br>' +
                'V ukázce to prohlížeč nedovolí — zkus <b>Kopírovat</b>, ' +
                'tabulka se vloží rovnou do Excelu.', 5000);
    };
  };
  window.objStahnoutCsv = vysvetli('Stažení pro Excel');
  window.objMail        = vysvetli('Odeslání e-mailem');
})();
</script>
</body>''')

# ── 5) ukázková data ────────────────────────────────────────────────────────


# přihlašovací brána se v ukázce neukazuje — logo Googlu by se stejně nenačetlo
html = re.sub(r'<img src="https://www\.gstatic\.com/firebasejs/ui[^>]*>', '', html)

# hlavička dokumentu
html = html.replace('<title>Pokládky — M - SILNICE</title>',
                    '<title>Pokládky M - SILNICE</title>')

vystup = os.path.join(KOREN, 'Pokladky-ukazka.html')
with open(vystup, 'w', encoding='utf-8') as f: f.write(html)

# ── 6) varianta pro sdílení odkazem ─────────────────────────────────────────
# Hostitel obalí obsah vlastní hlavičkou, takže se posílá jen obsah těla.
# Nastavení pro telefon (viewport) proto doplníme skriptem hned na začátku.
telo = html
telo = re.sub(r'^.*?<title>', '<title>', telo, flags=re.S)          # pryč vše před titulkem
telo = telo.replace('</head>', '', 1)
telo = re.sub(r'<body>\s*', '', telo, count=1)
telo = telo.replace('</body>', '').replace('</html>', '')
telo = re.sub(r'\s*<meta [^>]*>', '', telo)      # značky <meta> do těla nepatří
hlavicka = """<script>
/* Hostitelská stránka nemá nastavení zobrazení pro telefon — doplníme ho,
   jinak by se appka na mobilu vykreslila jako zmenšená plocha. */
(function(){
  function meta(n, o){ var m = document.createElement('meta'); m.name = n; m.content = o; document.head.appendChild(m); }
  if(!document.querySelector('meta[name=viewport]'))
    meta('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  meta('theme-color', '#1a2334');
  document.documentElement.lang = 'cs';
  document.documentElement.style.height = '100%';
})();
</script>
"""
artefakt = os.path.join(KOREN, 'Pokladky-ukazka-odkaz.html')
with open(artefakt, 'w', encoding='utf-8') as f: f.write(hlavicka + telo.strip() + '\n')
print('Pro sdílení odkazem: %s (%.0f kB)' % (artefakt, os.path.getsize(artefakt)/1024))
for zakazane in ['<!DOCTYPE', '<html', '<head>', '<body>']:
    if zakazane.lower() in open(artefakt, encoding='utf-8').read().lower():
        print('CHYBA: ve variantě pro odkaz zůstalo', zakazane); sys.exit(1)

# ── kontrola, že v souboru nezůstal žádný odkaz ven ─────────────────────────
zbyle = [u for u in re.findall(r'(?:src|href)="(https?://[^"]+)"', html) if 'leafletjs.com' not in u and 'mapy.com' not in u]
print('Hotovo: %s  (%.0f kB)' % (vystup, os.path.getsize(vystup)/1024))
print('Načítá ze sítě:', zbyle if zbyle else 'nic (jen odkazy v textu)')
if re.search(r'(?:src="js/|href="css/)', html):
    print('CHYBA: nějaký modul se nevložil!'); sys.exit(1)
print('Kontrola: všechny moduly vloženy.')
