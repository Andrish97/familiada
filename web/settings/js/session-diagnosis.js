// settings/js/session-diagnosis.js
// „Sugerowane problemy” rozgrywki Control 2 (docs/diagnostyka-sesji-plan.md,
// etap 3). Wnioski z trwałego podsumowania sesji (control2_session_diag,
// migracja 468: liczniki per źródło i rodzaj zdarzenia) oraz — dopóki są
// (90 dni) — ze szczegółowych zdarzeń, które służą też za dowody.
// To szacunki: przeglądarka nie odróżnia np. uśpienia ekranu od przełączenia
// aplikacji, dlatego teksty mówią „lub”.

export const SOURCE_NAMES = { display: "Wyświetlacz", host: "Prowadzący", buzzer: "Przycisk", control: "Control" };
const DEVICE_SOURCES = ["display", "host", "buzzer"];
const ALL_SOURCES = [...DEVICE_SOURCES, "control"];

export const PROBLEM_TITLES = {
  asleep: "Urządzenie uśpione lub przełączone na inną aplikację",
  background: "Karta w tle",
  screen_lock: "Ekran mógł gasnąć sam",
  reload: "Strona przeładowana lub ponownie podłączona",
  discarded: "Przeglądarka zamknęła kartę w tle",
  slow_network: "Słabe łącze urządzenia",
  offline: "Brak sieci",
  system: "Możliwy problem po stronie systemu",
  slow_device: "Za słabe urządzenie (zacięcia animacji)",
  sound: "Problem z dźwiękiem",
  duplicate: "Druga karta tego samego urządzenia",
  control_background: "Panel Control w tle",
  control_network: "Słabe łącze lub sieć po stronie Control",
};

const LEVEL_ORDER = { problem: 0, warn: 1, info: 2 };

