# Plan wdrożenia — Stabilność połączenia urządzeń

## Diagnoza problemów

### Buzzer i host — dwa krytyczne błędy

**Błąd 1: ping zatrzymuje się gdy karta w tle**

`buzzer.js` i `host.js` mają identyczny kod:

```js
pingTimer = setInterval(() => {
  if (document.visibilityState !== "visible") return;
  void ping();
}, 5000);
```

Gdy użytkownik przełączy zakładkę lub ekran urządzenia zgaśnie,
`visibilityState` staje się `"hidden"` i ping przestaje działać całkowicie.
Po 12 sekundach (`ONLINE_MS`) control oznacza urządzenie jako offline
i wyświetla alert. Operator musi ręcznie „wznowić" połączenie.

`keep-alive.js` blokuje throttling timera przez WebLock — ale nie pomaga
gdy kod jawnie sprawdza `visibilityState` przed każdym pingiem.

**Błąd 2: kanał Supabase nigdy nie reconnectuje po błędzie**

```js
function ensureChannel() {
  if (ch) return ch;
  ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, handler)
    .subscribe();  // ← brak callbacka statusu
  return ch;
}
```

Gdy WebSocket rozłączy się (sieć mobilna, uśpienie telefonu, timeout),
Supabase wywoła wewnętrznie `CHANNEL_ERROR` lub `TIMED_OUT`, ale kod
tego nie obserwuje. Kanał zostaje „martwy" — komendy od operatora
przestają docierać do urządzenia na zawsze (do odświeżenia strony).

### Display — mniejszy problem

`display/js/presence.js` uruchamia ping bez warunku visibilityState (dobrze),
ale kanał DISPLAY_CMD też nie ma auto-reconnect. Wyświetlacz jest jednak
zazwyczaj stale widoczny, więc pilność niższa.

### Control — brak pilnych problemów

Control korzysta z `realtime.js` (`sendBroadcast` z `mode: "http"`),
który wysyła komendy przez REST — odporne na WS. Polling presence co 1.5s
przez REST działa niezawodnie.

---

## Moduł 1 — Krótsze timeouty presence

### Pliki: `control/js/presence.js`, `js/pages/buzzer.js`, `js/pages/host.js`, `display/js/presence.js`

**Ryzyko: zerowe** — tylko stałe liczbowe.

### control/js/presence.js

```js
// PRZED:
const ONLINE_MS = 12_000;

// PO:
const ONLINE_MS = 8_000;
```

Uzasadnienie: przy ping co 3s (po Module 2) i ONLINE_MS = 8s mamy bufor
2–3 nieodebranych pingów. Wystarczy na chwilowe zawahanie sieci.
Przy obecnym ONLINE_MS = 12s + ping co 5s urządzenie może być „offline"
w control przez ponad 10s zanim alert się pojawi.

### js/pages/buzzer.js i js/pages/host.js

Ping interval: 5000 ms → 3000 ms (widoczne) / 8000 ms (tło).
Szczegóły w Module 2, bo zmiana interwału jest połączona z fix pingu w tle.

### display/js/presence.js

```js
// Domyślny pingMs to 5000. Zmiana w wywołaniu startPresence (w display app.js):
startPresence({ ..., pingMs: 3000 })
```

---

## Moduł 2 — Ping działa zawsze (buzzer + host)

### Pliki: `js/pages/buzzer.js`, `js/pages/host.js`

**Ryzyko: niskie** — zmiana logiki timera, bez ryzyka dla innych funkcji.

### Problem — obecny kod

```js
const startPingLoop = () => {
  if (pingTimer) return;
  ping();
  pingTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;  // ← to jest błąd
    void ping();
  }, 5000);
};

const stopPingLoop = () => {
  if (!pingTimer) return;
  clearInterval(pingTimer);
  pingTimer = null;
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPingLoop();
    void ping();
    return;
  }
  stopPingLoop();  // ← całkowite zatrzymanie pingu
});
```

### Rozwiązanie — adaptive setTimeout

Zamiast `setInterval` z `if (visibilityState)` — rekurencyjny `setTimeout`
z krótszym interwałem gdy widoczne, dłuższym gdy w tle.
`stopPingLoop` / `startPingLoop` i `visibilitychange` handler zostają usunięte
(nie są już potrzebne):

