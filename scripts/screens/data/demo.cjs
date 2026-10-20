// Dane demo dla atrapy Supabase (fake-supabase.js): tabele i RPC budowane
// z treści w content.cjs. buildDb(lang) zwraca obiekt serializowalny do JSON
// (RPC zależne od argumentów zapisane jako "fn:<źródło>").
const fs = require("node:fs");
const path = require("node:path");
const content = require("./content.cjs");

const repo = path.resolve(__dirname, "../../..");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const id = (prefix, n) => `00000000-0000-4000-${prefix}-${String(n).padStart(12, "0")}`;
const daysAgo = (d, h = 0) => new Date(Date.UTC(2026, 9, 20, 12 - h, 0, 0) - d * 86400000).toISOString();

// Gry: [klucz, typ, status, liczba pytań, przesunięcie w puli, dni temu, dodatki]
const GAMES = [
  ["family", "prepared", "ready", 12, 0, 0],
  ["summer", "prepared", "ready", 10, 2, 1],
  ["office", "poll_text", "poll_open", 10, 1, 2, { votes: 23 }],
  ["wedding", "poll_points", "poll_stopped", 10, 3, 3, { votes: 41 }],
  ["school", "poll_text", "ready", 10, 4, 6],
  ["birthday", "prepared", "draft", 6, 5, 8],
  ["quiz", "poll_points", "draft", 10, 0, 12],
  ["christmas", "prepared", "ready", 10, 6, 15, { from: 0 }],
  ["camp", "poll_text", "poll_open", 10, 7, 4, { votes: 12 }],
  ["teachers", "poll_points", "poll_open", 10, 8, 5, { votes: 37 }],
  ["newyear", "prepared", "ready", 11, 9, 18],
  ["seniors", "poll_text", "draft", 4, 10, 21],
  ["kids", "poll_points", "ready", 10, 11, 25],
  ["football", "prepared", "draft", 10, 3, 28, { badSum: true }],
];

function rulesState(type, status, questions, extra = {}) {
  const ok = { ok: true };
  const no = (code, params = {}) => ({ ok: false, code, params });
  const nq = questions.length;
  const enough = extra.badSum ? no("sumTooBig", { ord: 4, max: 100, sum: 115 }) : nq >= 10 ? ok : no("minQuestions", { min: 10, n: nq });
  const poll = type !== "prepared";
  const st = {
    edit: status === "poll_open" ? no("pollOpenNoEdit") : status === "poll_stopped" ? no("pollStoppedNoEdit") : ok,
    play: poll && status !== "ready" ? no("playAfterPoll") : enough,
    poll_entry: poll ? ok : no("preparedNoPoll"),
    poll_open: !poll ? no("preparedNoPoll") : status === "poll_open" ? no("pollAlreadyOpen") : enough,
    poll_stop: status === "poll_open" ? ok : no("stopOnlyOpen"),
    poll_resume: status === "poll_stopped" ? ok : no("resumeOnlyStopped"),
    poll_close: status === "poll_open" || status === "poll_stopped" ? ok : no("closeOnlyOpen"),
    export: status === "poll_open" ? no("pollOpenNoExport") : status === "poll_stopped" ? no("pollStoppedNoExport") : ok,
  };
  return { ...st, rules: { qn_min: 10, an_min: 3, an_max: 6, sum_prepared: 100 } };
}

function textLogoRows(lines) {
  const rows = Array.from({ length: 10 }, () => " ".repeat(30));
  const top = Math.floor((10 - lines.length) / 2);
  lines.forEach((line, i) => {
    const text = line.slice(0, 30);
    const pad = Math.floor((30 - text.length) / 2);
    rows[top + i] = (" ".repeat(pad) + text).padEnd(30);
  });
  return rows;
}