function fmtDuration(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value < 60_000) return `${(Math.round(value / 100) / 10).toString().replace(".", ",")} s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function times(n) {
  return n === 1 ? "1 raz" : `${n} razy`;
}

function counter(summary, source) {
  const bucket = summary?.[source] || {};
  const entry = key => bucket[key] || {};
  return {
    n: key => Number(entry(key).n) || 0,
    dur: key => Number(entry(key).dur_ms) || 0,
    hidden: key => Number(entry(key).hidden_ms) || 0,
    max: key => Number(entry(key).max_ms) || 0,
  };
}

function eventSource(event) {
  if (event?.source) return event.source;
  const devices = Array.isArray(event?.devices) ? event.devices : [];
  return devices.length === 1 ? devices[0] : "control";
}

/** Ostatni opis urządzenia (device_info) per źródło, ze zdarzeń. */
export function deviceInfoBySource(events = []) {
  const info = {};
  for (const event of events) {
    if (event?.category === "device_info") info[eventSource(event)] = event.metrics || {};
  }
  return info;
}

const CLASS_NAMES = { phone: "telefon", tablet: "tablet", desktop: "komputer", tv: "telewizor" };
const OS_NAMES = { ios: "iOS", android: "Android", windows: "Windows", macos: "macOS", linux: "Linux", chromeos: "ChromeOS", tv_os: "system TV" };
const BROWSER_NAMES = { chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet", opera: "Opera" };

export function describeDevice(metrics = {}) {
  return [
    CLASS_NAMES[metrics.device_class],
    BROWSER_NAMES[metrics.browser],
    OS_NAMES[metrics.os],
    metrics.standalone === true ? "jako aplikacja" : "",
    Number.isFinite(Number(metrics.battery_level)) && metrics.battery_level !== null
      ? `bateria ${metrics.battery_level}%${metrics.charging === true ? " (ładowanie)" : ""}` : "",
    metrics.save_data === true ? "tryb oszczędzania danych" : "",
  ].filter(Boolean).join(" · ");
}

/**
 * @param {{ diag?: { summary?: object }, stats_detail?: { events?: object[] } }} row
 * @returns {{ id: string, level: "problem"|"warn"|"info", title: string, detail: string, sources: string[], evidence: object[] }[]}
 */
export function diagnoseSession(row) {
  const summary = row?.diag?.summary || {};
  const events = Array.isArray(row?.stats_detail?.events) ? row.stats_detail.events : [];
  const infos = deviceInfoBySource(events);
  const found = [];
  const add = (id, level, sources, detail, evidence = []) => {
    const existing = found.find(item => item.id === id);
    if (existing) {
      existing.sources.push(...sources);
      existing.detail += ` ${detail}`;
      existing.evidence.push(...evidence);
      if (LEVEL_ORDER[level] < LEVEL_ORDER[existing.level]) existing.level = level;
      return;
    }
    found.push({ id, level, title: PROBLEM_TITLES[id], detail, sources: [...sources], evidence: [...evidence] });
  };
  const evidenceOf = (source, predicate) => events.filter(event => eventSource(event) === source && predicate(event));
  const name = source => SOURCE_NAMES[source] || source;

  for (const source of DEVICE_SOURCES) {
    const c = counter(summary, source);
    const hiddenCount = c.n("display_state:page_state:hidden");
    const hiddenMs = c.hidden("display_state:page_state:visible");
    const expired = c.n("device_lease:expired");
    const frozen = c.n("page_lifecycle:freeze");
    const frozenMs = c.dur("page_lifecycle:resume");
    const mobile = ["phone", "tablet"].includes(infos[source]?.device_class);
    if (expired || frozen || (hiddenCount && mobile)) {
      const parts = [
        hiddenCount ? `w tle ${times(hiddenCount)}${hiddenMs ? `, łącznie ${fmtDuration(hiddenMs)}` : ""}` : "",
        frozen ? `strona zamrożona ${times(frozen)}${frozenMs ? ` (${fmtDuration(frozenMs)})` : ""}` : "",
        expired ? `utrata połączenia z grą ${times(expired)}` : "",
      ].filter(Boolean).join(", ");
      add("asleep", expired ? "problem" : "warn", [source], `${name(source)}: ${parts}.`,
        evidenceOf(source, event => (event.category === "display_state" && event.metrics?.reason === "page_state" && event.metrics?.visibility === "hidden")
          || (event.category === "device_lease" && event.metrics?.to_state === "expired")
          || (event.category === "page_lifecycle" && event.metrics?.phase === "freeze")));
    } else if (hiddenCount) {
      add("background", "info", [source],
        `${name(source)}: w tle ${times(hiddenCount)}${hiddenMs ? `, łącznie ${fmtDuration(hiddenMs)}` : ""}; połączenie z grą działało.`,
        evidenceOf(source, event => event.category === "display_state" && event.metrics?.visibility === "hidden"));
    }

    const wakeIssue = ["denied", "unsupported", "released"].find(phase => c.n(`wake_lock:${phase}`));
    if (wakeIssue) {
      const reason = { denied: "przeglądarka odmówiła blokady wygaszania", unsupported: "przeglądarka nie obsługuje blokady wygaszania", released: "system zwolnił blokadę wygaszania (np. oszczędzanie baterii)" }[wakeIssue];
      add("screen_lock", "warn", [source], `${name(source)}: ${reason}.`,
        evidenceOf(source, event => event.category === "wake_lock"));
    }

    const reconnects = Math.max(0, c.n("device_lease:primary") - 1) + c.n("page_lifecycle:pagehide");
    if (reconnects) {
      add("reload", "warn", [source], `${name(source)}: ${times(reconnects)}.`,
        evidenceOf(source, event => (event.category === "device_lease" && ["primary", "released"].includes(event.metrics?.to_state))
          || (event.category === "page_lifecycle" && event.metrics?.phase === "pagehide")));
    }

    const discarded = evidenceOf(source, event => event.metrics?.was_discarded === true);
    if (discarded.length) add("discarded", "warn", [source], `${name(source)}: karta odtworzona po zamknięciu przez przeglądarkę.`, discarded.slice(0, 1));

    if (c.n("device_lease:waiting")) {
      add("duplicate", "info", [source], `${name(source)}: druga karta czekała ${times(c.n("device_lease:waiting"))}.`,
        evidenceOf(source, event => event.category === "device_lease" && event.metrics?.to_state === "waiting"));
    }

    const stalls = c.n("display_state:render_stall");
    if (stalls) {
      add("slow_device", "warn", [source], `${name(source)}: ${times(stalls)}, najdłuższa przerwa ${fmtDuration(c.max("display_state:render_stall"))}.`,
        evidenceOf(source, event => event.metrics?.reason === "render_stall"));
    }
  }

  for (const source of ALL_SOURCES) {
    const c = counter(summary, source);
    const slow = c.n("device_network:slow:device_network");
    if (slow) {
      add(source === "control" ? "control_network" : "slow_network", "problem", [source],
        `${name(source)}: wolne łącze ${times(slow)}, najgorzej ${fmtDuration(c.max("device_network:slow:device_network"))}.`,
        evidenceOf(source, event => event.category === "device_network" && event.metrics?.verdict === "device_network"));
    }
    const offline = c.n("page_lifecycle:offline");
    if (offline) {
      add("offline", "problem", [source], `${name(source)}: ${times(offline)}${c.dur("page_lifecycle:online") ? `, łącznie ${fmtDuration(c.dur("page_lifecycle:online"))}` : ""}.`,
        evidenceOf(source, event => event.category === "page_lifecycle" && ["offline", "online"].includes(event.metrics?.phase)));
    }
    const serverSlow = c.n("device_network:slow:server");
    if (serverSlow) {
      add("system", "problem", [source], `${name(source)}: wolna odpowiedź serwera przy sprawnym łączu ${times(serverSlow)}.`,
        evidenceOf(source, event => event.category === "device_network" && event.metrics?.verdict === "server"));
    }
  }

  // Control: błędy bazy (odpowiedź z błędem) wskazują na system, brak
  // odpowiedzi — na łącze Control; tło Control.
  const control = counter(summary, "control");
  const readErrors = events.filter(event => eventSource(event) === "control" && event.category === "connectivity" && event.metrics?.phase === "read_error");
  const dbErrors = readErrors.filter(event => event.metrics?.source === "lease_status");
  const noAnswer = readErrors.filter(event => event.metrics?.source === "status_read");
  if (dbErrors.length) add("system", "problem", ["control"], `Control: baza zwróciła błąd przy odczycie stanu urządzeń ${times(dbErrors.length)}.`, dbErrors);
  if (noAnswer.length) add("control_network", "problem", ["control"], `Control: odczyt stanu urządzeń bez odpowiedzi ${times(noAnswer.length)}.`, noAnswer);
  if (!readErrors.length && control.n("connectivity:read_error")) {
    add("system", "warn", ["control"], `Control: błąd odczytu stanu urządzeń ${times(control.n("connectivity:read_error"))} (szczegóły wygasły).`);
  }
  const deviceReadErrors = DEVICE_SOURCES.reduce((sum, source) => sum + counter(summary, source).n("device_state_sync:read_error"), 0);
  const deviceSlowNet = DEVICE_SOURCES.some(source => counter(summary, source).n("device_network:slow:device_network") || counter(summary, source).n("page_lifecycle:offline"));
  if (deviceReadErrors && !deviceSlowNet) {
    add("system", "warn", DEVICE_SOURCES.filter(source => counter(summary, source).n("device_state_sync:read_error")),
      `Urządzenia nie odczytały stanu gry z bazy ${times(deviceReadErrors)} przy braku oznak słabego łącza.`,
      events.filter(event => event.category === "device_state_sync" && event.metrics?.phase === "read_error"));
  }
  // Kilka urządzeń traci kanał naraz przy widocznych kartach i działającej sieci.
  const outages = events.filter(event => event.category === "device_transport" && event.metrics?.start_visibility === "visible" && event.metrics?.start_online !== false);
  for (const outage of outages) {
    const at = Date.parse(outage.at || "");
    const together = outages.filter(other => Math.abs(Date.parse(other.at || "") - at) <= 10_000);
    if (new Set(together.map(eventSource)).size >= 2) {
      add("system", "problem", [...new Set(together.map(eventSource))], "Kilka urządzeń jednocześnie straciło kanał na żywo przy widocznych kartach i działającej sieci.", together);
      break;
    }
  }

  const controlHidden = control.n("display_state:page_state:hidden");
  if (controlHidden) {
    add("control_background", "info", ["control"],
      `Control w tle ${times(controlHidden)}${control.hidden("display_state:page_state:visible") ? `, łącznie ${fmtDuration(control.hidden("display_state:page_state:visible"))}` : ""}.`,
      evidenceOf("control", event => event.category === "display_state" && event.metrics?.visibility === "hidden"));
  }

  const soundFailed = control.n("audio_start:failed") + DEVICE_SOURCES.reduce((sum, source) => sum + counter(summary, source).n("audio_start:failed"), 0);
  const unlockWaits = events.filter(event => event.category === "audio_unlock" && Number(event.metrics?.wait_ms) >= 10_000);
  if (soundFailed || unlockWaits.length) {
    add("sound", "warn", ["display"], [
      soundFailed ? `dźwięk nie uruchomił się ${times(soundFailed)}` : "",
      unlockWaits.length ? `długie czekanie na odblokowanie dźwięku ${times(unlockWaits.length)}` : "",
    ].filter(Boolean).join(", ") + ".",
    [...events.filter(event => event.category === "audio_start" && event.metrics?.failed), ...unlockWaits]);
  }

  for (const item of found) item.sources = [...new Set(item.sources)];
  return found.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/** Zestawienie: w ilu sesjach (z podsumowaniem) wystąpił dany problem. */
export function summarizeSessions(rows = []) {
  const withDiag = rows.filter(row => Number(row?.control_version) === 2 && row?.diag);
  const counts = {};
  for (const row of withDiag) {
    for (const id of new Set(diagnoseSession(row).map(item => item.id))) counts[id] = (counts[id] || 0) + 1;
  }
  const items = Object.entries(counts)
    .map(([id, count]) => ({ id, title: PROBLEM_TITLES[id], count, share: withDiag.length ? count / withDiag.length : 0 }))
    .sort((a, b) => b.count - a.count);
  const clean = withDiag.filter(row => !diagnoseSession(row).some(item => item.level !== "info")).length;
  return { sessions: withDiag.length, clean, items };
}
