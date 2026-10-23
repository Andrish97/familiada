# E27 — podział tłumaczeń na części (wspólna + strony)

## Decyzje

- **2026-10-23 (użytkownik):** słowniki `web/shared/translation/{pl,en,uk}.js`
  dzielimy na część wspólną i części stron. Powody: strona wczytuje dziś cały
  słownik (pl 150 KB, uk 209 KB; gzip 40–50 KB), a przełącznik języka pobierał
  wszystkie trzy; zmiana jednego tekstu oznaczała zmianę pliku wczytywanego
  przez każdą stronę, więc `scripts/screens/run.cjs --changed` odświeżał
  wszystkie sceny, a e2e nie dało się pominąć „bo nic nie dotknęło speca”;
  trzy wielkie pliki były też źródłem konfliktów między sesjami.
- **2026-10-23 (użytkownik):** panel admina (`web/settings`) jest dla
  polskojęzycznych administratorów — jego teksty mogą być wpisane na sztywno po
  polsku, bez kluczy tłumaczeń. Tłumaczone zostają tylko teksty, które trafiają
  do użytkowników: maile (np. `pollSharePanel.mailDisabled` przy wysyłce) i podgląd
  strony przerwy (`maintenance.*`). Zastosowane od razu: `admin-pwa.js` bez
  `t()`, klucze `games.pwaInstall.admin*` i `games.iosWebapp.admin*` usunięte.

## Układ

```
web/shared/translation/
  translation.js          t(), initI18n() …, nazwy i ikony języków (LANG_META)
  pl/common.js            część wspólna — każda strona
  pl/<część>.js           części stron (games, control, polls, …)
  pl/server.js            teksty składane przez serwer (maile auth, kontakt,
                          SSR Giełdy, maile udostępnień) — strony go nie wczytują
  en/…, uk/…              ten sam podział
```

- Sekcja najwyższego poziomu (`games`, `pollGo`, …) leży w dokładnie jednej
  części, w każdym języku w tej samej. Część = plik `const <lang> = { … };
  export default <lang>;` (format czytany przez Workera i funkcję `send-email`).
- Strona wczytuje `common` i części z `<meta name="i18n-parts" content="…">`
  w swoim HTML. Listę wylicza **generator** `node scripts/i18n-parts.mjs`
  z grafu importów strony (HTML → moduły JS → klucze `sekcja.…`); zapadka
  `unit/i18nParts.test.js` pilnuje, że meta jest aktualna.
- `t()` dla sekcji, której strona nie wczytała, pisze w konsoli
  `[i18n] brak sekcji …` (system zrzutów to zgłasza).
- Moduły wspólne (`web/shared/js`) używają kluczy z `common` albo z części,
  które i tak wczytują wszystkie ich strony — pojedyncze klucze pożyczane
  z dużych sekcji stron zostały przeniesione (lista niżej).
- Zrzuty: zmiana `<lang>/<część>.js` wybiera tylko sceny stron z tą częścią
  w meta (`common` — wszystkie), `scripts/screens/changes.cjs`.

## Przeniesione klucze (moduły wspólne pożyczały z sekcji stron)

| było | jest | kto używa |
|---|---|---|
| `games.nav.*` | `nav.menu.*` | topbar, przyciski menu na stronach |
| `baseExplorer.search.clear` | `common.clear` | `list-search.js`, `share-sections.js`, Menedżer bazy, edytor logo |
| `privacy.contact.rateLimited` | `contact.rateLimited` | `contact-modal.js` |
| `games.editAfterPoll.*` | `gameValidate.editAfterPoll.*` | `game-validate.js` |
| `editor.alert.resetFailed` | `gameValidate.resetFailed` | `game-validate.js` |
| `control.shareDeviceModal.friendMailDisabled` | `contacts.friendMailDisabled` | `contacts-page.js`, Bazy, Control |
| `bases.badges.from` | `resourceSend.from` (ten sam tekst już był) | `proposed-tile.js`, Bazy |
| `bases.badges.proposed`, `bases.proposed.accept/decline` | `resourceSend.proposed/accept/decline` | `proposed-tile.js` |
| `control.finalBadge/finalPoolHint/finalPoolEmpty/finalPickEmpty/finalListHint`, `control.ingameGuard.*`, `control.sfxChooseFile/sfxCustom/sfxDesc/sfxResetAll/sfxTooLong` | `gameSettings.*` (te same nazwy) | Ustawienia gry (Control wczytuje `gameSettings`) |
| `control.dash` | `common.emDash` | Control, Moje gry |
| `control.shareDeviceModal.shareSelected/shareSelectedN/shareSelectedShortN` | `contacts.*` | Bazy, Control |
| `logoEditor.editor.nameLabel` | `common.nameLabel` | edytory logo, edytor pytań |
| `index.captchaRequired`, `errInvalidEmail`, `errResendCooldown(Generic)`, `errResetMissingLogin`, `errUsernameTaken`, `statusError`, `errNoSession` | `auth.*` | `auth.js`, `contact-modal.js`, Konto, Logowanie |

Pożyczki między stronami (np. Ustawienia gry ← `control.*`, Gry ← `polls.results.*`)
zostają: strona wczytuje wtedy część sąsiedniej strony (meta z generatora).

## Kroki wdrożenia

1. Branch: przeniesienie kluczy, podział, runtime, generator, narzędzia
   (`i18n-unused`, `i18n-prune`, `sync-notification-mail-texts`), testy unit,
   `changes.cjs`; wszystkie sceny zrzutów bez `[i18n]`.
2. e2e kodu z brancha (punktowo: logowanie, gry, ankieta, Control).
3. Push A na `main`: tylko `<lang>/server.js` (kopie sekcji serwera) + Worker
   i `send-email` czytające `server.js` — stare pliki jeszcze istnieją, więc
   nie ma okna, w którym serwer nie znajduje tekstów.
4. Push B na `main`: podział (usunięcie `{pl,en,uk}.js`).
5. Kontrola produkcji (te same spece + mail auth).
