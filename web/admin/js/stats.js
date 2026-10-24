// admin/js/stats.js — Statystyki: przegląd, retencja, wykluczeni, snake, szczegóły i diagnoza rozgrywek.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-24T23314";
import { describeDevice, deviceInfoBySource, diagnoseSession, SOURCE_NAMES, summarizeSessions } from "./session-diagnosis.js?v=v2026-10-24T23314";
import { iconText, icon } from "../../shared/js/core/icons.js?v=v2026-10-24T23314";
import { buildControl2StatsExport } from "./stats-export.js?v=v2026-10-24T23314";
import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-24T23314";
import { activityDetailRows } from "./activity.js?v=v2026-10-24T23314";
import { API_BASE, adminGet, adminPost, apiFetch, btnBackSheet, els, esc, fmtDate } from "./core.js?v=v2026-10-24T23314";
import { setStatus } from "./maintenance.js?v=v2026-10-24T23314";
import { emptyState } from "../../shared/js/core/empty-state.js?v=v2026-10-24T23314";
import { setWidth } from "../../shared/js/core/geometry.js?v=v2026-10-24T23314";

export async function loadAdminStats({ silent = false } = {}) {
  if (!silent) setStatus("Ładowanie statystyk…");
  try {
    const data = await adminGet("/stats/overview", "stats");

    if (els.statUsersTotal) els.statUsersTotal.textContent = data.users.total;
    if (els.statUsersGrowth) els.statUsersGrowth.textContent = `Dziś: ${data.users.new_today} | 7 dni: ${data.users.new_7d} | 30 dni: ${data.users.new_30d}`;
    if (els.statUsersLangs) els.statUsersLangs.textContent = `PL: ${data.users.langs.pl} | EN: ${data.users.langs.en} | UK: ${data.users.langs.uk}`;

    if (els.statGamesTotal) els.statGamesTotal.textContent = data.games.total;
    if (els.statGamesGrowth) els.statGamesGrowth.textContent = `Dziś: ${data.games.new_today} | 7 dni: ${data.games.new_7d} | 30 dni: ${data.games.new_30d}`;
    if (els.statGamesQuality) els.statGamesQuality.textContent = `Gotowe: ${data.games.ready} | Śr. pytań: ${data.games.avg_q}`;

    if (els.statCustomSettingsTotal) els.statCustomSettingsTotal.textContent = data.custom_settings.total;
    if (els.statCustomSettingsSub) els.statCustomSettingsSub.textContent = `z ${data.games.total} gier ma zmienione ustawienia zaawansowane`;

    if (els.statPlayedTotal) els.statPlayedTotal.textContent = data.gameplay.played_30d;
    if (els.statPlayedPeriods) els.statPlayedPeriods.textContent = `Dziś: ${data.gameplay.played_today} | 7 dni: ${data.gameplay.played_7d} | 30 dni: ${data.gameplay.played_30d}`;
    if (els.statPlayedOutcomes) els.statPlayedOutcomes.textContent = `Zakończone: ${data.gameplay.finished_30d} | Porzucone: ${data.gameplay.abandoned_30d} | W trakcie: ${data.gameplay.in_progress}`;
    if (els.statPlayedIssues) els.statPlayedIssues.textContent = `Z błędami: ${data.gameplay.errors_30d} | Archiwalne: ${data.gameplay.legacy_total}`;

    const pollRes = await apiFetch(`${API_BASE}/stats/polls`, { method: "GET" });
    if (!pollRes.ok) throw new Error(`Ankiety: HTTP ${pollRes.status}`);
    const pollData = await pollRes.json();
    if (!pollData.ok) throw new Error(pollData.error || "Nie udało się załadować statystyk ankiet");
    const polls = pollData.stats;
    if (els.statPollGamesTotal) els.statPollGamesTotal.textContent = polls.games.total;
    if (els.statPollGamesTypes) els.statPollGamesTypes.textContent = `Tekstowe: ${polls.games.text} | Punktowe: ${polls.games.points}`;
    if (els.statPollActive) els.statPollActive.textContent = `Aktywne z głosami: ${polls.games.active_with_votes} | Aktywne: ${polls.games.active}`;
    if (els.statPollResponses) els.statPollResponses.textContent = `Odpowiedzi: ${polls.responses.total} | 7 dni: ${polls.responses.last_7d} | Tokeny głosujących: ${polls.responses.voters}`;
    if (els.statPollSharing) els.statPollSharing.textContent = `Udostępnione ankiety: ${polls.sharing.polls} | Wypełnione zaproszenia: ${polls.sharing.completed_tasks}/${polls.sharing.tasks}`;
    if (els.statSubscriptionsTotal) els.statSubscriptionsTotal.textContent = polls.subscriptions.total;
    if (els.statSubscriptionsSummary) els.statSubscriptionsSummary.textContent = `Aktywne: ${polls.subscriptions.active} | Oczekujące: ${polls.subscriptions.pending}`;
    if (els.statSubscriptionsOther) els.statSubscriptionsOther.textContent = `Odrzucone: ${polls.subscriptions.declined} | Anulowane: ${polls.subscriptions.cancelled}`;

    if (els.statBasesTotal) els.statBasesTotal.textContent = data.bases.total;
    if (els.statBasesGrowth) els.statBasesGrowth.textContent = `Dziś: ${data.bases.new_today} | 7 dni: ${data.bases.new_7d} | 30 dni: ${data.bases.new_30d}`;

    if (els.statLogosTotal) els.statLogosTotal.textContent = data.logos.total;
    if (els.statLogosGrowth) els.statLogosGrowth.textContent = `Dziś: ${data.logos.new_today} | 7 dni: ${data.logos.new_7d} | 30 dni: ${data.logos.new_30d}`;

    if (els.statRating) els.statRating.textContent = `${data.ratings.average} / 5`;
    if (els.statRatingsGrowth) els.statRatingsGrowth.textContent = `Dziś: ${data.ratings.new_today} | 7 dni: ${data.ratings.new_7d} | 30 dni: ${data.ratings.new_30d}`;
    if (els.statRatingsTotal) els.statRatingsTotal.textContent = `Łącznie: ${data.ratings.total}`;
    if (els.statHealthMails) els.statHealthMails.textContent = `Błędy maili (24h): ${data.health.mail_errors}`;
    
    if (els.statsUpdateTs) {
      const date = new Date(data.timestamp).toLocaleString();
      els.statsUpdateTs.textContent = `Ostatnia aktualizacja: ${date}`;
    }
  } catch (e) {
    console.error("[settings] loadAdminStats error:", e);
  } finally {
    if (!silent) setStatus("Załadowano");
  }
}

// Ukryta gra w węża: lejek skan → wejście → start → koniec, rekordy i trend.
export async function loadSnakeStats() {
  const funnel = document.getElementById("snakeFunnel");
  const top = document.getElementById("snakeTop");
  if (!funnel || !top) return;
  try {
    const res = await apiFetch(`${API_BASE}/stats/snake`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "błąd");
    const { kinds = {}, scores = {}, top: best = [], players = 0, daily = [] } = data.stats || {};
    const row = (label, k) => {
      const v = kinds[k] || {};
      return `<tr><td class="st-label">${label}</td>
        <td class="st-num">${v.total ?? 0}</td>
        <td class="st-num st-sub">osoby: ${v.visitors ?? 0}</td>
        <td class="st-num st-dim">dziś ${v.today ?? 0} · 7 dni ${v.last_7d ?? 0}</td></tr>`;
    };
    funnel.innerHTML = row("Zeskanowania QR", "scan") + row("Wejścia na stronę gry", "enter") + row("Rozpoczęte gry", "start") + row("Zakończone gry", "finish");
    document.getElementById("snakeScores").textContent = `Najlepszy wynik: ${scores.max ?? 0} | Średni: ${scores.avg ?? 0} | Gracze z kontem: ${players}`;
    top.innerHTML = best.length
      ? best.map((p, i) => `<tr><td class="st-label">${i + 1}. ${esc(p.username || "—")}</td>
          <td class="st-num">${p.best}</td><td class="st-num st-dim">gier: ${p.games}</td></tr>`).join("")
      : `<tr><td colspan="3" class="stats-loading">Nikt z kontem jeszcze nie zagrał.</td></tr>`;
    const max = Math.max(1, ...daily.map((d) => Math.max(d.scan, d.start)));
    document.getElementById("snakeTrend").innerHTML = daily.map((d) => `
      <div class="snake-day" title="${d.day}: skany ${d.scan}, wejścia ${d.enter}, gry ${d.start}">
        <div class="snake-bar snake-bar--scan" style="--h:${Math.max(2, d.scan / max * 100)}%"></div>
        <div class="snake-bar snake-bar--start" style="--h:${Math.max(2, d.start / max * 100)}%"></div>
      </div>`).join("");
    document.getElementById("snakeTrendLabels").innerHTML = daily.map((d) =>
      `<div class="stats-day-label">${String(d.day).slice(8, 10)}</div>`).join("");
  } catch (e) {
    funnel.innerHTML = `<tr><td colspan="4" class="stats-loading stats-error">Błąd: ${esc(e.message)}</td></tr>`;
    top.innerHTML = "";
  }
}

