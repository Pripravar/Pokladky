# Pokládky — M - SILNICE a.s.

Jedna aplikace pro celou pokládku: plán pokládek, dispečink napříč stavbami,
objednávka balené a nasazení aut. Postaveno podle konceptu z 19. 8. 2026.

**Stav: fáze 0 a 1 hotové** (kostra, stavby, číselníky, karta pokládky, můj týden,
dispečink s kolizemi, objednávky). Fáze 2–5 viz „Co přijde dál".

---

## Poslat kolegovi na vyzkoušení

```bash
python3 build-ukazka.py
```

Vznikne **jeden soubor `Pokladky-ukazka.html`**, který se dá poslat mailem nebo přes Teams —
otevře se na jakémkoliv telefonu i počítači, nic se nemusí instalovat. Uvnitř je všechno
včetně mapové knihovny, takže funguje i bez signálu. Při prvním otevření se naplní
ukázkovými daty (tři stavby, party, týden pokládek i s kolizemi). Data zůstávají
v prohlížeči toho, kdo si ukázku otevře.

Soubor `Pokladky-ukazka-odkaz.html` je tatáž ukázka bez vlastní hlavičky dokumentu —
slouží k publikování jako sdílený odkaz.

Ukázka **není** ostrá aplikace: nemá přihlašování, nesdílí data mezi lidmi, nenačte
mapový podklad a neuloží soubor do počítače (kopírování do schránky funguje).

---

## Ukázkový režim (bez databáze)

Aplikace ho umí, ale **teď je vypnutý**, protože má vyplněnou ostrou databázi.
Zapne se sám, kdyby `FIREBASE_CONFIG.apiKey` v `js/core.js` obsahoval slovo
`PLACEHOLDER` — pak se nepřihlašuje, data si ukládá jen v prohlížeči a
`js/ukazka.js` je naplní ukázkovými pokládkami. Slouží k tomu příkaz
`build-ukazka.py`, který z toho udělá jeden soubor k rozeslání.

```bash
python3 -m http.server 8899
```

Pak otevřít <http://localhost:8899/>. Zkušební data se smažou v **Více → Demo režim**.

---

## Stav nasazení

**Firebase je hotový** (2026-08-28):