function buildDb(lang) {
  const c = content[lang];
  const user = { id: USER_ID, email: c.user.email, is_anonymous: false, user_metadata: { username: c.user.username }, app_metadata: {}, created_at: daysAgo(200) };
  const tables = { games: [], questions: [], answers: [], user_logos: [], question_bases: [], qb_categories: [], qb_questions: [], qb_tags: [], qb_question_tags: [], qb_category_tags: [], question_base_shares: [], profiles: [], user_flags: [], app_ratings: [], edit_locks: [] };
  const votes = [];

  // ---------- gry ----------
  let qn = 0; let an = 0;
  GAMES.forEach(([key, type, status, count, offset, age, extra = {}], gi) => {
    const gameId = id("8000", 100 + gi);
    const qs = Array.from({ length: count }, (_, i) => c.questions[(offset + i) % c.questions.length]);
    const qRows = qs.map(([text, answers], i) => {
      const q = { id: id("8100", ++qn), game_id: gameId, ord: i + 1, text, created_at: daysAgo(age) };
      // Ankieta tekstowa przed podliczeniem nie ma jeszcze odpowiedzi (powstają z głosów).
      const withAnswers = !(type === "poll_text" && status !== "ready");
      if (withAnswers) {
        answers.forEach(([atext, pts], ai) => tables.answers.push({ id: id("8200", ++an), question_id: q.id, ord: ai + 1, text: atext, fixed_points: type === "prepared" || status === "ready" ? pts : 0, created_at: daysAgo(age) }));
      }
      return q;
    });
    tables.questions.push(...qRows);
    const from = extra.from != null ? c.friends[extra.from] : null;
    tables.games.push({
      id: gameId, owner_id: USER_ID, name: c.games[key], type, status,
      created_at: daysAgo(age), updated_at: daysAgo(age, 2),
      poll_opened_at: status.startsWith("poll_") ? daysAgo(age) : null, poll_closed_at: null,
      share_key_poll: `poll${gi}KEY0000`, share_key_control: `ctl${gi}KEY0000`, share_key_display: `dsp${gi}KEY0000`, share_key_host: `hst${gi}KEY0000`, share_key_buzzer: `bzr${gi}KEY0000`,
      is_demo: false, source_market_id: null, settings: {}, rules_state: rulesState(type, status, qRows, extra),
      received_from_label: from ? from[0] : null, received_from_identity: from ? { username: from[0] } : null,
    });
    if (extra.votes) votes.push({ game_id: gameId, votes: extra.votes });
  });

  // ---------- logo ----------
  const L = c.logos;
  const textLogos = [["classic", null, 0]];
  const familiada = JSON.parse(fs.readFileSync(path.join(repo, "web/shared/data/logo_familiada.json"), "utf8"));
  textLogos.forEach(([key, lines, age], i) => {
    const layers = lines ? [{ color: "main", rows: textLogoRows(lines) }] : familiada.layers;
    tables.user_logos.push({ id: id("8300", i + 1), user_id: USER_ID, name: L[key], type: "GLYPH_30x10", created_at: daysAgo(age), updated_at: daysAgo(age), is_demo: false, received_from_label: null, received_from_identity: null,
      payload: { layers, source: { mode: "TEXT", ...(lines ? { text: lines.join("\n") } : {}) } } });
  });
  const pix = JSON.parse(fs.readFileSync(path.join(repo, "docs/DEMO - Logo Rysunek.famlogo"), "utf8"));
  tables.user_logos.push({ id: id("8300", 20), user_id: USER_ID, name: L.demo, type: "PIX_150x70", created_at: daysAgo(2), updated_at: daysAgo(2), is_demo: false, received_from_label: null, received_from_identity: null,
    payload: { ...pix.payload, source: { mode: "DRAW" } } });
  // Logo wypalone prawdziwymi edytorami (scripts/screens/bake-logos.cjs), jeśli są.
  const bakedFile = path.join(__dirname, "logos.baked.json");
  if (fs.existsSync(bakedFile)) {
    JSON.parse(fs.readFileSync(bakedFile, "utf8")).forEach((logo, i) => tables.user_logos.push({
      id: id("8300", 40 + i), user_id: USER_ID, name: logo.names[lang] || logo.names.pl, type: logo.type, payload: logo.payloads?.[lang] || logo.payload,
      created_at: daysAgo(logo.age || 3), updated_at: daysAgo(logo.age || 3), is_demo: false, received_from_label: null, received_from_identity: null,
    }));
  }

  // ---------- bazy pytań ----------
  const B = c.bases;
  [["main", 1], ["family", 9], ["travel", 30]].forEach(([key, age], i) => tables.question_bases.push({ id: id("8400", i + 1), owner_id: USER_ID, name: B[key], created_at: daysAgo(age), updated_at: daysAgo(age, 1), is_demo: false }));
  const mainBase = tables.question_bases[0].id;
  B.tags.forEach(([name, color], i) => tables.qb_tags.push({ id: id("8500", i + 1), base_id: mainBase, name, color, ord: i + 1, created_at: daysAgo(30) }));
  const folderOf = [0, 4, 2, 1, 0, 3, 2, 1, 0, 2, 4, 2];
  B.folders.forEach((name, i) => tables.qb_categories.push({ id: id("8600", i + 1), base_id: mainBase, parent_id: i === 6 ? id("8600", 6) : null, name, ord: i + 1, created_at: daysAgo(30), updated_at: daysAgo(30) }));
  c.questions.forEach(([text, answers], i) => {
    const qid = id("8700", i + 1);
    tables.qb_questions.push({ id: qid, base_id: mainBase, category_id: i < 2 ? null : id("8600", folderOf[i] + 1), ord: i + 1, payload: { text, answers: answers.map(([t, p], ai) => ({ ord: ai + 1, text: t, fixed_points: p })) }, created_at: daysAgo(20 - i), updated_at: daysAgo(10 - (i % 10)), updated_by: USER_ID });
    tables.qb_question_tags.push({ question_id: qid, tag_id: id("8500", (i % 3) + 1), created_at: daysAgo(10) });
    if (i % 4 === 0) tables.qb_question_tags.push({ question_id: qid, tag_id: id("8500", 4), created_at: daysAgo(10) });
  });
  tables.qb_category_tags.push({ category_id: id("8600", 6), tag_id: id("8500", 1), created_at: daysAgo(10) });

  tables.profiles.push({ id: USER_ID, username: c.user.username, email: c.user.email, language: lang, created_at: daysAgo(200) });

  // ---------- znajomi, subskrybenci, zadania ----------
  // Znajomi: 3 przyjaciół, 1 zaproszenie otrzymane, 1 wysłane, 1 odrzucone wysłane.
  const friendDirs = [["friend", "active"], ["friend", "active"], ["friend", "active"], ["incoming", "pending"], ["outgoing", "pending"], ["outgoing", "declined"]];
  const friends = c.friends.map(([label, email], i) => ({
    id: id("8800", i + 1), label, email, friend_user_id: id("8810", i + 1), direction: friendDirs[i][0], status: friendDirs[i][1],
    created_at: daysAgo(i * 3), resend_available_at: daysAgo(1), email_enabled: true,
  }));
  const subStatus = ["active", "active", "active", "pending", "declined"];
  const subscribers = c.subscribers.map((email, i) => ({
    id: id("8900", i + 1), email, label: email, status: subStatus[i], friend_user_id: i < 2 ? id("8910", i + 1) : null,
    created_at: daysAgo(i * 4), resend_available_at: daysAgo(1), email_enabled: true,
  }));
  const tasks = [
    { kind: "poll", id: id("8a00", 1), state: "todo", title: c.games.wedding, owner_label: c.friends[0][0], created_at: daysAgo(0, 3), done_at: null, token: id("8a10", 1), poll_type: "poll_points", game_id: id("8000", 200) },
    { kind: "poll", id: id("8a00", 2), state: "todo", title: c.games.quiz, owner_label: c.friends[1][0], created_at: daysAgo(1), done_at: null, token: id("8a10", 2), poll_type: "poll_text", game_id: id("8000", 201) },
    { kind: "poll", id: id("8a00", 3), state: "done", title: c.games.school, owner_label: c.friends[2][0], created_at: daysAgo(4), done_at: daysAgo(3), token: id("8a10", 3), poll_type: "poll_text", game_id: id("8000", 202) },
  ];

  // ---------- ankiety: głosy, wyniki, udostępnianie ----------
  // Odpowiedzi z puli treści dla każdego pytania (ankieta tekstowa przed
  // podliczeniem nie ma wierszy answers -- wyniki to wpisy głosujących).
  const pool = Object.fromEntries(tables.questions.map((q) => [q.id, (c.questions.find(([text]) => text === q.text) || [null, []])[1]]));
  for (const { game_id: gameId, votes: n } of votes) {
    const g = tables.games.find((x) => x.id === gameId);
    const table = g.type === "poll_text" ? "poll_text_entries" : "poll_votes";
    tables[table] = tables[table] || [];
    tables.questions.filter((q) => q.game_id === gameId).forEach((q) => {
      for (let i = 0; i < n; i++) tables[table].push({ id: id("8c00", tables[table].length + 1), game_id: gameId, question_id: q.id });
    });
  }
  const sharePanel = {
    ok: true,
    friends: friends.filter((f) => f.direction === "friend").map((f) => ({ user_id: f.friend_user_id, email: f.email, label: f.label, email_enabled: true })),
    subscribers: subscribers.filter((s) => s.status === "active").map((s) => ({ id: s.id, email: s.email, email_enabled: true })),
    tasks: [
      { id: id("8d00", 1), recipient_user_id: friends[0].friend_user_id, recipient_email: friends[0].email, label: friends[0].label, status: "done", reminder_count: 0, email_enabled: true },
      { id: id("8d00", 2), recipient_user_id: null, recipient_email: subscribers[0].email, label: subscribers[0].email, status: "pending", reminder_count: 1, email_enabled: true },
    ],
  };

  // ---------- RPC ----------
  const rpc = {
    poll_share_panel: sharePanel,
    get_poll_preview: `fn:(args, db) => {
      const pool = ${JSON.stringify(pool)};
      const votes = ${JSON.stringify(Object.fromEntries(votes.map((v) => [v.game_id, v.votes])))};
      const g = db.tables.games.find((x) => x.id === args.p_game_id);
      if (!g) return null;
      const n = votes[g.id] || 0;
      const questions = db.tables.questions.filter((q) => q.game_id === g.id).sort((a, b) => a.ord - b.ord).map((q) => {
        const answers = db.tables.answers.filter((a) => a.question_id === q.id).sort((a, b) => a.ord - b.ord)
          .map((a) => ({ id: a.id, ord: a.ord, text: a.text, fixed_points: a.fixed_points, votes: Math.round(((pool[q.id].find(([t]) => t === a.text) || [0, 0])[1] * n) / 100) }));
        const text_rows = pool[q.id].map(([text, pts]) => ({ text: text.toLowerCase(), val: Math.max(1, Math.round((pts * n) / 100)) }));
        return { id: q.id, ord: q.ord, text: q.text, answers, text_rows };
      });
      return { ok: true, status: g.status, type: g.type, questions };
    }`,
    contacts_list: `fn:(args) => (args.p_kind === "friends" ? ${JSON.stringify(friends)} : ${JSON.stringify(subscribers)})`,
    tasks_list: tasks,
    resource_copy_inbox: [],
    reserved_username_prefixes_list: [], site_activity_ping: null,
    acquire_edit_lock_mode: { ok: true }, release_edit_lock: { ok: true }, release_edit_lock_mode: { ok: true }, refresh_edit_lock: { ok: true },
    list_shared_bases_ext: [], base_declines_list_mine: [], bases_count_incoming_share_invites: 0,
    resource_copy_inbox_list: [], resource_copy_badges: [],
    badges_get: { friends_pending: 1 }, list_shared_devices_for_me: [],
    polls_vote_counts: votes,
    market_my_library: [],
    market_browse: ["pl", "en", "uk"].flatMap((mlang) => content[mlang].market.map(([title, description, author], i) => ({
      id: id("8b00", ["pl", "en", "uk"].indexOf(mlang) * 100 + i + 1), lang: mlang, title, description,
      author_username: author || "", origin: author ? "community" : "producer",
      library_count: [184, 152, 97, 73, 61, 45, 38, 22][i], avg_rating: [4.8, 4.6, 4.4, 4.7, 4.1, 3.9, 4.5, 4.2][i], rating_count: [56, 41, 23, 19, 12, 8, 11, 5][i],
      in_library: mlang === lang && i === 1, created_at: daysAgo(i * 5 + 2),
    }))),
    get_my_email_notifications: true, set_my_email_notifications: null, cooldown_get: [],
    friend_invites_from_subscriptions: { ok: true },
    control_game_settings_status: { ok: true, in_progress: false },
    game_validate: `fn:(args, db) => { const g = db.tables.games.find((x) => x.id === args.p_game_id); const s = g?.rules_state || {}; return { ok: !!g, game: g ? { id: g.id, type: g.type, status: g.status, rev: 1 } : null, ...s }; }`,
    update_logo_checked: { ok: true },
  };

  return {
    user, tables, rpc,
    relations: {
      "games.questions": { fk: "game_id" },
      "questions.answers": { fk: "question_id" },
      "question_base_shares.question_bases": { local: "base_id", one: true },
    },
    localStorage: { "sb-api-auth-token": "screens" },
    http: {
      "/_api/mail/session": { ok: true, email: c.user.email, notifications_enabled: true, subscriptions: [], items: [] },
    },
  };
}

module.exports = { buildDb, USER_ID, id };