function pct(part, total) {
  if (!total) return "0%";
  return Math.round((part / total) * 100) + "%";
}

function renderRetentionTable(data) {
  const tbody = document.getElementById("retentionTable");
  if (!tbody) return;
  const { funnel, retention } = data;
  const total = funnel.registered || 1;
  const d7pct  = retention.d7.cohort  ? Math.round(retention.d7.returned  / retention.d7.cohort  * 100) : null;
  const d30pct = retention.d30.cohort ? Math.round(retention.d30.returned / retention.d30.cohort * 100) : null;

  const sep = `<tr class="stats-sep"><td colspan="3"><div></div></td></tr>`;
  const row = (label, value, percent, tone) => `
    <tr>
      <td class="st-label">${label}</td>
      <td class="st-num">${value}</td>
      <td class="st-num st-pct"${tone ? ` data-tone="${tone}"` : ""}>${percent}</td>
    </tr>`;

  tbody.innerHTML = `
    ${row("1. Zarejestrowani", funnel.registered, "100%", "")}
    ${row("2. Stworzyli grę", funnel.game_created, pct(funnel.game_created, total), funnel.game_created / total >= 0.3 ? "ok" : "warn")}
    ${row("3. Uruchomili rozgrywkę", funnel.game_played, pct(funnel.game_played, total), funnel.game_played / total >= 0.1 ? "ok" : funnel.game_played > 0 ? "warn" : "bad")}
    ${row("Nigdy aktywni", funnel.never_active, pct(funnel.never_active, total), "bad")}
    ${sep}
    ${row(
      `Retencja D7 <span class="st-note">(z ${retention.d7.cohort})</span>`,
      retention.d7.returned,
      d7pct !== null ? d7pct + "%" : "—",
      d7pct >= 30 ? "ok" : d7pct >= 10 ? "warn" : "bad"
    )}
    ${row(
      `Retencja D30 <span class="st-note">(z ${retention.d30.cohort})</span>`,
      retention.d30.returned,
      d30pct !== null ? d30pct + "%" : "—",
      d30pct >= 20 ? "ok" : d30pct >= 5 ? "warn" : "bad"
    )}`;
}

function renderSegmentBars(segments, total) {
  const el = document.getElementById("segmentBars");
  if (!el) return;
  const items = [
    { label: "Aktywni ≤7d",     count: segments.active_7d,    tone: "ok" },
    { label: "Aktywni 8–30d",   count: segments.active_8_30d, tone: "warn" },
    { label: "Uśpieni 30d+",    count: segments.dormant,      tone: "bad" },
    { label: "Brak aktywności", count: segments.never,        tone: "none" },
  ];
  el.innerHTML = items.map(({ label, count, tone }) => {
    const p = total > 0 ? Math.round(count / total * 100) : 0;
    return `<div>
      <div class="seg-head">
        <span class="seg-label">${label}</span>
        <span class="seg-count">${count} <span class="seg-pct">${p}%</span></span>
      </div>
      <div class="progress"><div class="progress-bar" data-tone="${tone}" style="--p:${p}%"></div></div>
    </div>`;
  }).join("");
}

function renderTrendChart(trend) {
  const chartEl = document.getElementById("trendChart");
  const labelsEl = document.getElementById("trendLabels");
  if (!chartEl || !labelsEl) return;

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = (trend || []).find(t => t.day === key);
    days.push({ day: key, count: found?.count ?? 0 });
  }

  const maxCount = Math.max(...days.map(d => d.count), 1);

  chartEl.innerHTML = days.map(({ day, count }) => {
    const h = count > 0 ? Math.max(Math.round((count / maxCount) * 100), 4) : 0;
    return `<div class="trend-day">
      <div class="trend-bar${count > 0 ? " has-value" : ""}" title="${day}: ${count}" style="--h:${h}%"></div>
    </div>`;
  }).join("");

  labelsEl.innerHTML = days.map(({ day }, i) => {
    const show = i === 0 || i === 6 || i === 13;
    return `<div class="stats-day-label">${show ? day.slice(5) : ""}</div>`;
  }).join("");
}

function renderExcludedList(users) {
  const el = document.getElementById("excludedList");
  if (!el) return;
  if (!users.length) {
    el.innerHTML = `<div class="stats-loading">Brak wykluczonych kont.</div>`;
    return;
  }
  el.replaceChildren();
  // E25: rola konta testowego z powodu wykluczenia (test:<rola>), podsumowanie według ról
  const roles={ standard:"zwykłe", disposable:"jednorazowe", dedicated:"przypisane do czynności" };
  const label=(user)=>user.reason === "test_guest" ? "Gość testowy"
    : String(user.reason || "").startsWith("test:") ? `Konto testowe · ${roles[user.reason.slice(5)] || user.reason.slice(5)}` : "Konto testowe";
  const counts=new Map();
  for (const user of users) {
    const key=user.automatic ? label(user) : "Ręcznie";
    counts.set(key,(counts.get(key)||0)+1);
  }
  const summary=document.createElement("div");summary.className="stat-sub excluded-summary";
  summary.textContent=[...counts].map(([key,count])=>`${key}: ${count}`).join(" · ");
  el.append(summary);
  for (const user of users) {
    const row=document.createElement("div");row.className="activity-row excluded-account-row";
    const text=document.createElement("div");text.className="excluded-account-copy";
    text.textContent=`${user.username || "—"} · ${user.email || ""}`;
    row.append(text);
    if (user.automatic) {
      const badge=document.createElement("span");badge.className="stat-sub";
      badge.textContent=` · ${label(user)} — wykluczenie automatyczne`;
      text.append(badge);
    } else {
      const button=document.createElement("button");button.className="btn xs";button.type="button";button.textContent="Usuń";
      button.addEventListener("click",()=>removeExcludedUser(user.user_id));row.append(button);
    }
    el.append(row);
  }
}

export async function loadExcludedUsers() {
  try {
    renderExcludedList((await adminGet("/stats/excluded", "rows")) || []);
  } catch (e) {
    console.error("[settings] loadExcludedUsers error:", e);
  }
}

async function addExcludedUser() {
  const input = document.getElementById("excludeUsernameInput");
  const msg   = document.getElementById("excludeMsg");
  const username = input?.value?.trim();
  if (!username || !msg) return;
  msg.textContent = "";
  try {
    const data = await adminPost("/stats/excluded", { username }, "result");
    if (!data.ok) {
      msg.dataset.tone = "bad";
      msg.textContent = data.err === "not_found" ? "Nie znaleziono użytkownika." : data.err;
      return;
    }
    msg.dataset.tone = "ok";
    msg.textContent = `Wykluczono: ${username}`;
    input.value = "";
    await loadExcludedUsers();
  } catch (e) {
    msg.dataset.tone = "bad";
    msg.textContent = "Błąd: " + (e.message || e);
  }
}

async function removeExcludedUser(userId) {
  try {
    await adminPost("/stats/excluded/remove", { user_id: userId });
    await loadExcludedUsers();
  } catch (e) {
    console.error("[settings] removeExcludedUser error:", e);
  }
}

export async function loadRetentionStats() {
  try {
    const data = await adminGet("/stats/retention", "stats");
    if (!data?.funnel) throw new Error("get_retention_stats: unexpected response shape: " + JSON.stringify(data));
    renderRetentionTable(data);
    renderSegmentBars(data.segments, data.funnel.registered);
    renderTrendChart(data.trend_users);
  } catch (e) {
    console.error("[settings] loadRetentionStats error:", e);
  }
}

