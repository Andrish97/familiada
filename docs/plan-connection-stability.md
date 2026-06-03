# Plan wdrożenia — Stabilność połączenia urządzeń + tryb LAN

## Cel

Poprawa niezawodności połączenia buzzera i hosta (najczęściej gubione) oraz wyświetlacza.
Wprowadzenie przezroczystego trybu sieci lokalnej (LAN) — operator nic nie konfiguruje,
urządzenia automatycznie używają LAN gdy dostępne, niezależnie od metody połączenia (QR lub kod 6-cyfrowy).

---

## Moduł A — `js/core/transport.js` (nowa warstwa abstrakcji)

Wszystkie urządzenia (buzzer, host, display) przestają używać bezpośrednio Supabase channel
do odbierania komend. Zamiast tego importują `createTransport(topic)` który pod spodem:

1. Próbuje WebSocket na LAN (`ws://[lan-host]:7411/[topic]`)
2. Jeśli LAN niedostępne — używa Supabase Realtime (obecne zachowanie)
3. Jeśli Supabase WS padnie — HTTP fallback (obecne zachowanie)

### API

```js
const t = createTransport(topic);
t.onMessage(event, handler);      // zastępuje ch.on("broadcast", ...)
t.send(event, payload);           // zastępuje rt(...).sendBroadcast(...)
t.onLanStatusChange(cb);          // cb({ lan: true/false })
```

### Wykrywanie LAN

Wykrywanie LAN jest **przezroczyste** — urządzenie samo próbuje, operator nic nie widzi.

Mechanizm A (komenda po wejściu online): po tym jak urządzenie zgłosi się przez Supabase (`device_ping`),
control wysyła komendę `LAN_URL ws://192.168.x.x:7411` przez Supabase channel.
Urządzenie próbuje połączyć się z tym adresem przez WS. Jeśli uda się — przełącza na LAN.
Jeśli nie — zostaje na Supabase, transparentnie.

Mechanizm B (sonda portu — fallback, dla urządzeń QR): urządzenie próbuje `http://[sugerowany-host]:7411/ping`
przez `fetch` z timeout 500 ms. Adres hosta pochodzi z parametru `?lan=` w URL (dla QR)
albo z komendy `LAN_URL` (dla kodu 6-cyfrowego).

Oba mechanizmy działają razem — B przyspiesza dla QR, A działa dla wszystkich.

---

## Moduł B — `lan-server/` (minimalny serwer Node.js)

Operator uruchamia `node lan-server/index.js` na komputerze z panelem control (lub automatycznie
z Electron/PWA Service Worker w przyszłości). Serwer jest **opcjonalny** — bez niego wszystko działa
jak dotąd przez Supabase.

### Stos

- Node.js 18+ (wbudowany `ws` lub `uWebSockets`)
- Port 7411 (konfiguowalny przez env `LAN_PORT`)
- Endpointy:
  - `GET /ping` → `{ ok: true, ts: Date.now() }`
  - `WS /[topic]` → przekazuje broadcast w ramach topic (fan-out)
  - `POST /broadcast` → wysyła komendę do wszystkich subskrybentów topic (dla control)

### Bezpieczeństwo

- Brak auth (LAN = ufamy sieci lokalnej)
- Opcjonalny `ALLOW_ORIGIN` regex do CORS

### Pliki

```
lan-server/
  index.js          # main entry point
  package.json
  README.md
```

### Autodetekcja adresu IP

`index.js` wypisuje na stdout:
```
LAN server ready: ws://192.168.1.42:7411
```
Control panel odczytuje ten URL (albo operator wkleja go ręcznie — ale to nie jest potrzebne).
W przyszłości: mDNS broadcast `familiada.local`.

---

## Moduł C — Reconnect + background ping dla buzzer i host

### Problem

`ensureChannel()` w `buzzer.js` i `host.js` tworzy kanał Supabase raz i nigdy nie
próbuje ponownie po błędzie (`CHANNEL_ERROR` / `TIMED_OUT`). Gdy WebSocket jest
zresetowany przez sieć, kanał pozostaje martwy.

### Rozwiązanie

Przenieść zarządzanie kanałem do `transport.js` (Moduł A), który automatycznie:
1. Nasłuchuje na `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`
2. Po 2s próbuje `reset()` + `ensureChannel()`
3. Po reconnect wysyła `device_ping` natychmiast (żeby control wiedział że urządzenie wróciło)
4. Po reconnect wywołuje `restoreState()` (żeby odbudować snapshot)

### Ping w tle

Obecny kod:
```js
if (document.visibilityState !== "visible") return;
```
Problem: gdy karta jest w tle, ping zatrzymuje się. Po ~10–12s control uznaje urządzenie za offline.

Rozwiązanie: ping działa zawsze (bez warunku `visibilityState`). Interwał w tle zwiększamy
do 10s zamiast 5s, żeby oszczędzać baterię. `keep-alive.js` już zapobiega throttlingowi przez WebLock.

```js
const interval = document.visibilityState === "visible" ? 5000 : 10000;
```

---

## Moduł D — Krótsze timeouty presence

### Obecne wartości (`control/js/app.js` lub stałe)