```js
let pingTimer = null;

function schedulePing() {
  clearTimeout(pingTimer);
  const ms = document.visibilityState === "visible" ? 3000 : 8000;
  pingTimer = setTimeout(async () => {
    await ping();
    schedulePing();
  }, ms);
}

// startuje raz, po starcie:
ping().then(schedulePing);

// po powrocie do widoczności: wyślij ping natychmiast i skróć interwał
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    ping().then(schedulePing);
  }
  // w tle: nie przerywamy, schedulePing sam zwiększy interwał do 8s
});
```

Efekt: urządzenie pinguje co 3s gdy aktywne, co 8s w tle.
`keep-alive.js` (WebLock) zapewnia że timer w tle nie jest throttlowany
przez przeglądarkę do 1/minutę.

---

## Moduł 3 — Auto-reconnect kanału Supabase (buzzer + host)

### Pliki: `js/pages/buzzer.js`, `js/pages/host.js`

**Ryzyko: średnie** — zmiana zarządzania cyklem życia kanału.

### Rozwiązanie — subscribe callback + reconnect

```js
let ch = null;
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (ch) {
      try { sb().removeChannel(ch); } catch {}
      ch = null;
    }
    openChannel();
  }, 2000);
}

function openChannel() {
  if (ch) return;

  ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      handleCommand(msg?.payload?.line).catch(console.warn);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // reconnect: odbuduj stan i potwierdź obecność
        void restoreState();
        void ping();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        scheduleReconnect();
      }
    });
}
```

Stara funkcja `ensureChannel()` zostaje zastąpiona przez `openChannel()`.

### Uwagi

- `restoreState()` przy `SUBSCRIBED` jest wywoływane zarówno przy pierwszym
  połączeniu jak i po każdym reconnect — to poprawne (idempotentne przez snapshot).
- Delay 2s przed reconnect zapobiega burzom połączeń gdy sieć jest chwilowo niestabilna.
- `reconnectTimer` guard zapobiega wielokrotnym próbom reconnect.

---

## Moduł 4 — Auto-reconnect display

### Plik: `display/js/presence.js`

**Ryzyko: niskie** — display jest stabilniejszy, ale warto ujednolicić.

### Rozwiązanie

Analogicznie do Modułu 3 — dodać `subscribe` callback z `scheduleReconnect`:

```js
let chRef = null;
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (chRef) {
      try { sb().removeChannel(chRef); } catch {}
      chRef = null;
    }
    openChannel();
  }, 2000);
}

function openChannel() {
  chRef = sb()
    .channel(chName)
    .on("broadcast", { event: "DISPLAY_CMD" }, (msg) => {
      const line = msg?.payload?.line;
      if (line) try { onCommand?.(String(line)); } catch {}
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // po reconnect: odśwież snapshot
        getSnapshot().then(snap => {
          try { onSnapshot?.(snap); } catch {}
        });
        void ping();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        scheduleReconnect();
      }
    });
}
```

---

## Kolejność wdrożenia

| Krok | Moduł | Pliki | Ryzyko |
|------|-------|-------|--------|
| 1 | Moduł 1 — timeouty | `control/js/presence.js` | zerowe |
| 2 | Moduł 2 — ping w tle | `buzzer.js`, `host.js` | niskie |
| 3 | Moduł 3 — reconnect | `buzzer.js`, `host.js` | średnie |
| 4 | Moduł 4 — reconnect display | `display/js/presence.js` | niskie |

Kroki 2 i 3 można wdrożyć razem (jeden commit per plik).

---

## Pliki do modyfikacji

| Plik | Zmiany |
|------|--------|
| `control/js/presence.js` | `ONLINE_MS`: 12000 → 8000 |
| `js/pages/buzzer.js` | adaptive ping (Moduł 2) + reconnect (Moduł 3) |
| `js/pages/host.js` | adaptive ping (Moduł 2) + reconnect (Moduł 3) |
| `display/js/presence.js` | pingMs 5000→3000, reconnect (Moduł 4) |

---

## Co NIE zmienia się

- Supabase jako jedyny kanał komunikacji (brak LAN)
- Struktura komend (BUZZER_CMD, HOST_CMD, DISPLAY_CMD) — bez zmian
- `devices.js` / `cmdQueues` / `flushQueued` — bez zmian
- Snapshot RPC (`device_state_set_public` / `device_state_get`) — bez zmian
- UI control panel — bez zmian
- `keep-alive.js` — bez zmian (już działa poprawnie)
- `realtime.js` — bez zmian (HTTP fallback dla komend control jest wystarczający)
