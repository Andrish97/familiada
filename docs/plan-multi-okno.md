# Plan: testy e2e i audyt "wielu miejsc naraz" (karty/okna/urządzenia)

Status: 🔲 = do zrobienia | 🔄 = w trakcie | ✅ = zrobione

Kontekst: `tests/e2e/editor.spec.js` (20 testów) pokazało, że edytor gier
nie ma żadnej synchronizacji między kartami ani re-walidacji stanu gry
per-akcja — druga karta może cicho nadpisać/zignorować zmiany pierwszej.
Ten plik śledzi rozszerzenie tego audytu na resztę aplikacji i poprawki,
które z niego wynikają.

---

## Edytor gier (`js/pages/editor.js`)

✅ 20 testów e2e (`tests/e2e/editor.spec.js`) — limity, import, kolejność
(`ord`), blokady stanu gry (`poll_open`/`ready`), dwie karty naraz.

✅ Poprawka: puste pole pytania — fallback do domyślnego tekstu (tak jak
już działało dla odpowiedzi), zamiast próby zapisania pustego stringa
i cichego desyncu UI/bazy przy błędzie constraintu `questions_text_len`.

🔲 Poprawka: edycja pytania/odpowiedzi usuniętej w innej karcie kończy
się fałszywym "Zapisano." (UPDATE trafiający w 0 wierszy nie jest
rozpoznawany jako błąd). Niski priorytet — do zrobienia razem z resztą
audytu poniżej, nie osobno.

---

## Audyt "dwóch miejsc naraz" / niezamkniętych kart — 🔄 w trakcie

Ten sam wzorec co w edytorze (brak realtime sync, brak re-walidacji
stanu per-akcja) do sprawdzenia w:

- 🔲 `js/pages/polls.js` — panel zamykania ankiety tekstowej
- 🔲 `js/pages/game-settings.js` — zmiana ustawień rozgrywki
- 🔲 `base-explorer/` — edycja bazy pytań

Poza zakresem (świadomie pominięte na razie): samo prowadzenie
rozgrywki na żywo (`control/`) jako **osobny, następny punkt** — patrz
niżej.

---

## Control — zapis i przywracanie stanu rozgrywki — 🔲 NASTĘPNE

Znalezione podczas wstępnego przeglądu `control/js/store.js`:

- Cały stan rozgrywki (wynik, runda, faza, drużyny, timer finału) żyje
  wyłącznie w `localStorage` (`familiada:control:v5:<gameId>`), zapisywany
  przy każdej zmianie (`emit()` → `localStorage.setItem`).
- **Nic w całym repo nigdy tego nie odczytuje z powrotem** — brak
  `localStorage.getItem(KEY)` przy starcie, brak nasłuchu na zdarzenie
  `storage`. Odświeżenie karty control w trakcie gry zeruje cały postęp
  bez ostrzeżenia i bez możliwości odzyskania.
- `control/js/presence.js` śledzi tylko urządzenia display/host/buzzer —
  NIE samą kartę control. Dwie karty control tej samej gry (ten sam
  komputer albo dwa różne) działają całkowicie niezależnie, każda z
  własnym stanem w pamięci, i obie mogą wysyłać komendy do tych samych
  fizycznych urządzeń bez żadnej koordynacji ani wzajemnego ostrzeżenia.

Do zrobienia:
1. Zaprojektować realny restore stanu (co najmniej: odczyt z
   localStorage przy starcie karty control, żeby przypadkowe
   odświeżenie/zamknięcie karty nie zerowało rozgrywki).
2. Rozważyć wykrywanie drugiej aktywnej karty control dla tej samej gry
   (np. przez `device_presence` albo osobny heartbeat) i ostrzeganie
   przed kolizją komend.