| co | stav |
|---|---|
| projekt | `pokladky-msilnice` — [konzole](https://console.firebase.google.com/project/pokladky-msilnice) |
| Realtime Database | běží v **europe-west1** (Belgie, data zůstávají v EU) |
| pravidla | nasazená z `database.rules.json` — ověřeno útokem: nepřihlášený nepřečte ani nezapíše nic (HTTP 401) |
| přihlašování | Google, zapnuté |
| povolené domény | `pripravar.github.io`, `localhost` |
| config | vyplněný v `js/core.js` |
| plán | Spark (zdarma). Blaze bude potřeba až na Cloud Functions (push notifikace, AI u vážních lístků). |

**GitHub repozitář je založený:** [Pripravar/Pokladky](https://github.com/Pripravar/Pokladky).
Kód je lokálně zacommitovaný a nastavený na tenhle vzdálený repozitář.

### Zbývá udělat (vy)

1. **Odeslat kód** — v GitHub Desktop: *File → Add Local Repository* → vybrat složku
   `aplikace pokládky/Pokladky` → *Push origin*.
2. **Zapnout GitHub Pages** — v repozitáři *Settings → Pages → Source: Deploy from a branch*,
   větev `main`, složka `/ (root)`. Za 1–2 minuty poběží na
   `https://pripravar.github.io/Pokladky/`.
3. **Přihlásit se jako první** — **první přihlášený se automaticky stane administrátorem.**
   Ať jste to vy, ne někdo jiný. Každého dalšího pak schvalujete ve *Více → Správa uživatelů*.
4. **Přidat do rozcestníku** — v `Rozcestnik/OZ-JIH/stavby.json` do `nastroje[]`:
   ```json
   {"ico":"🛣️","name":"Pokládky","desc":"Plán pokládek, dispečink, nasazení a balená.",
    "url":"https://pripravar.github.io/Pokladky/","status":"live"}
   ```

### Proč veřejný repozitář nevadí

Na GitHubu je **jen kód** — žádná data. Pokládky, lidi, stroje i docházka jsou ve Firebase
za přihlášením. Firebase config v `js/core.js` (včetně `apiKey`) je u webových aplikací
veřejný vždycky a sám o sobě nikomu nic neotevře — je to adresa, ne klíč. Data chrání
**pravidla databáze**: kdo není přihlášený a schválený administrátorem, nepřečte ani nezapíše
nic. Ověřeno přímým dotazem zvenčí:

```bash
curl "https://pokladky-msilnice-default-rtdb.europe-west1.firebasedatabase.app/pokladky.json"
# → HTTP 401 {"error":"Permission denied"}
```

Do repozitáře **nikdy nepatří servisní klíč** (`*serviceAccount*.json`) — to je master heslo
k databázi. `.gitignore` ho už blokuje.

---

## Architektura

Na rozdíl od aplikací staveb **není** všechno v jednom `index.html`. Kód je rozdělený
na moduly — pořád bez buildu, pořád obyčejné `<script src>`, funkce jsou globální.
Úprava jedné věci tak znamená sáhnout na jeden soubor o pár set řádcích.

| soubor | co dělá |
|---|---|
| `js/ikony.js` | sada kreslených ikon (inline SVG, žádná emoji) |
| `js/core.js` | konfigurace, databáze, přihlášení, uživatelé, práva, přepínání pohledů |
| `js/mapa.js` | mapové podklady, kreslení osy, přepočet GPS ↔ staničení |
| `js/ciselniky.js` | lidi, stroje, party, obalovny, směsi, dopravci + import z Excelu |
| `js/stavby.js` | stavby a přepínání mezi nimi |
| `js/pokladka.js` | karta pokládky + dopočty (tuny, počet aut) |
| `js/plan.js` | „Můj týden" |
| `js/dispecink.js` | společný plán všech staveb + kolize |
| `js/objednavky.js` | balená a nasazení — tabulky a exporty |
| `js/dnes.js` | úvodní obrazovka a nabídka „Více" |
| `js/sprava.js` | správa uživatelů, rolí a práv |

**Pozor na cache.** Modulů je víc, takže by šlo skončit s půlkou staré a půlkou nové
verze. Proto: service worker jede „nejdřív síť, cache jako záloha" a při **každém**
nasazení se zvedne `CACHE_VERSION` v `service-worker.js` a `?v=` u `<script>` v `index.html`.

---

## Vzhled

Psáno pro telefon do ruky — často v rukavicích, na slunci a ve spěchu:

- **jeden sloupec**, dotykové plochy nejméně 48 px, políčka písmem 16 px (iOS pak
  při psaní nezvětšuje stránku)
- **čísla jsou hrdina obrazovky** — tuny, tloušťka a plocha velkým tučným písmem
  s pevnou šířkou číslic, aby pod sebou lícovala
- **kreslené ikony místo emoji** (`js/ikony.js`) — všude stejná tloušťka tahu,
  dědí barvu textu a nic se kvůli nim nestahuje ze sítě
- **barva jen tam, kde nese význam** — červená je kolize a hlavní akce, zelená potvrzeno,
  oranžová čeká
- **rozvržení se mění podle šířky**: do 760 px se dispečink i objednávky sázejí po dnech
  (sedmisloupcová tabulka se na telefonu nedá číst), nad 760 px jako tabulka
- panely vyjíždějí zespodu jako v telefonu; kdo má vypnuté animace, dostane je bez pohybu

---

## Jak to celé zapadá do sebe

Stavbyvedoucí vyplní **jednu kartu pokládky**. Z ní appka odvodí:

- **tuny** z plochy a tloušťky (nebo obráceně plochu z tun),
- **návrh počtu aut**: `výkon party [t/h] × obrátka [h] / nosnost [t]`,
  kde `obrátka = 2 × jízda z obalovny + 15 min nakládka + 12 min vykládka`
  (jízda z vzdálenosti obalovna → začátek stavby, koeficient 1,3 a 50 km/h),
- **řádek do objednávky balené** i **do nasazení aut**,
- **řádek do společného týdenního plánu**.

Návrh aut je **jen návrh** — poslední slovo má vždy stavbyvedoucí.

**Kolize** se počítají nad celým týdnem: parta 2× v jeden den · stroj na dvou místech ·
člověk na dvou místech · obalovna přes denní kapacitu · víc aut, než dopravce má.

---

## Co přijde dál

| fáze | obsah |
|---|---|
| 2 | vážní lístky (foto → AI vytáhne tuny a směs), fotky/galerie, docházka/šichtovka |
| 3 | tankování strojů, servisy a servisní intervaly |
| 4 | drobná vydání, spotřební materiál, formulář úrazu |
| 5 | KZP/TePř, objednávání laboratoře, 360° procházka |

Průřezově: chat, push notifikace, hlášení chyb (beruška), novinky.