const STAT_DETAIL_CONFIG = {
  activity: {
    title: 'Aktywność teraz',
    cols: ['Użytkownik','Aktywność','Gra / zasób','Urządzenia / karta','Ostatni kontakt'],
    row: r => [r.user,r.activity,r.resource,r.context,r.last_seen_at?fmtDate(r.last_seen_at):'—'],
  },
  users: {
    title: "Użytkownicy",
    cols: ["Nazwa użytkownika", "E-mail", "Język", "Gość?", "Rejestracja"],
    row: r => [r.username || "—", r.email || "—", r.language || "—", r.is_guest ? "tak" : "nie", fmtDate(r.created_at)],
  },
  games: {
    title: "Gry",
    cols: ["Nazwa", "Typ", "Status", "Właściciel", "Data"],
    row: r => [r.name || "—", r.type || "—", r.status || "—", r.owner || "—", fmtDate(r.created_at)],
  },
  custom_settings: {
    title: "Niedomyślne ustawienia",
    cols: ["Gra", "Właściciel", "Mnożniki rund", "Próg wejścia do finału", "Cel finału", "Ekran końcowy", "Mnożnik nagrody", "Kwota nagrody głównej", "Kolory ekranu", "Motyw ekranu", "Logo", "Finał", "Pytania finału", "Pytania rund", "Dźwięk", "Utworzono"],
    row: r => [
      r.game_name || "—",
      r.owner || "—",
      fmtAdvancedField(r, "roundMultipliers"),
      fmtAdvancedField(r, "finalMinPoints"),
      fmtAdvancedField(r, "finalTarget"),
      fmtAdvancedField(r, "endScreenMode"),
      fmtAdvancedField(r, "finalPrizeMultiplier"),
      fmtAdvancedField(r, "mainPrizeAmount"),
      buildColorsCell(r.display),
      fmtDisplayTheme(r.display),
      fmtDisplayLogo(r.display),
      fmtHasFinal(r.has_final),
      fmtQuestionsModeField(r.final_questions_mode),
      fmtQuestionsModeField(r.rounds_questions_mode),
      fmtCustomSound(r.sound),
      fmtDate(r.created_at),
    ],
  },
  gameplay: {
    title: "Rozgrywki",
    cols: ["Gra", "Właściciel", "Źródło", "Kiedy", "Czas trwania", "Rundy", "Wynik rund", "Finał", "Pkt w finale", "Wynik końcowy", "Zwycięzca", "Status", "Szczegóły"],
    row: r => [
      r.game_name || "—",
      r.owner || "—",
      r.effective_status === "legacy" ? "Archiwum" : Number(r.control_version) === 2 ? "Control 2" : "Archiwum — Control 1",
      fmtDate(r.started_at),
      fmtSessionDuration(r),
      r.effective_status === "legacy" ? "—" : (r.rounds_played ?? "—"),
      (r.rounds_score_a != null && r.rounds_score_b != null) ? `${r.rounds_score_a}:${r.rounds_score_b}` : "—",
      fmtFinalStep(r.final_step),
      r.final_points != null ? `+${r.final_points}` : "—",
      (r.team_a_score != null && r.team_b_score != null) ? `${r.team_a_score}:${r.team_b_score}` : "—",
      fmtSessionWinner(r),
      fmtSessionStatus(r),
      fmtSessionDetails(r),
    ],
  },
  polls: {
    title: "Ankiety",
    cols: ["Nazwa", "Typ", "Status", "Właściciel", "Odpowiedzi", "Tokeny", "Zaproszenia", "Wypełnione", "Utworzono"],
    row: r => [
      r.name || "—",
      r.type === "poll_text" ? "Tekstowa" : r.type === "poll_points" ? "Punktowa" : (r.type || "—"),
      r.status || "—",
      r.owner || "—",
      Number(r.responses || 0),
      Number(r.voters || 0),
      Number(r.shared_tasks || 0),
      Number(r.completed_tasks || 0),
      fmtDate(r.created_at),
    ],
  },
  bases: {
    title: "Bazy pytań",
    cols: ["Nazwa", "Właściciel", "Data"],
    row: r => [r.name || "—", r.owner || "—", fmtDate(r.created_at)],
  },
  logos: {
    title: "Logo",
    cols: ["Nazwa", "Typ", "Właściciel", "Data"],
    row: r => [r.name || "—", r.type || "—", r.owner || "—", fmtDate(r.created_at)],
  },
  ratings: {
    title: "Oceny",
    cols: ["Użytkownik", "Ocena", "Komentarz", "Data"],
    row: r => [r.username || "—", r.stars != null ? `${r.stars}/5` : "—", r.comment || "—", fmtDate(r.created_at)],
  },
};

// Rozgrywki: pomocnicze formatowanie (proste, zrozumiałe dla admina, nie techniczne)
function fmtSessionDuration(r) {
  if (r.effective_status === "legacy" || !r.started_at || !r.ended_at) return "—";
  const ms = new Date(r.ended_at) - new Date(r.started_at);
  if (!(ms > 0)) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} godz ${mins % 60} min`;
}

function fmtSessionWinner(r) {
  if (r.winner_team === "A") return r.stats_detail?.teams?.teamA || "Drużyna A";
  if (r.winner_team === "B") return r.stats_detail?.teams?.teamB || "Drużyna B";
  if (r.effective_status === "final") return "Remis";
  return "—";
}

// DOM/textContent keeps player-entered names and answers out of HTML parsing.
function fmtSessionDetails(r) {
  if (Number(r.control_version) !== 2) return "—";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn sm stats-session-details-button";
  button.textContent = "Pokaż przebieg";
  button.addEventListener("click", () => {
    void openSessionRunDetailsModal(r).finally(() => button.focus());
  });
  return button;
}

function openSessionRunDetailsModal(r) {
  return confirmModal({
    title: "Przebieg rozgrywki",
    text: "",
    okText: "Wróć do tabeli",
    showCancel: false,
    body: buildSessionRunView(r),
    onReady: ({ overlay }) => overlay?.classList.add("stats-session-details-overlay"),
  });
}

// Sugerowane problemy (session-diagnosis.js) nad przebiegiem rozgrywki.
function buildSessionRunView(r) {
  const view = document.createElement("div");
  view.append(buildSessionSuggestions(r), buildSessionRunDetails(r));
  return view;
}

function buildSessionSuggestions(r) {
  const section = document.createElement("section");
  section.className = "stats-session-suggestions";
  const heading = document.createElement("strong");
  heading.className = "stats-session-events-title";
  heading.textContent = "Sugerowane problemy";
  section.appendChild(heading);
  if (!r.diag) {
    const none = emptyState(null, { tag: "p" });
    none.textContent = "Brak podsumowania diagnostyki dla tej sesji.";
    section.appendChild(none);
    return section;
  }
  const events = Array.isArray(r.stats_detail?.events) ? r.stats_detail.events : [];
  const devices = Object.entries(deviceInfoBySource(events))
    .map(([source, metrics]) => `${SOURCE_NAMES[source] || source}: ${describeDevice(metrics) || "—"}`);
  if (devices.length) {
    const line = document.createElement("p");
    line.className = "stats-session-suggestion-devices";
    line.textContent = `Urządzenia — ${devices.join("; ")}`;
    section.appendChild(line);
  }
  const suggestions = diagnoseSession(r);
  if (!suggestions.length) {
    const none = emptyState(null, { tag: "p" });
    none.textContent = "Nie wykryto problemów.";
    section.appendChild(none);
  }
  const timeOf = event => event.at ? new Date(event.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  for (const item of suggestions) {
    const row = document.createElement("div");
    row.className = `stats-session-suggestion stats-session-suggestion--${item.level}`;
    const title = document.createElement("strong");
    title.textContent = item.title;
    const detail = document.createElement("span");
    detail.textContent = item.detail;
    row.append(title, detail);
    if (item.evidence.length) {
      const proof = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Na podstawie zdarzeń (${item.evidence.length})`;
      proof.appendChild(summary);
      for (const event of item.evidence.slice(0, 12)) {
        const line = document.createElement("div");
        line.textContent = `${timeOf(event)} · ${SOURCE_NAMES[event.source] || event.source || "—"} · ${event.message || event.category || event.kind}`;
        proof.appendChild(line);
      }
      row.appendChild(proof);
    }
    section.appendChild(row);
  }
  if (Number(r.diag.dropped_count) > 0) {
    const dropped = emptyState(null, { tag: "p" });
    dropped.textContent = `Przekroczono limit 3000 zdarzeń: pominięto ${r.diag.dropped_count} szczegółów (liczniki są pełne).`;
    section.appendChild(dropped);
  }
  return section;
}

// Zestawienie sugestii dla załadowanych sesji Control 2 (tabela Rozgrywki).
function buildSessionsDiagnosisSummary(rows) {
  const result = summarizeSessions(rows);
  const section = document.createElement("section");
  section.className = "stats-session-suggestions stats-sessions-diagnosis";
  const heading = document.createElement("strong");
  heading.className = "stats-session-events-title";
  heading.textContent = `Sugerowane problemy — ${result.sessions} sesji Control 2`;
  section.appendChild(heading);
  const clean = emptyState(null, { tag: "p" });
  clean.textContent = result.sessions
    ? `Bez problemów (poza informacjami): ${result.clean} (${Math.round(result.clean / result.sessions * 100)}%)`
    : "Brak sesji z podsumowaniem diagnostyki.";
  section.appendChild(clean);
  for (const item of result.items) {
    const line = document.createElement("div");
    line.className = "stats-sessions-diagnosis-row";
    const label = document.createElement("span");
    label.textContent = item.title;
    const value = document.createElement("strong");
    value.textContent = `${item.count} (${Math.round(item.share * 100)}%)`;
    line.append(label, value);
    section.appendChild(line);
  }
  return section;
}