| Stała | Obecna | Proponowana |
|-------|--------|-------------|
| `ONLINE_MS` | 12 000 ms | 8 000 ms |
| ping interval (device) | 5 000 ms | 3 000 ms (visible) / 8 000 ms (hidden) |
| control polling | 1 500 ms | 1 500 ms (bez zmian) |

Przy ping co 3s i ONLINE_MS = 8s mamy bufor 2–3 nieodebranych pingów zanim urządzenie
zostanie uznane za offline. To wystarczy na chwilowe zawahanie sieci.

---

## Moduł E — Snapshot przy reconnect

### Problem

Gdy buzzer lub host połączy się ponownie po przerwie, nie odświeża stanu (np. kolor drużyn,
aktualny stan przycisku). Musi czekać na kolejną komendę od operatora.

### Rozwiązanie

Po każdym reconnect (wykrytym w `transport.js` przez reset + re-subscribe) wywołaj:
```js
await restoreState();
```
To pobiera ostatni snapshot z `device_state_get` RPC — urządzenie natychmiast wyrównuje stan.

Control po wykryciu, że urządzenie wróciło online (`deviceOnline` event), wysyła też pełen zestaw komend
(kolory, stan) — to już działa przez `cmdQueues` + `flushQueued()` w `devices.js`.

---

## Moduł F — Realtime presence przez `postgres_changes` (opcjonalne, v2)

Obecne: control odpytuje `device_presence` przez REST co 1.5s.
Optymalizacja v2: subskrypcja `postgres_changes` na `device_presence` → natychmiastowa reakcja
bez polling.

To jest opcjonalne — obecny polling działa, tylko wprowadza ~1.5s opóźnienie.
Implementacja po Modułach A–E.

---

## Kolejność wdrożenia

1. **Moduł D** — tylko zmiana stałych, 0 ryzyka
2. **Moduł C** — reconnect + ping w tle, niezależne od LAN
3. **Moduł E** — snapshot przy reconnect
4. **Moduł B** — serwer LAN (nowy plik, nic nie psuje)
5. **Moduł A** — `transport.js` i refactor buzzer/host/display do używania go
6. **Moduł F** — opcjonalnie, po stabilizacji

---

## Architektura LAN — szczegóły przepływu

### Przypadek 1: urządzenie skanuje QR

```
QR URL: https://familiada.app/buzzer?id=xxx&key=yyy&lan=ws://192.168.1.42:7411
                                                      ^^^^^^^^^^^^^^^^^^^^^^^^
                                                      dodawane przez control gdy LAN server wykryty

Buzzer:
  1. Łączy się Supabase (jak zawsze)
  2. Równolegle: fetch("http://192.168.1.42:7411/ping", { signal: AbortSignal.timeout(500) })
  3. OK → otwiera WS na lan-server, wypisuje do DevTools "[transport] LAN active"
  4. Supabase channel zostaje jako backup (nie jest zamykany)
```

### Przypadek 2: urządzenie łączy się 6-cyfrowym kodem

```
Buzzer nie ma ?lan= w URL.
  1. Łączy się Supabase
  2. device_ping → control wykrywa urządzenie online
  3. Control sprawdza czy LAN server jest aktywny (flaga w state)
  4. Jeśli tak: wysyła BUZZER_CMD "LAN_URL ws://192.168.1.42:7411" przez Supabase
  5. Buzzer odbiera komendę, próbuje fetch ping, jeśli OK → otwiera WS LAN
```

### Przypadek 3: brak LAN servera

```
Oba przypadki: urządzenie nie dostaje odpowiedzi na ping (timeout 500ms)
→ zostaje na Supabase, bez żadnego komunikatu dla operatora
→ transparentne, identyczne zachowanie jak dotąd
```

### Tryb mieszany

Control śledzi per-urządzenie czy jest na LAN czy Supabase.
Komendy wysyłane są przez **oba** kanały jednocześnie (jeśli urządzenie jest na LAN,
odbierze przez WS; jeśli przez Supabase — odbierze przez Realtime).
Duplikaty są ignorowane przez `handled` set (hash komendy + timestamp).

---

## Pliki do modyfikacji / utworzenia

| Plik | Zmiana |
|------|--------|
| `js/core/transport.js` | Nowy — warstwa abstrakcji WS/Supabase |
| `lan-server/index.js` | Nowy — serwer lokalny |
| `lan-server/package.json` | Nowy |
| `js/pages/buzzer.js` | Moduły C, D, E — reconnect, ping, snapshot |
| `js/pages/host.js` | Moduły C, D, E |
| `js/pages/display/display.js` | Moduł D — krótszy ONLINE_MS |
| `control/js/devices.js` | Moduł A — wysyłanie LAN_URL po wejściu online |
| `control/js/app.js` | Moduł D — ONLINE_MS |

---

## Co NIE zmienia się

- Supabase pozostaje domyślnym i zawsze-dostępnym kanałem
- Operator nie musi nic konfigurować ani wiedzieć o LAN
- QR i kody 6-cyfrowe działają identycznie jak dotąd
- UI control panel bez zmian (żadnych wskaźników LAN — transparentne)