function buildSessionRunDetails(r) {
  const info = r.stats_detail || {};
  const details = document.createElement("div");
  details.className = "stats-session-run-details";
  function line(text) {
    const p = document.createElement("p");
    p.textContent = text;
    p.className = "stats-session-run-line";
    details.appendChild(p);
  }
  if (info.settings?.testMode === true) line("Tryb testowy");
  const teams = info.teams || {};
  const gameTitle = document.createElement("strong");
  gameTitle.className = "stats-session-run-teams";
  gameTitle.textContent = `${r.game_name || "Gra"} · ${teams.teamA || "Drużyna A"} / ${teams.teamB || "Drużyna B"}`;
  details.appendChild(gameTitle);
  const reasons = {
    restart: "Rozpoczęto grę od nowa.",
    final_target: "Zakończono grę po osiągnięciu progu finału.",
    final_complete: "Ukończono finał.",
    rounds_target: "Zakończono grę po osiągnięciu progu rund.",
    questions_exhausted: "Zakończono grę po wykorzystaniu pytań.",
    control_idle_expired: "Gra została przerwana po godzinie bezczynności panelu sterowania.",
    settings_cancelled: "Aktywną rozgrywkę zakończono z poziomu ustawień gry.",
  };
  if (info.end_reason) line(reasons[info.end_reason] || "Przyczyna zakończenia nie jest rozpoznana.");
  // 483: finał doszedł do końca, a sesję zamknęła bezczynność, restart lub
  // ustawienia — gra liczy się jako zakończona, punkty finału doliczone.
  const closedBy = {
    control_idle_expired: "Operator nie zamknął finału; sesję zamknięto po godzinie bezczynności.",
    restart: "Operator nie zamknął finału; zamknięto ją przy rozpoczęciu gry od nowa.",
    settings_cancelled: "Operator nie zamknął finału; zamknięto ją z poziomu ustawień gry.",
  };
  if (closedBy[info.closed_by]) line(closedBy[info.closed_by]);
  if (info.end_reason === "control_idle_expired") {
    const lastStep = String(info.last_step || "");
    const stepNames = {
      r_intro: "Ekran rozpoczęcia gry",
      r_roundStart: "Przed rozpoczęciem rundy",
      r_duel: "Pojedynek",
      r_play: "Runda w trakcie",
      r_gameEnd: "Zakończenie gry",
      f_start: "Rozpoczęcie finału",
      f_p1_entry: "Wpisywanie odpowiedzi — gracz 1",
      f_p2_start: "Przejście do gracza 2",
      f_p2_entry: "Wpisywanie odpowiedzi — gracz 2",
      f_end: "Zakończenie finału",
    };
    const mappedFinal = lastStep.match(/^f_p([12])_map_q[1-5]$/);
    const lastStepName = mappedFinal
      ? `Mapowanie finału — gracz ${mappedFinal[1]}`
      : stepNames[lastStep] || (lastStep ? "Etap gry zapisany w statystykach" : "Etap nie został zapisany");
    line(`Ostatni etap: ${lastStepName}.`);
    if (!Object.keys(info.rounds || {}).length) line("Nie rozliczono żadnej rundy.");
  }
  if (info.resumed_at_install) line("Zapis statystyk rozpoczęty po wznowieniu trwającej gry.");
  Object.values(info.rounds || {}).sort((a,b) => a.number-b.number).forEach(round => {
    line(`Runda ${round.number}: ${round.question?.text || "—"}. Bank ${round.bank ?? "—"} × ${round.multiplier ?? "—"}; przyznano ${round.awarded_a}:${round.awarded_b}; wynik ${round.score_a}:${round.score_b}${round.steal?.used ? (round.steal.won ? "; kradzież udana" : "; kradzież nieudana") : ""}.`);
  });
  if (info.final) {
    [1,2].forEach(player => {
      const mapping = info.final[`mapping${player}`] || [];
      const entries = info.final[`player${player}`] || [];
      const sum = mapping.reduce((total,row) => total + (row?.revealedPoints ? Number(row.pts) || 0 : 0),0);
      line(`Gracz ${player}: ${sum} pkt.`);
      mapping.forEach((row,i) => {
        if (!row?.revealedAnswer && !entries[i]?.text && !entries[i]?.repeat) return;
        line(`${i+1}. ${entries[i]?.repeat || row?.repeat ? "Powtórzenie" : entries[i]?.text || "Brak odpowiedzi"} → ${row?.outText || "—"} (${row?.revealedPoints ? row.pts : "—"} pkt)`);
      });
    });
    line(`Finał: ${info.final.points} / ${info.final.target} pkt.`);
  }
  if (info.prize != null) line(`Nagroda: ${Number(info.prize).toLocaleString("pl-PL")}`);

  const events = (info.events || []).filter(event => event?.kind);
  if (events.length) {
    const names = { display:"Wyświetlacz", host:"Prowadzący", buzzer:"Przycisk", control:"Control" };
    const timeOf = event => event.at ? new Date(event.at).toLocaleTimeString("pl-PL", { hour:"2-digit", minute:"2-digit", second:"2-digit" }) : "—";
    const presenceOf = event => typeof event.message === "string" && event.message.startsWith("presence:")
      ? event.message.slice("presence:".length).split(",").map(part => {
        const [kind, state] = part.split("=");
        return kind ? `${names[kind] || kind}: ${state === "online" ? "online" : "offline"}` : "";
      }).filter(Boolean).join(" · ")
      : "";
    const formatDuration = value => {
      const ms = Math.max(0, Number(value) || 0);
      const seconds = ms >= 10_000 ? Math.round(ms / 1000) : Math.round(ms / 100) / 10;
      return `${seconds.toFixed(ms >= 10_000 ? 0 : 1).replace(".", ",")} s`;
    };
    const diagnosticText = event => {
      const metrics = event.metrics || {};
      const devices = (event.devices || []).map(kind => names[kind] || kind).join(", ") || "Urządzenie";
      if (event.category === "connectivity") {
        if (metrics.phase === "metadata_read_error") {
          const error = metrics.error_code || metrics.http_status || metrics.error_name;
          return {
            title: "Dodatkowe dane obecności niedostępne",
            detail: `Control nie odczytał device_presence${error ? ` (${error})` : ""}; lease urządzeń działał, akcje gry nie były blokowane.`,
          };
        }
        if (metrics.phase === "metadata_recovered") {
          return {
            title: "Dodatkowe dane obecności wróciły",
            detail: `Odczyt device_presence wznowił się po ${formatDuration(metrics.duration_ms)}; akcje gry nie były blokowane.`,
          };
        }
        if (metrics.phase === "read_error") {
          const error = metrics.error_code || metrics.http_status || metrics.error_name;
          // lease_status: baza odpowiedziała błędem; status_read: brak
          // odpowiedzi (limit czasu, sieć Control).
          const cause = metrics.source === "status_read"
            ? "nie odpowiedział (limit czasu lub sieć po stronie Control)"
            : "zwrócił błąd bazy";
          return {
            title: "Control nie może potwierdzić stanu urządzeń",
            detail: `Odczyt stanu urządzeń ${cause}${error ? ` (${error})` : ""}${metrics.error_message ? ` — ${metrics.error_message}` : ""}; akcje gry są blokowane do odzyskania odczytu, urządzenia nie są uznawane za rozłączone.`,
          };
        }
        if (metrics.phase === "recovered") {
          return {
            title: "Control odzyskał stan urządzeń",
            detail: `Odczyt stanu urządzeń wrócił po ${formatDuration(metrics.duration_ms)}; akcje gry mogą być kontynuowane.`,
          };
        }
        const details = [`Blokada: ${formatDuration(metrics.blocked_duration_ms)}`];
        if (metrics.repeated_drops) details.push(`ponowne zaniki: ${metrics.repeated_drops}`);
        if (metrics.blocked_action_attempts) details.push(`próby akcji podczas blokady: ${metrics.blocked_action_attempts}`);
        Object.entries(metrics.device_context || {}).forEach(([kind, context]) => {
          const relation = context?.profile === "same_profile" ? "ten sam profil przeglądarki"
            : context?.profile === "different_profile" ? "inny profil przeglądarki" : "profil nierozpoznany";
          const visibility = context?.visibility === "hidden" ? "karta była w tle"
            : context?.visibility === "visible" ? "karta była widoczna" : "widoczność karty nieznana";
          const sinceChange = Number.isFinite(context?.visibility_change_ms_ago)
            ? `, zmiana widoczności ${formatDuration(context.visibility_change_ms_ago)} wcześniej` : "";
          details.push(`${names[kind] || kind}: ${relation}, ${visibility}${sinceChange}`);
        });
        return { title: `Połączenie: ${devices}`, detail: details.join(" · ") };
      }
      if (event.category === "audio_unlock") {
        const lostReasons = {
          context_suspended: "kontekst audio wstrzymany",
          context_interrupted: "kontekst audio przerwany przez system",
          context_closed: "kontekst audio zamknięty",
          not_allowed: "odtworzenie odrzucone (NotAllowedError)",
        };
        const reason = metrics.reason === "browser_lost"
          ? `przeglądarka przestała pozwalać na dźwięk${metrics.detail ? ` — ${lostReasons[metrics.detail] || metrics.detail}` : ""} (np. uśpienie ekranu lub karta w tle)`
          : "nowa karta Wyświetlacza (przeładowanie, podmiana lub ponowne podłączenie)";
        const outcomes = {
          unlocked: "odblokowano gestem po",
          display_offline: "Wyświetlacz rozłączył się po",
          game_ended: "gra zakończyła się po",
          not_required: "odblokowanie przestało być potrzebne po",
        };
        const details = [reason, `${outcomes[metrics.outcome] || "czekanie trwało"} ${formatDuration(metrics.wait_ms)}`];
        if (metrics.blocked_action_attempts) details.push(`próby akcji podczas blokady: ${metrics.blocked_action_attempts}`);
        if (metrics.display_visibility === "hidden") details.push("karta Wyświetlacza była w tle");
        return { title: "Czekanie na odblokowanie dźwięku na Wyświetlaczu", detail: details.join(" · ") };
      }
      if (event.category === "device_lease") {
        const states = { waiting:"oczekuje na zwolnienie blokady", primary:"zostało aktywowane jako główne", released:"zwolniło blokadę", expired:"utraciło blokadę po wygaśnięciu lease", revoked:"jego połączenie zostało cofnięte" };
        const from = metrics.from_state ? `${metrics.from_state} → ` : "";
        const epoch = Number.isFinite(Number(metrics.epoch)) ? ` · epoka ${metrics.epoch}` : "";
        return { title: "Stan blokady urządzenia", detail: ` ${devices} · ${from}${states[metrics.to_state] || "zmieniło stan połączenia"}${epoch}` };
      }
      if (event.category === "audio_start") {
        const sound = String(metrics.sound || "dźwięk");
        const browserError = String(metrics.error || "");
        const errorMessage = browserError === "NotAllowedError"
          ? "przeglądarka zablokowała odtworzenie dźwięku; odblokuj dźwięk na Wyświetlaczu"
          : browserError ? `błąd przeglądarki: ${browserError}` : "";
        const result = metrics.failed ? `nie uruchomił się${errorMessage ? ` (${errorMessage})` : ""}`
          : `wystartował po ${formatDuration(metrics.start_delay_ms)}`;
        return { title: `Dźwięk: ${sound}`, detail: `${devices} · ${result}` };
      }
      if (event.category === "display_state") {
        if (metrics.reason === "page_state") {
          const visibility = metrics.visibility === "hidden" ? "karta w tle" : metrics.visibility === "visible" ? "karta widoczna" : "widoczność nieznana";
          const focus = metrics.focused === true ? "okno aktywne" : metrics.focused === false ? "okno bez fokusu" : "fokus nieznany";
          const reasons = { initial:"stan na początku rozgrywki", visibilitychange:"zmiana widoczności" };
          const away = metrics.hidden_duration_ms != null ? ` · wcześniej w tle ${formatDuration(metrics.hidden_duration_ms)}` : "";
          return { title: `Widoczność: ${devices}`, detail: `${reasons[metrics.visibility_reason || metrics.reason] || "stan karty"} · ${visibility} · ${focus}${away}${metrics.was_discarded ? " · karta została wcześniej odtworzona po odrzuceniu" : ""}` };
        }
        if (metrics.reason === "network_state") {
          return { title: "Sieć Wyświetlacza", detail: metrics.online ? "przeglądarka zgłosiła połączenie z siecią" : "przeglądarka zgłosiła brak połączenia z siecią" };
        }
        if (metrics.reason === "render_stall") {
          return { title: "Zacięcie renderowania Wyświetlacza", detail: `Przerwa ${formatDuration(metrics.max_frame_gap_ms)} między klatkami (${metrics.stalled_frames || 0} zacięć)${metrics.visibility === "visible" ? " · karta była widoczna" : ""} · rewizja ${metrics.state_rev ?? "—"}` };
        }
        if (metrics.reason === "runtime_error") {
          const phase = metrics.phase === "completion_ack" ? "potwierdzenie renderowania" : metrics.phase === "render" ? "renderowanie planszy" : "działanie strony";
          const rawError = String(metrics.error_name || "Error");
          const error = rawError === "NotAllowedError" ? "przeglądarka zablokowała dźwięk (wymaga odblokowania na Wyświetlaczu)" : rawError;
          return { title: "Błąd Wyświetlacza", detail: `${phase} · ${error} · rewizja ${metrics.state_rev ?? "—"}` };
        }
      }
      if (event.category === "display_delay") {
        // Zegar serwera (483): kiedy Wyświetlacz zapisał potwierdzenie
        // względem żądania zmiany — odróżnia spóźniony Wyświetlacz od
        // potwierdzenia zgubionego w drodze do Control.
        const displayAckText = m => Number.isFinite(Number(m.display_ack_ms)) && m.display_ack_ms !== null
          ? ` · Wyświetlacz zapisał potwierdzenie po ${formatDuration(m.display_ack_ms)}${Number(m.actual_ms) - Number(m.display_ack_ms) > 1000 ? " — reszta to droga potwierdzenia do Control" : ""}`
          : "";
        if (metrics.reason === "ack_read_recovered") {
          return { title: "Odczyt potwierdzenia planszy wrócił", detail: `Po ${formatDuration(metrics.duration_ms)}` };
        }
        if (metrics.reason === "ack_read_error") {
          const errorNames = { AbortError: "przekroczono limit czasu odczytu", TimeoutError: "przekroczono limit czasu odczytu", TypeError: "błąd sieci podczas odczytu" };
          const cause = errorNames[metrics.error_code] || (metrics.error_code && metrics.error_code !== "read_error" ? `kod: ${metrics.error_code}` : "nieznana przyczyna");
          return { title: "Problem z odczytem potwierdzenia planszy", detail: `Panel sterowania nie mógł odczytać potwierdzenia Wyświetlacza (${cause}).` };
        }
        if (metrics.reason === "frame_stall") {
          return { title: "Zacięcie animacji planszy", detail: `Display: przerwa ${formatDuration(metrics.max_frame_gap_ms)} między klatkami (${metrics.stalled_frames || 0} zacięć)${metrics.display_visibility === "visible" ? " · karta była widoczna" : ""}` };
        }
        if (metrics.reason === "start_signal_timeout") {
          return { title: "Opóźniony start planszy", detail: `Display nie potwierdził startu w ${formatDuration(metrics.wait_ms)}; dźwięk ruszył po limicie.` };
        }
        if (metrics.reason === "ack_timeout") {
          return { title: "Brak potwierdzenia planszy", detail: `Display nie potwierdził zmiany przez ${formatDuration(metrics.wait_ms)}; oczekiwano ${formatDuration(metrics.expected_ms)}${metrics.ack_read_error ? "; panel Control miał też problem z odczytem potwierdzenia" : ""}${metrics.completion_realtime_connected === false ? " · kanał potwierdzeń Control był rozłączony" : ""}${metrics.control_visibility === "hidden" ? " · panel Control był w tle" : ""}${metrics.display_visibility === "hidden" ? " · karta Wyświetlacza była w tle (animacja i potwierdzenie czekały na jej powrót)" : ""}.` };
        }
        if (metrics.reason === "late_ack") {
          return { title: "Spóźnione potwierdzenie planszy", detail: `Display potwierdził zmianę po ${formatDuration(metrics.actual_ms)} (oczekiwano ${formatDuration(metrics.expected_ms)}); do tego czasu akcje Control były zablokowane${metrics.display_visibility === "hidden" ? " · karta Wyświetlacza była w tle" : ""}${metrics.ack_source === "fallback_read" ? " · potwierdzenie odczytane z bazy (kanał na żywo go nie dostarczył)" : ""}${displayAckText(metrics)}.` };
        }
        return {
          title: "Opóźniona zmiana planszy",
          detail: `Display: ${formatDuration(metrics.actual_ms)}; oczekiwano ${formatDuration(metrics.expected_ms)}; opóźnienie ${formatDuration(metrics.extra_ms)}${metrics.control_visibility === "hidden" ? " · panel Control był w tle" : ""}${displayAckText(metrics)}`,
        };
      }
      if (event.category === "device_network") {
        // Pomiar łącza (migracja 466): Cloudflare = samo łącze urządzenia,
        // serwer = Cloudflare + nasz serwer i baza; różnica to czas systemu.
        const ms = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value))} ms` : "?";
        const pair = (edge, db, edgeFailed, dbFailed) => {
          const server = Number.isFinite(Number(edge)) && Number.isFinite(Number(db)) && !edgeFailed && !dbFailed
            ? ` (sam serwer ~${Math.max(0, Math.round(Number(db) - Number(edge)))} ms)` : "";
          return `do Cloudflare ${edgeFailed ? "brak odpowiedzi" : ms(edge)} · do serwera ${dbFailed ? "brak odpowiedzi" : ms(db)}${server}`;
        };
        const link = [
          metrics.connection_type && metrics.connection_type !== "unknown" ? `sieć ${metrics.connection_type}` : "",
          metrics.effective_type ? `jakość ${metrics.effective_type}` : "",
          metrics.browser_rtt_ms != null ? `RTT przeglądarki ${metrics.browser_rtt_ms} ms` : "",
          metrics.downlink_mbps != null ? `${String(metrics.downlink_mbps).replace(".", ",")} Mb/s` : "",
          metrics.online === false ? "przeglądarka zgłaszała brak sieci" : "",
        ].filter(Boolean).join(", ");
        const linkText = link ? ` · ${link}` : "";
        if (metrics.phase === "baseline") return { title: `Pomiar łącza na starcie: ${devices}`, detail: `${pair(metrics.edge_ms, metrics.db_ms, metrics.edge_failed, metrics.db_failed)}${linkText}` };
        if (metrics.phase === "slow") {
          const title = metrics.verdict === "server" ? `Wolny serwer (łącze sprawne): ${devices}` : `Wolne łącze urządzenia: ${devices}`;
          return { title, detail: `${pair(metrics.edge_ms, metrics.db_ms, metrics.edge_failed, metrics.db_failed)}${linkText}` };
        }
        if (metrics.phase === "recovered") {
          const counts = [
            metrics.device_network_samples ? `łącze ${metrics.device_network_samples}×` : "",
            metrics.server_samples ? `serwer ${metrics.server_samples}×` : "",
          ].filter(Boolean).join(", ");
          return { title: `Łącze wróciło do normy: ${devices}`, detail: `Spowolnienie trwało ${formatDuration(metrics.duration_ms)}${counts ? ` (wolne pomiary: ${counts})` : ""} · najgorzej: do Cloudflare ${ms(metrics.max_edge_ms)}, do serwera ${ms(metrics.max_db_ms)}` };
        }
      }
      if (event.category === "device_transport") {
        const duration = metrics.duration_ms != null ? ` · przerwa ${formatDuration(metrics.duration_ms)}` : "";
        const catchups = Number(metrics.catchup_count) > 0
          ? ` · nadrobiono ${metrics.catchup_count} odczytami, ${metrics.missed_revisions || 0} rewizji` : " · bez nadrobienia przez odczyt awaryjny";
        const visibility = metrics.start_visibility === "hidden" ? " · karta była w tle" : metrics.start_visibility === "visible" ? " · karta była widoczna" : "";
        const background = Number(metrics.hidden_duration_ms) > 0 ? `, w tym ${formatDuration(metrics.hidden_duration_ms)} w tle` : "";
        const network = metrics.start_online === false ? " · przeglądarka zgłaszała brak sieci" : "";
        const cause = metrics.first_status === "STALE" ? " · kanał milczał mimo połączenia (wykrył heartbeat), odbudowany" : metrics.first_status ? ` · status ${metrics.first_status}` : "";
        return { title: `Przerwa kanału: ${devices}`, detail: `${duration}${cause}${catchups}${visibility}${background}${network}${metrics.was_discarded ? " · karta została odtworzona po odrzuceniu" : ""}`.trim() };
      }
      if (event.category === "device_state_sync") {
        const revision = metrics.revision != null ? ` · rewizja ${metrics.revision}` : "";
        if (metrics.phase === "read_error") return { title: `Błąd odczytu bazy: ${devices}`, detail: `Odczyt awaryjny nie powiódł się${metrics.fetch_ms != null ? ` po ${formatDuration(metrics.fetch_ms)}` : ""}${metrics.error_class ? ` · ${metrics.error_class}` : ""}${revision}` };
        if (metrics.phase === "read_recovered") return { title: `Odczyt bazy wrócił: ${devices}`, detail: `${metrics.fetch_ms != null ? `Odczyt trwał ${formatDuration(metrics.fetch_ms)}` : "Odczyt działa"}${revision}` };
        if (metrics.phase === "render_error") return { title: `Błąd renderowania: ${devices}`, detail: `${metrics.error_class || "Błąd urządzenia"}${revision}` };
        if (metrics.phase === "render_recovered") return { title: `Renderowanie wróciło: ${devices}`, detail: `Nowy stan został zastosowany${revision}` };
        if (metrics.phase === "fallback_catchup" && metrics.trigger === "lease_heartbeat") return { title: `Urządzenie samo nadrobiło zgubiony stan: ${devices}`, detail: `Kanał na żywo nie dostarczył zmiany; sygnał życia wykrył zaległość (rewizja ${metrics.latest_revision ?? "?"}${metrics.missed_revisions ? `, brakowało ${metrics.missed_revisions}` : ""}) i stan pobrano z bazy.` };
        if (metrics.phase === "fallback_catchup") return { title: `Odczyt awaryjny nadrobił stan: ${devices}`, detail: `Pominięto ${metrics.previous_revision ?? "?"} → ${metrics.revision ?? "?"}${metrics.fetch_ms != null ? ` · odczyt ${formatDuration(metrics.fetch_ms)}` : ""}` };
      }
      if (event.category === "state_sync") {
        if (metrics.phase === "requested") {
          const from = metrics.from_step || "?";
          const to = metrics.to_step || "?";
          const cue = metrics.sound ? ` · ${metrics.sound}` : "";
          const expected = metrics.expected_ms != null && Number.isFinite(Number(metrics.expected_ms)) ? ` · oczekiwano ${formatDuration(metrics.expected_ms)}` : "";
          const previous = metrics.previous_revision != null ? `r${metrics.previous_revision} → ` : "";
          return { title: `Wysłano stan r${metrics.revision ?? "—"}`, detail: `${previous}${from} → ${to}${cue}${expected}` };
        }
        if (metrics.phase === "acknowledged") {
          const source = metrics.ack_source === "realtime" ? "Realtime" : "odczyt awaryjny";
          const expected = metrics.expected_ms != null && Number.isFinite(Number(metrics.expected_ms)) ? `; oczekiwano ${formatDuration(metrics.expected_ms)}` : "";
          return { title: `Display potwierdził r${metrics.acknowledged_revision ?? metrics.revision ?? "—"}`, detail: `ACK przez ${source} po ${formatDuration(metrics.latency_ms)}${expected}${metrics.control_visibility === "hidden" ? " · Control było w tle" : ""}` };
        }
      }
      if (event.category === "page_lifecycle") {
        const phases = {
          freeze: "przeglądarka zamroziła stronę",
          resume: `strona wznowiona po zamrożeniu${metrics.duration_ms != null ? ` (${formatDuration(metrics.duration_ms)})` : ""}`,
          pagehide: metrics.persisted ? "strona ukryta w pamięci przeglądarki" : "strona zamknięta lub przeładowana",
          pageshow: "strona przywrócona z pamięci przeglądarki",
          offline: "przeglądarka zgłosiła brak sieci",
          online: `sieć wróciła${metrics.duration_ms != null ? ` po ${formatDuration(metrics.duration_ms)}` : ""}`,
        };
        return { title: `Strona: ${devices}`, detail: phases[metrics.phase] || "zmiana stanu strony" };
      }
      if (event.category === "wake_lock") {
        const phases = {
          granted: "blokada wygaszania ekranu włączona",
          denied: `przeglądarka odmówiła blokady wygaszania ekranu${metrics.error_name ? ` (${metrics.error_name})` : ""}`,
          unsupported: "przeglądarka nie obsługuje blokady wygaszania ekranu",
          released: "system zwolnił blokadę wygaszania przy widocznej karcie (np. oszczędzanie baterii)",
        };
        return { title: `Ekran: ${devices}`, detail: phases[metrics.phase] || "blokada wygaszania ekranu" };
      }
      if (event.category === "device_info") {
        const classes = { phone: "telefon", tablet: "tablet", desktop: "komputer", tv: "telewizor" };
        const parts = [classes[metrics.device_class], metrics.browser, metrics.os,
          metrics.battery_level != null ? `bateria ${metrics.battery_level}%${metrics.charging ? " (ładowanie)" : ""}` : "",
          metrics.save_data ? "oszczędzanie danych" : ""].filter(Boolean);
        return { title: `Urządzenie: ${devices}`, detail: parts.join(" · ") || "—" };
      }
      if (event.category === "realtime") {
        const state = metrics.state === "connected" ? "połączony" : "rozłączony; działa odpytywanie awaryjne";
        const channels = {
          display_completion: "Kanał potwierdzeń ACK Displaya",
          display_transition_started: "Kanał sygnału startu animacji Displaya",
        };
        const phase = metrics.phase === "game_start" ? " · stan przy starcie gry" : "";
        const raw = metrics.raw_status && metrics.raw_status !== metrics.state ? ` (${metrics.raw_status})` : "";
        return { title: channels[metrics.channel] || "Kanał Realtime", detail: `${state}${raw}${phase}` };
      }
      return { title: "Problem podczas rozgrywki", detail: String(event.message || "") };
    };
    const group = document.createElement("section");
    group.className = "stats-session-events";
    const heading = document.createElement("strong");
    heading.className = "stats-session-events-title";
    heading.textContent = "Zdarzenia";
    group.appendChild(heading);
    let outage = null;
    let hasVisibleEvent = false;
    const addOutage = end => {
      if (!outage) return;
      hasVisibleEvent = true;
      const row = document.createElement("div");
      row.className = "stats-session-event";
      const devices = [...outage.devices].map(kind => names[kind] || kind).join(", ") || "Urządzenie";
      const interval = end ? `${timeOf(outage.start)}–${timeOf(end)}` : timeOf(outage.start);
      const title = document.createElement("strong");
      title.textContent = `Przerwa: ${devices} · ${interval}`;
      row.appendChild(title);
      const state = document.createElement("span");
      state.textContent = outage.state ? `Stan: ${outage.state}` : "Stan innych urządzeń nie został zapisany";
      row.appendChild(state);
      group.appendChild(row);
      outage = null;
    };
    events.forEach(event => {
      if (event.kind === "disconnect") {
        if (!outage) outage = { start:event, devices:new Set(), state:"" };
        (event.devices || []).forEach(kind => outage.devices.add(kind));
        outage.state = presenceOf(event);
      } else if (event.kind === "reconnect") {
        if (outage) addOutage(event);
      } else if (event.kind === "diagnostic") {
        addOutage();
        hasVisibleEvent = true;
        const text = diagnosticText(event);
        const row = document.createElement("div");
        row.className = "stats-session-event";
        const title = document.createElement("strong");
        title.textContent = `${timeOf(event)}${event.prestart ? " · przed startem gry" : ""} · ${text.title}`;
        row.appendChild(title);
        const detail = document.createElement("span");
        detail.textContent = text.detail;
        row.appendChild(detail);
        group.appendChild(row);
      } else {
        addOutage();
        hasVisibleEvent = true;
        const error = document.createElement("div");
        error.className = "stats-session-event stats-session-event-error";
        error.textContent = `${timeOf(event)} · Błąd${event.message ? ` · ${event.message}` : ""}`;
        group.appendChild(error);
      }
    });
    addOutage();
    if (hasVisibleEvent) details.appendChild(group);
  }
  return details;
}

const SESSION_STATUS_LABELS = {
  started: ["Rozpoczęta", "live"],
  playing: ["W trakcie", "live"],
  final: ["Zakończona", "done"],
  won: ["Zakończona", "done"],
  lost: ["Zakończona", "done"],
  abandoned: ["Porzucona", "off"],
  error: ["Błąd", "err"],
  legacy: ["Archiwalna", "off"],
};

function fmtSessionStatus(r) {
  const [label, kind] = Number(r.control_version) === 2 && r.effective_status === "abandoned"
    ? [r.ended_at ? "Przerwana" : "Utracono kontakt", "off"]
    : SESSION_STATUS_LABELS[r.effective_status] || [r.effective_status || "—", "off"];
  const errCount = Number(r.error_count) || 0;
  const wrap = document.createElement("span");
  wrap.className = "cluster";
  const badge = document.createElement("span");
  badge.className = `tag ${({ live: "tag--info", done: "tag--ok", err: "tag--bad" })[kind] || "tag--muted"}`;
  badge.textContent = label;
  wrap.appendChild(badge);
  if (errCount > 0) {
    const warn = document.createElement("span");
    warn.className = "session-status-errors";
    warn.title = `Błędy: ${errCount}`;
    warn.innerHTML = iconText("warning", String(errCount));
    wrap.appendChild(warn);
  }
  return wrap;
}

const FINAL_STEP_LABELS = {
  finished: "Ukończony",
  player2_entry: "Gracz 2 — przygotowanie i wpisywanie",
  final_start: "Rozpoczęty (bez odpowiedzi)",
  p1_q1: "Gracz 1 — pytanie 1 z 5",
  p1_q2: "Gracz 1 — pytanie 2 z 5",
  p1_q3: "Gracz 1 — pytanie 3 z 5",
  p1_q4: "Gracz 1 — pytanie 4 z 5",
  p1_q5: "Gracz 1 — pytanie 5 z 5",
  p2_q1: "Gracz 2 — pytanie 1 z 5",
  p2_q2: "Gracz 2 — pytanie 2 z 5",
  p2_q3: "Gracz 2 — pytanie 3 z 5",
  p2_q4: "Gracz 2 — pytanie 4 z 5",
  p2_q5: "Gracz 2 — pytanie 5 z 5",
};

function fmtFinalStep(step) {
  if (!step) return "—";
  return FINAL_STEP_LABELS[step] || step;
}

// Niedomyślne ustawienia: te same wartości domyślne co w control/js/store.js (DEFAULT_ADVANCED)
const ADVANCED_SETTINGS_DEFAULTS = {
  roundMultipliers: [1, 1, 1, 2, 3],
  finalMinPoints: 300,
  finalTarget: 200,
  endScreenMode: "money",
  finalPrizeMultiplier: 3,
  mainPrizeAmount: 25000,
};

const ADVANCED_SETTINGS_LABELS = {
  roundMultipliers: "Mnożniki rund",
  finalMinPoints: "Próg wejścia do finału",
  finalTarget: "Cel finału",
  endScreenMode: "Ekran końcowy",
  finalPrizeMultiplier: "Mnożnik nagrody",
  mainPrizeAmount: "Kwota nagrody głównej",
};

const END_SCREEN_MODE_LABELS = { logo: "Logo", points: "Punkty", money: "Kwota" };
const QUESTIONS_MODE_LABELS = { random: "Losowo", pick: "Wybrane ręcznie" };
const DISPLAY_COLOR_DEFAULTS = { A: "#c4002f", B: "#2a62ff", BACKGROUND: "#d21180", DOT: "#d7ff3d" };

function fmtAdvancedSettingValue(key, value) {
  if (key === "roundMultipliers" && Array.isArray(value)) return value.join(", ");
  if (key === "endScreenMode") return END_SCREEN_MODE_LABELS[value] || String(value);
  return String(value);
}

// Jedna kolumna = jedno ustawienie. "—" oznacza wartość domyślną (bez zmian).
function fmtAdvancedField(r, key) {
  const advanced = r.advanced;
  if (!advanced || typeof advanced !== "object") return "—";
  const val = advanced[key];
  if (val === undefined || val === null) return "—";
  const def = ADVANCED_SETTINGS_DEFAULTS[key];
  const changed = Array.isArray(def) ? JSON.stringify(val) !== JSON.stringify(def) : val !== def;
  return changed ? fmtAdvancedSettingValue(key, val) : "—";
}

const DISPLAY_COLOR_LABELS = { A: "Drużyna A", B: "Drużyna B", BACKGROUND: "Tło", DOT: "Kropka" };
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i;

// Kropki koloru zamiast samego tekstu "zmienione" — widać od razu jaki kolor.
function buildColorsCell(display) {
  const colors = display && typeof display === "object" ? display.colors : null;
  const wrap = document.createElement("span");
  wrap.className = "stats-color-dots";
  if (!colors || typeof colors !== "object" || JSON.stringify(colors) === JSON.stringify(DISPLAY_COLOR_DEFAULTS)) {
    wrap.textContent = "—";
    return wrap;
  }
  for (const key of Object.keys(DISPLAY_COLOR_DEFAULTS)) {
    const val = colors[key];
    if (!val || val === DISPLAY_COLOR_DEFAULTS[key] || !HEX_COLOR_RE.test(val)) continue;
    const dot = document.createElement("span");
    dot.title = `${DISPLAY_COLOR_LABELS[key] || key}: ${val}`;
    dot.className = "stats-color-dot";
    dot.style.setProperty("--c", val);
    wrap.appendChild(dot);
  }
  if (!wrap.children.length) wrap.textContent = "—";
  return wrap;
}

function fmtDisplayTheme(display) {
  const theme = display && typeof display === "object" ? display.theme : null;
  return theme != null ? String(theme) : "—";
}

function fmtDisplayLogo(display) {
  const logoId = display && typeof display === "object" ? display.logoId : null;
  return logoId != null ? "Własne" : "—";
}

function fmtHasFinal(hasFinal) {
  if (hasFinal == null) return "—";
  return hasFinal === "true" ? "Włączony" : "Wyłączony";
}

function fmtQuestionsModeField(mode) {
  if (!mode || mode === "random") return "—";
  return QUESTIONS_MODE_LABELS[mode] || mode;
}

function fmtCustomSound(sound) {
  if (!sound || typeof sound !== "object") return "—";
  const variants = sound.variants && typeof sound.variants === "object" ? sound.variants : {};
  const count = Object.values(variants).filter(v => v === "__custom__").length;
  return count > 0 ? `Niestandardowy (${count})` : "—";
}

const STATS_DETAIL_PER_PAGE = 25;

function buildStatsTable(cfg, rows) {
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "stats-detail-empty";
    empty.textContent = "Brak danych.";
    return empty;
  }

  const wrap = document.createElement("div");
  wrap.className = "stats-detail-wrap";

  const table = document.createElement("table");
  table.className = "stats-detail-table";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  cfg.cols.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    cfg.row(r).forEach(cell => {
      const td = document.createElement("td");
      if (cell instanceof Node) {
        td.appendChild(cell);
        if (cell.classList?.contains("stats-session-details-button")) td.classList.add("stats-session-details-cell");
      } else td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildStatsPagination(page, pages, onPage) {
  const nav = document.createElement("div");
  nav.className = "logs-page-nav stats-detail-pager";

  const prevBtn = document.createElement("button");
  prevBtn.className = "btn sm";
  prevBtn.textContent = "‹";
  prevBtn.disabled = page <= 1;
  prevBtn.addEventListener("click", () => onPage(page - 1));
  nav.appendChild(prevBtn);

  const windowSize = 7;
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(pages, start + windowSize - 1);
  if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);

  if (start > 1) {
    const btn = document.createElement("button");
    btn.className = "btn sm";
    btn.textContent = "1";
    btn.addEventListener("click", () => onPage(1));
    nav.appendChild(btn);
    if (start > 2) {
      const dots = document.createElement("span");
      dots.className = "logs-page-dots";
      dots.textContent = "…";
      nav.appendChild(dots);
    }
  }

  for (let i = start; i <= end; i++) {
    const btn = document.createElement("button");
    btn.className = "btn sm" + (i === page ? " is-active" : "");
    btn.textContent = String(i);
    if (i !== page) btn.addEventListener("click", () => onPage(i));
    nav.appendChild(btn);
  }

  if (end < pages) {
    if (end < pages - 1) {
      const dots = document.createElement("span");
      dots.className = "logs-page-dots";
      dots.textContent = "…";
      nav.appendChild(dots);
    }
    const btn = document.createElement("button");
    btn.className = "btn sm";
    btn.textContent = String(pages);
    btn.addEventListener("click", () => onPage(pages));
    nav.appendChild(btn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn sm";
  nextBtn.textContent = "›";
  nextBtn.disabled = page >= pages;
  nextBtn.addEventListener("click", () => onPage(page + 1));
  nav.appendChild(nextBtn);

  return nav;
}

function downloadControl2Stats(rows, period) {
  const now = new Date();
  const exportData = buildControl2StatsExport(rows, period, { now });
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = now.toISOString().slice(0, 10);
  link.href = url;
  link.download = `familiada-control2-${period}-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openStatsDetailModal(type) {
  const cfg = STAT_DETAIL_CONFIG[type];
  if (!cfg) return;

  const perPage = STATS_DETAIL_PER_PAGE;
  let allRows = [];

  const infoEl = document.createElement("div");
  infoEl.className = "stats-detail-info";

  const tableWrap = document.createElement("div");
  tableWrap.className = "scroll-fade stats-detail-scroll";
  tableWrap.textContent = "Ładowanie…";

  const pageWrap = document.createElement("div");

  const body = document.createElement("div");
  body.className = "stats-detail-body";

  const exportControls = document.createElement("div");
  exportControls.className = "cluster stats-detail-export";
  exportControls.hidden = type !== "gameplay";
  const exportPeriod = document.createElement("div");
  exportPeriod.className = "ui-select stats-detail-period";
  exportPeriod.innerHTML = `
    <button class="btn sm ui-select-btn" type="button" aria-label="Zakres eksportu przebiegów Control 2" aria-haspopup="listbox" aria-expanded="false">
      <span class="ui-select-label"></span>
      <span class="ui-select-caret" aria-hidden="true">${icon("caret-down")}</span>
    </button>
    <div class="ui-select-menu" role="listbox"></div>
  `;
  const exportPeriodSelect = initUiSelect(exportPeriod, {
    options: [
      { value: "today", label: "Dzisiaj" },
      { value: "7d", label: "Ostatnie 7 dni" },
      { value: "30d", label: "Ostatnie 30 dni" },
      { value: "recent", label: "Wszystkie załadowane (do 500)" },
    ],
    value: "today",
  });
  const exportButton = document.createElement("button");
  exportButton.className = "btn sm gold";
  exportButton.type = "button";
  exportButton.textContent = "Pobierz JSON";
  exportButton.disabled = true;
  exportButton.addEventListener("click", () => downloadControl2Stats(allRows, exportPeriodSelect.getValue()));
  exportControls.append(exportPeriod, exportButton);

  body.appendChild(infoEl);
  body.appendChild(exportControls);
  body.appendChild(tableWrap);
  body.appendChild(pageWrap);

  confirmModal({
    title: cfg.title,
    text: "",
    okText: "Zamknij",
    body,
    sheet: { backBtn: btnBackSheet },
    onReady: ({ okBtn, overlay }) => {
      if (okBtn?.parentElement) okBtn.parentElement.hidden = true;
      // Ten modal bywa wyższy niż widoczny obszar na małych ekranach (mobile) —
      // pozwól całemu tłu się przewinąć, żeby nagłówek z X zawsze był osiągalny.
      // Skopiowane tylko na ten overlay, żeby nie dotykać wspólnej klasy .overlay
      // używanej przez ~20 innych stron.
      overlay?.classList.add("stats-detail-overlay");
    },
  });

  // Szerokie tabele (Rozgrywki: 13 kolumn, Niedomyślne ustawienia: 16) nie
  // mieściły się w oknie 860 px, a przewijanie w poziomie bywa niewidoczne
  // (paski na macOS/iPadOS pokazują się dopiero przy przewijaniu). Okno rośnie
  // do szerokości tabeli, najwyżej do 96% ekranu; węższe ekrany przewijają.
  function fitModalToTable() {
    const modal = body.closest(".modal");
    const table = tableWrap.querySelector("table");
    if (!modal || !table) return;
    const missing = table.scrollWidth - table.parentElement.clientWidth;
    if (missing > 0) setWidth(modal, `min(${Math.ceil(modal.getBoundingClientRect().width + missing + 2)}px, 96vw)`);
  }

  function renderPage(page) {
    const total = allRows.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const from = (page - 1) * perPage;
    const to = Math.min(page * perPage, total);
    const pageRows = allRows.slice(from, to);

    infoEl.textContent = total ? `${from + 1}–${to} / ${total}` : "0 wyników";

    tableWrap.innerHTML = "";
    tableWrap.appendChild(buildStatsTable(cfg, pageRows));
    fitModalToTable();

    pageWrap.innerHTML = "";
    if (pages > 1) pageWrap.appendChild(buildStatsPagination(page, pages, renderPage));
  }

  try {
    const endpoint = type === "activity" ? `${API_BASE}/activity` : type === "polls"
      ? `${API_BASE}/stats/polls/detail?limit=500`
      : `${API_BASE}/stats/detail?type=${encodeURIComponent(type)}&limit=500`;
    const res = await apiFetch(endpoint, { method: "GET" });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[stats/detail] HTTP", res.status, errBody);
      throw new Error(`HTTP ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "błąd");
    allRows = type === "activity" ? activityDetailRows(data) : data.rows || [];
    if (type === "gameplay") {
      exportButton.disabled = false;
      body.insertBefore(buildSessionsDiagnosisSummary(allRows), tableWrap);
    }
    renderPage(1);
  } catch (err) {
    tableWrap.textContent = `Błąd: ${err.message}`;
  }
}

export function wireStatsEvents() {
  if (els.btnStatsRefresh) {
    els.btnStatsRefresh.addEventListener("click", () => {
      loadAdminStats();
      loadRetentionStats();
      loadSnakeStats();
      loadExcludedUsers();
    });
  }

  document.querySelectorAll(".stat-box[data-detail]").forEach(box => {
    box.addEventListener("click", () => openStatsDetailModal(box.dataset.detail));
    if (box.dataset.detail === 'activity') box.addEventListener('keydown',event=>{
      if (event.key==='Enter'||event.key===' ') {event.preventDefault();box.click();}
    });
  });

  const btnAdd = document.getElementById("btnExcludeAdd");
  if (btnAdd) btnAdd.addEventListener("click", addExcludedUser);

  const input = document.getElementById("excludeUsernameInput");
  if (input) input.addEventListener("keydown", e => { if (e.key === "Enter") addExcludedUser(); });
}
