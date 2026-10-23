// Seria zrzutów obszaru „logos-market”: biblioteka logo, edytory logo (tekst,
// rysunek, obraz), Społeczność (/marketplace/) i panel admina (/settings/).
// Prawdziwy kod stron; dane tylko w atrapie (db: …). Sceny, które już są
// w scenes.cjs (logos, logos-draw, logos-image, logo-text, logo-draw,
// logo-image, logo-text-space, logos-name-create, marketplace,
// marketplace-my-sent, admin-*), nie są tu powtarzane.
const { id, IDS } = require("../data/demo.cjs");

const CAT = "logos-market";
const LIST = ["web/logos/index.html", "web/logos/js/list.js", "web/logos/css/", "web/logos/js/db.js", "web/logos/js/transfer.js"];
const TEXT_ED = ["web/logos/editor/text/", "web/logos/js/text.js", "web/logos/js/editor-text.js", "web/logos/js/editor-page.js"];
const DRAW_ED = ["web/logos/editor/draw/", "web/logos/js/draw", "web/logos/js/editor-draw.js", "web/logos/js/editor-page.js"];
const IMAGE_ED = ["web/logos/editor/image/", "web/logos/js/image.js", "web/logos/js/editor-image.js", "web/logos/js/editor-page.js"];
const MARKET = ["web/marketplace/"];
const ADMIN = ["web/settings/"];
const EDITOR_DEVICES = ["desktop", "tablet"];

const wait = (ms) => async (view) => { await view.waitForTimeout(ms); };
const click = (selector, ms = 400) => async (view) => { await view.locator(selector).first().click(); await view.waitForTimeout(ms); };
const openModal = (selector, modal = ".overlay:visible") => async (view) => {
  await view.locator(selector).first().click();
  await view.locator(modal).first().waitFor({ state: "visible", timeout: 5000 });
  await view.waitForTimeout(300);
};
// Po kliknięciu narzędzia kursor zostaje nad przyciskiem (podpowiedź title) -- odsuwamy go.
const mouseAway = async (view) => { await view.mouse.move(4, 600); await view.waitForTimeout(300); };
const selectLogo = (n = 0) => async (view) => {
  await view.locator("#grid .logoTile").nth(n).click();
  await view.waitForTimeout(300);
};

// Nowe, puste logo danego typu (jak tworzy je lista: wiersz od razu, edytor z id w adresie).
const EMPTY_TEXT = id("8300", 90);
const EMPTY_DRAW = id("8300", 91);
const EMPTY_IMAGE = id("8300", 92);
const emptyRows = () => Array.from({ length: 10 }, () => " ".repeat(30));
const ZERO_BITS = Buffer.alloc(Math.ceil((150 * 70) / 8)).toString("base64");
const EMPTY_NAMES = { pl: ["Nowe logo", "Nowy rysunek", "Nowy obraz"], en: ["New logo", "New drawing", "New image"], uk: ["Нове лого", "Новий малюнок", "Нове зображення"] };
function addEmptyLogos(db, lang = "pl") {
  const [nText, nDraw, nImage] = EMPTY_NAMES[lang] || EMPTY_NAMES.pl;
  const row = (logoId, name, type, payload) => ({ id: logoId, user_id: db.user.id, name, type, payload, created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z", is_demo: false, received_from_label: null, received_from_identity: null });
  db.tables.user_logos.push(
    row(EMPTY_TEXT, nText, "GLYPH_30x10", { layers: [{ color: "main", rows: emptyRows() }], source: { mode: "TEXT", text: "" } }),
    row(EMPTY_DRAW, nDraw, "PIX_150x70", { w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64: ZERO_BITS, source: { mode: "DRAW" } }),
    row(EMPTY_IMAGE, nImage, "PIX_150x70", { w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64: ZERO_BITS, source: { mode: "IMAGE" } }),
  );
}

// Plik .famlogo do okna importu: logo tekstowe z danych wypalonych prawdziwym edytorem.
const baked = require("../data/logos.baked.json");
function famlogo(lang) {
  const item = baked.find((x) => x.type === "GLYPH_30x10") || baked[0];
  return JSON.stringify({ type: item.type, name: item.names[lang] || item.names.pl, payload: item.payloads?.[lang] || item.payload });
}
const chooseImportFile = (content, name) => async (view, { lang }) => {
  await view.locator("#btnImport").click();
  await view.locator("#logoImportOverlay").waitFor({ state: "visible" });
  const body = typeof content === "function" ? content(lang) : content;
  await view.locator("#inpImportLogoFile").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(body) });
  await view.waitForTimeout(600);
};

// ---------- Społeczność ----------
const SUBMIT_DESC = { pl: "Dziesięć pytań na rodzinne spotkanie — od jedzenia po wakacje.", en: "Ten questions for a family get-together — from food to holidays.", uk: "Десять питань для родинної зустрічі — від їжі до відпустки." };
const MARKET_GAME = id("8b00", 1); // pierwsza gra PL z market_browse (demo.cjs)
function marketDetail(db, extra = {}) {
  const qs = db.tables.questions.filter((q) => q.game_id === IDS.game).sort((a, b) => a.ord - b.ord).slice(0, 6)
    .map((q) => ({ text: q.text, answers: db.tables.answers.filter((a) => a.question_id === q.id).sort((a, b) => a.ord - b.ord).map((a) => ({ text: a.text, fixed_points: a.fixed_points })) }));
  db.rpc.market_detail_extra = extra;
  db.rpc.market_detail_questions = qs;
  db.rpc.market_game_detail = `fn:(args, db) => {
    const all = [...db.rpc.market_browse, ...(db.rpc.market_my_submissions || [])];
    const g = all.find((x) => x.id === args.p_id);
    if (!g) return null;
    return { status: "published", origin: "community", author_username: "", description: "", avg_rating: 0, rating_count: 0, library_count: 0, ...g,
      slug: "gra-" + String(g.id).slice(-3), payload: { questions: db.rpc.market_detail_questions }, ...db.rpc.market_detail_extra };
  }`;
  db.rpc.market_game_raters = [];
  db.rpc.market_game_by_slug = null;
}

// ---------- Panel admina: odpowiedzi API Workera i RPC (bez prawdziwych danych osobowych) ----------
const T = (d, h = 12, m = 0) => new Date(Date.UTC(2026, 9, d, h, m)).toISOString();
function adminData(db) {
  const h = db.http;
  // Aktywność teraz (Prace techniczne i Statystyki): jedna gra w toku, edycja logo, kilka otwartych stron.
  const hours = [1, 0, 0, 0, 0, 0, 1, 2, 4, 5, 6, 5, 7, 8, 6, 9, 11, 12, 10, 8, 6, 4, 3, 2];
  h["/_admin_api/activity*"] = { ok: true, generated_at: T(21, 10, 15),
    history: {
      hour: [...hours, ...hours].map((users, i) => ({ bucket: new Date(Date.UTC(2026, 9, 19, 10 + i)).toISOString(), users })),
      day: Array.from({ length: 30 }, (_, i) => ({ bucket: new Date(Date.UTC(2026, 8, 22 + i)).toISOString(), users: 18 + ((i * 7) % 13) + (i % 7 === 5 ? 12 : 0) })),
      week: Array.from({ length: 13 }, (_, i) => ({ bucket: new Date(Date.UTC(2026, 6, 20 + i * 7)).toISOString(), users: 60 + i * 6 + (i % 3) * 5 })),
    },
    games: [{ game_id: IDS.game, name: "Rodzinny pojedynek", username: "ania.k", user_id: "u1", status: "playing", step: "r_round", phase: "PLAY", control_version: 2, operator_online: true, devices: ["display", "host", "buzzer"], session_seen_at: T(21, 10, 14) }],
    pages: [["u2", "Wujek_Staszek", "logo"], ["u3", "quizmaster", "games"], ["u4", "ola", "polls"]].map(([user_id, username, page]) => ({ user_id, username, page, visible: true, last_seen_at: T(21, 10, 13) })),
    locks: [{ holder_user_id: "u2", username: "Wujek_Staszek", holder_context: "logo-editor", resource_type: "logo", resource_name: "Gala 2026", heartbeat_at: T(21, 10, 14) }],
  };
  const growth = (total, a, b, c) => ({ total, new_today: a, new_7d: b, new_30d: c });
  h["/_admin_api/stats/overview"] = { ok: true, stats: {
    users: { ...growth(1284, 7, 61, 214), langs: { pl: 1012, en: 168, uk: 104 } },
    games: { ...growth(3920, 18, 140, 511), ready: 2615, avg_q: 10.4 },
    custom_settings: { total: 842 },
    gameplay: { played_today: 9, played_7d: 74, played_30d: 296, finished_30d: 231, abandoned_30d: 52, in_progress: 3, errors_30d: 4, legacy_total: 118 },
    bases: growth(611, 2, 19, 70), logos: growth(1470, 5, 38, 133),
    ratings: { average: 4.8, total: 126, new_today: 1, new_7d: 6, new_30d: 21 },
    health: { mail_errors: 2 }, timestamp: T(21, 9, 40),
  } };
  h["/_admin_api/stats/polls"] = { ok: true, stats: {
    games: { total: 1210, text: 430, points: 780, active: 64, active_with_votes: 51 },
    responses: { total: 18240, last_7d: 1312, voters: 5120 },
    sharing: { polls: 388, tasks: 2210, completed_tasks: 1604 },
    subscriptions: { total: 940, active: 802, pending: 96, declined: 31, cancelled: 11 },
  } };
  h["/_admin_api/stats/retention"] = { ok: true, stats: {
    funnel: { registered: 1284, game_created: 702, game_played: 341, never_active: 318 },
    retention: { d7: { cohort: 212, returned: 74 }, d30: { cohort: 560, returned: 121 } },
    segments: { active_7d: 288, active_8_30d: 241, dormant: 437, never: 318 },
    trend_users: Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return { day: d.toISOString().slice(0, 10), count: [5, 8, 4, 9, 12, 7, 6, 10, 14, 9, 8, 11, 13, 7][i] }; }),
  } };
  h["/_admin_api/stats/excluded"] = { ok: true, rows: [
    { user_id: id("8e90", 1), username: "tester_pl", email: "tester@example.test", automatic: true, reason: "test_account" },
    { user_id: id("8e90", 2), username: "gosc_demo", email: "", automatic: true, reason: "test_guest" },
    { user_id: id("8e90", 3), username: "wlasciciel", email: "owner@example.test", automatic: false },
  ] };
  h["/_admin_api/ratings"] = { ok: true, rows: [
    ["ania.k", 5, "Świetna zabawa na rodzinnych spotkaniach!", 20], ["Wujek_Staszek", 5, "Gramy co niedzielę.", 19], ["quizmaster", 4, "Brakuje mi trybu drużynowego na czas.", 17],
    ["ola", 5, "", 15], ["kuba2009", 3, "Na telefonie wolałbym większe przyciski.", 12], ["teacher_ewa", 5, "Uczniowie zachwyceni.", 9],
  ].map(([username, stars, comment, d]) => ({ username, stars, comment, created_at: T(d, 18) })) };
  h["/_admin_api/marketplace/producer-ratings"] = { ok: true, rows: [
    { id: id("8b00", 1), title: "Familiada świąteczna", lang: "pl", avg_rating: 4.8, rating_count: 56, library_count: 184 },
    { id: id("8b00", 3), title: "Szkolne wspomnienia", lang: "pl", avg_rating: 4.4, rating_count: 23, library_count: 97 },
    { id: id("8b00", 101), title: "Christmas Family Feud", lang: "en", avg_rating: 4.6, rating_count: 31, library_count: 120 },
    { id: id("8b00", 201), title: "Різдвяна Фамільяда", lang: "uk", avg_rating: 0, rating_count: 0, library_count: 12 },
  ] };
  h["/_admin_api/marketplace/game-raters*"] = { ok: true, rows: [["ania.k", 5, 20], ["Wujek_Staszek", 5, 18], ["quizmaster", 4, 15], ["ola", 4, 11], ["kuba2009", 3, 6]].map(([username, stars, d]) => ({ username, stars, rated_at: T(d, 20) })) };
  h["/_admin_api/mail/settings"] = { ok: true, settings: { delay_ms: 250, batch_max: 100, worker_limit: 25, email_greeting: "witaj", email_farewell: "team" },
    providers: [{ name: "brevo", label: "Brevo", is_active: true }, { name: "mailgun", label: "Mailgun", is_active: true }, { name: "sendgrid", label: "SendGrid", is_active: false }], cron: null };
  h["/_admin_api/mail/queue*"] = { ok: true, rows: [
    { id: "q1", to_email: "anna@example.test", subject: "Zaproszenie do ankiety „Weekendowy wyjazd”", status: "pending", attempts: 0 },
    { id: "q2", to_email: "piotr@example.test", subject: "Nowa kopia gry od Jan Kowalski", status: "sent", attempts: 1 },
    { id: "q3", to_email: "kasia@example.test", subject: "Przypomnienie o ankiecie", status: "failed", attempts: 3, last_error: "mailbox full" },
  ] };
  h["/_admin_api/mail/logs*"] = { ok: true, total: 5, pages: 1, page: 1, rows: [
    ["send-mail", "info", "queue_item_sent", "piotr@example.test", 9], ["send-mail", "info", "provider_success", "piotr@example.test", 9],
    ["send-mail", "error", "queue_item_failed", "kasia@example.test", 8], ["poll-reminder", "info", "email_skipped", "ola@example.test", 7], ["send-mail", "warn", "provider_retry", "kasia@example.test", 7],
  ].map(([function_name, level, event, recipient_email, hh]) => ({ function_name, level, event, recipient_email, provider: event === "email_skipped" ? "skipped_suppression" : "brevo", created_at: T(21, hh, 12) })) };
  const msg = (n, direction, from_email, to_email, subject, body, d, extra = {}) => ({ id: `msg${n}`, direction, from_email, to_email, subject, body, created_at: T(d, 10 + n), is_read: n > 2, source: "email", ...extra });
  const msgs = [
    msg(1, "inbound", "anna@example.test", "kontakt@familiada.online", "Jak dodać własne logo do gry?", "Dzień dobry, przygotowałam logo w edytorze, ale nie widzę go w ustawieniach gry. Co robię źle?", 21),
    msg(2, "inbound", "piotr@example.test", "kontakt@familiada.online", "Zgłoszenie: Wyświetlacz nie łączy się", "Po zeskanowaniu kodu telewizor pokazuje pusty ekran.", 20, { ticket_number: "FAM-1042", report_id: "r1" }),
    msg(3, "outbound", "kontakt@familiada.online", "piotr@example.test", "Re: Zgłoszenie: Wyświetlacz nie łączy się", "Dziękujemy za zgłoszenie — prosimy odświeżyć stronę Wyświetlacza.", 20, { ticket_number: "FAM-1042", report_id: "r1" }),
    msg(4, "inbound", "szkola@example.test", "kontakt@familiada.online", "Licencja dla szkoły", "Czy możemy używać Familiady na lekcjach wychowawczych?", 18),
  ];
  h["/_admin_api/messages?filter=inbox*"] = { ok: true, rows: msgs.filter((m) => m.direction === "inbound") };
  h["/_admin_api/messages?filter=all*"] = { ok: true, rows: msgs };
  h["/_admin_api/messages?filter=sent*"] = { ok: true, rows: msgs.filter((m) => m.direction === "outbound") };
  h["/_admin_api/messages/detail*"] = { ok: true, message: msgs[0] };
  h["/_admin_api/messages/read*"] = { ok: true };
  h["/_admin_api/attachments?*"] = { ok: true, attachments: [] };
  const market = (n, title, author, status, d, extra = {}) => ({ id: `mk${n}`, title, lang: "pl", status, origin: "user", author_username: author, created_at: T(d, 18), library_count: status === "published" ? 20 + n * 7 : 0, ...extra });
  h["/_admin_api/marketplace/list?status=pending*"] = { ok: true, rows: [market(1, "Rodzinny quiz", "ania.k", "pending", 20), market(2, "Wieczór filmowy", "quizmaster", "pending", 19), market(3, "Szkolna Familiada", "teacher_ewa", "pending", 19), market(4, "Kuchnia świata", "ola", "pending", 18)] };
  h["/_admin_api/marketplace/list?status=published*"] = { ok: true, rows: [market(5, "Familiada weselna", "dj_marek", "published", 12), market(6, "Biuro od kuchni", "hr_magda", "published", 9), market(7, "Wakacje nad morzem", "tomek_quiz", "published", 4)] };
  h["/_admin_api/marketplace/detail*"] = { ok: true, game: { ...market(1, "Rodzinny quiz", "ania.k", "pending", 20), description: "Dziesięć pytań na rodzinne spotkanie — od jedzenia po wakacje.",
    payload: { questions: db.tables.questions.filter((q) => q.game_id === IDS.game).sort((a, b) => a.ord - b.ord).slice(0, 5).map((q) => ({ text: q.text, answers: db.tables.answers.filter((a) => a.question_id === q.id).sort((a, b) => a.ord - b.ord).map((a) => ({ text: a.text, fixed_points: a.fixed_points })) })) } } };
  const aiProviders = [
    { name: "gemini", label: "Gemini", priority: 0, is_active: true, cooldown_until: null },
    { name: "groq", label: "Groq", priority: 1, is_active: true, cooldown_until: new Date(Date.now() + (2 * 60 + 37) * 60e3).toISOString() },
    { name: "mistral", label: "Mistral", priority: 2, is_active: false, cooldown_until: null },
  ];
  const contacts = [
    ["Szkoła Podstawowa nr 12", "sekretariat@sp12.example.test", "https://sp12.example.test", false, 20],
    ["Dom Kultury „Zorza”", "biuro@zorza.example.test", "https://zorza.example.test", true, 18],
    ["Biuro podróży Słoneczko", "kontakt@sloneczko.example.test", "https://sloneczko.example.test", false, 15],
    ["Klub seniora „Pogodna Jesień”", "klub@pogodna.example.test", "https://pogodna.example.test", false, 11],
    ["Agencja eventowa Fiesta", "hello@fiesta.example.test", "https://fiesta.example.test", true, 6],
  ].map(([title, email, url, is_used, d], i) => ({ id: i + 1, title, email, url, is_used, added_at: T(d, 9), created_at: T(d, 9) }));
  h["/_admin_api/marketing/ai-providers"] = { ok: true, rows: aiProviders };
  h["/_admin_api/marketing/logs"] = { ok: true, rows: [] };
  h["/_admin_api/marketing/contacts?*"] = { ok: true, rows: contacts, total: contacts.length };
}

module.exports = [
  // ================= Biblioteka logo =================
  { id: "logos-market-logos-empty", category: CAT, title: "Biblioteka logo — pusta lista (tekst)", path: "/logos/", sources: LIST, ready: ".logoShell.skel-step-ready",
    db: (db) => { db.tables.user_logos = []; } },
  { id: "logos-market-logos-empty-draw", category: CAT, title: "Biblioteka logo — pusta lista (rysunek)", path: "/logos/", sources: LIST, ready: ".logoShell.skel-step-ready",
    db: (db) => { db.tables.user_logos = []; }, steps: [click("#tabLogoDraw")] },
  { id: "logos-market-logos-selected", category: CAT, title: "Biblioteka logo — zaznaczone logo (aktywne przyciski)", path: "/logos/", sources: LIST, ready: ".logoTile", steps: [selectLogo(1)] },
  { id: "logos-market-logos-received", category: CAT, title: "Biblioteka logo — otrzymane kopie jako kafle propozycji zaraz po kaflu tworzenia (podgląd, ✓/✕ w rogu), liczniki w linii na wypustkach", path: "/logos/", sources: [...LIST, "web/shared/js/core/resource-copy-inbox.js", "web/shared/js/core/proposed-tile.js"], ready: '.logoTile[data-proposed] .logoPrev canvas',
    db: (db, lang) => {
      const from = require("../data/panel.cjs")[lang].friends.accepted;
      const text = db.tables.user_logos.filter((l) => l.type === "GLYPH_30x10");
      const rows = [
        { ...text[0], id: id("8f41", 1), name: { pl: "Turniej klasowy", en: "Class tournament", uk: "Класний турнір" }[lang], received_from_label: from[0][0], created_at: "2026-10-21T08:00:00Z", updated_at: "2026-10-21T08:00:00Z" },
        { ...text[1 % text.length], id: id("8f41", 2), name: { pl: "Gala 2026", en: "Gala 2026", uk: "Гала 2026" }[lang], received_from_label: from[1][0], created_at: "2026-10-20T08:00:00Z", updated_at: "2026-10-20T08:00:00Z" },
      ];
      db.tables.user_logos.push(...rows);
      db.rpc.resource_copy_inbox = { ok: true, items: rows.map((l, i) => ({ id: id("8f30", i + 1), name: l.name, sender_label: l.received_from_label, variant: "GLYPH_30x10", logo_mode: "TEXT", resource_kind: "logo", logo_id: l.id, created_at: l.created_at })) };
      db.rpc.resource_copy_badges = { ok: true, items: [{ kind: "logo", variant: "GLYPH_30x10", mode: "TEXT", count: 2 }, { kind: "logo", variant: "PIX_150x70", mode: "DRAW", count: 1 }, { kind: "game", variant: "prepared", count: 3 }] };
    } },
  { id: "logos-market-logos-import", category: CAT, title: "Biblioteka logo — okno importu (bez pliku)", path: "/logos/", sources: LIST, ready: ".logoTile", steps: [openModal("#btnImport", "#logoImportOverlay")] },
  { id: "logos-market-logos-import-file", category: CAT, title: "Biblioteka logo — okno importu z podglądem wybranego pliku", path: "/logos/", sources: LIST, ready: ".logoTile",
    steps: [chooseImportFile(famlogo, "turniej.famlogo"), async (view) => { await view.locator("#logoImportPreviewWrap").waitFor({ state: "visible" }); }] },
  { id: "logos-market-logos-import-error", category: CAT, title: "Biblioteka logo — okno importu, błędny plik", path: "/logos/", sources: LIST, ready: ".logoTile",
    steps: [chooseImportFile("{ to nie jest logo", "zepsute.famlogo"), async (view) => { await view.locator("#logoImportErr").waitFor({ state: "visible" }); }] },
  { id: "logos-market-logos-import-done", category: CAT, title: "Biblioteka logo — import zakończony", path: "/logos/", sources: LIST, ready: ".logoTile",
    steps: [chooseImportFile(famlogo, "turniej.famlogo"), async (view) => { await view.locator("#btnLogoImportConfirm").click(); await view.locator("#btnLogoImportDone").waitFor({ state: "visible" }); await view.waitForTimeout(300); }] },
  { id: "logos-market-logos-preview", category: CAT, title: "Biblioteka logo — podgląd logo na wyświetlaczu", path: "/logos/", sources: [...LIST, "web/logos/js/render.js"], ready: ".logoTile",
    steps: [selectLogo(0), openModal("#btnPreview", "#previewOverlay"), wait(400)] },
  { id: "logos-market-logos-preview-draw", category: CAT, title: "Biblioteka logo — podgląd logo rysunkowego", path: "/logos/", sources: [...LIST, "web/logos/js/render.js"], ready: ".logoTile",
    steps: [click("#tabLogoDraw"), selectLogo(0), openModal("#btnPreview", "#previewOverlay"), wait(400)] },
  { id: "logos-market-logos-rename", category: CAT, title: "Biblioteka logo — zmiana nazwy (dwuklik)", path: "/logos/", sources: [...LIST, "web/shared/js/core/rename-gesture.js", "web/shared/js/core/modal.js"], ready: ".logoTile",
    steps: [async (view, { device }) => {
      const tile = view.locator("#grid .logoTile").first();
      if (device === "phone") { await tile.tap(); await tile.tap(); } else await tile.dblclick();
      await view.locator(".uni-modal").first().waitFor({ state: "visible" });
      await view.waitForTimeout(300);
    }] },
  { id: "logos-market-logos-delete", category: CAT, title: "Biblioteka logo — potwierdzenie usunięcia", path: "/logos/", sources: [...LIST, "web/shared/js/core/modal.js"], ready: ".logoTile",
    steps: [openModal("#grid .logoTile .logoX", ".uni-modal")] },
  { id: "logos-market-logos-send", category: CAT, title: "Biblioteka logo — wysyłanie kopii znajomemu (wybrany znajomy, wcześniejsze wysyłki)", path: "/logos/", sources: [...LIST, "web/shared/js/core/resource-send.js", "web/shared/js/core/share-sections.js"], ready: ".logoTile",
    db: (db) => { const f = db.rpc.friends_list; db.rpc.resource_copy_history = { ok: true, items: [{ recipient_label: f[0].label, sent_at: "2026-10-18T17:40:00Z" }, { recipient_label: f[2].label, sent_at: "2026-10-12T09:15:00Z" }] }; },
    steps: [selectLogo(0), async (view) => {
      await view.locator("#btnSendCopy").click();
      await view.locator("#resourceSendOverlay").waitFor({ state: "visible" });
      await view.locator("#resourceSendOverlay .resource-send-friends input[type=checkbox]").nth(1).check({ force: true });
      await view.waitForTimeout(500);
    }] },
  { id: "logos-market-logos-export", category: CAT, title: "Biblioteka logo — eksport do pliku (okno postępu)", path: "/logos/", sources: [...LIST, "web/shared/js/core/modal.js"], ready: ".logoTile",
    steps: [selectLogo(0), openModal("#btnExport", ".uni-modal"), wait(500)] },

  // ================= Edytor logo — tekst =================
  { id: "logos-market-text-empty", category: CAT, title: "Edytor logo — tekst, nowe puste logo", path: `/logos/editor/text/?id=${EMPTY_TEXT}`, sources: TEXT_ED, ready: "#logoName:not([disabled])", devices: EDITOR_DEVICES, db: addEmptyLogos },
  { id: "logos-market-text-too-wide", category: CAT, title: "Edytor logo — tekst za szeroki (błąd szerokości)", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: TEXT_ED, ready: "#logoName:not([disabled])", devices: EDITOR_DEVICES,
    steps: [async (view) => { await view.locator("#textValue").fill("WIELKI FINAŁ FAMILIADY 2026"); await view.locator("#textWarn").waitFor({ state: "visible" }); await view.waitForTimeout(300); }] },
  { id: "logos-market-text-chars", category: CAT, title: "Edytor logo — tekst, lista dozwolonych znaków", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: TEXT_ED, ready: "#logoName:not([disabled])", devices: EDITOR_DEVICES,
    steps: [click("#btnCharsToggle", 500)] },
  { id: "logos-market-text-preview", category: CAT, title: "Edytor logo — tekst, podgląd na pełnym ekranie", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: TEXT_ED, ready: "#logoName:not([disabled])", devices: EDITOR_DEVICES,
    steps: [openModal("#bigPreview", "#previewOverlay"), wait(400)] },
  { id: "logos-market-editor-phone", category: CAT, title: "Edytor logo na telefonie — blokada urządzenia", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: [...TEXT_ED, "web/shared/js/core/device-guard.js"], ready: () => true, devices: ["phone"], settle: 1500 },
  { id: "logos-market-editor-busy", category: CAT, title: "Edytor logo — logo edytowane w innej karcie (blokada)", path: `/logos/editor/text/?id=${IDS.logoText}`, sources: [...TEXT_ED, "web/shared/js/core/resource-lock.js"], ready: () => true, devices: EDITOR_DEVICES, settle: 1500,
    db: (db) => { db.rpc.acquire_edit_locks = { ok: false, error: "locked", blocker_type: "logo", blocker_context: "logo-editor", resource: { type: "logo", id: IDS.logoText } }; } },

  // ================= Edytor logo — rysunek =================
  { id: "logos-market-draw-empty", category: CAT, title: "Edytor rysunku — nowe puste logo", path: `/logos/editor/draw/?id=${EMPTY_DRAW}`, sources: DRAW_ED, ready: () => !!window.__drawFabric, devices: EDITOR_DEVICES, settle: 1000, db: addEmptyLogos },
  { id: "logos-market-draw-selected", category: CAT, title: "Edytor rysunku — zaznaczony obiekt (ustawienia obiektu)", path: `/logos/editor/draw/?id=${IDS.logoDraw}`, sources: DRAW_ED, ready: () => window.__drawFabric?.getObjects().length > 0, devices: EDITOR_DEVICES, settle: 800,
    steps: [async (view) => { await view.evaluate(() => { const c = window.__drawFabric; const o = c.getObjects().find((x) => x.selectable !== false && x.type !== "image") || c.getObjects()[0]; c.setActiveObject(o); c.requestRenderAll(); c.fire("selection:created", { selected: [o] }); }); await view.waitForTimeout(500); }] },
  { id: "logos-market-draw-brush", category: CAT, title: "Edytor rysunku — pędzel (ustawienia narzędzia)", path: `/logos/editor/draw/?id=${IDS.logoDraw}`, sources: DRAW_ED, ready: () => window.__drawFabric?.getObjects().length > 0, devices: EDITOR_DEVICES, settle: 800,
    steps: [click("#tBrush", 500), mouseAway] },
  { id: "logos-market-draw-shapes", category: CAT, title: "Edytor rysunku — kształty (lista kształtów)", path: `/logos/editor/draw/?id=${IDS.logoDraw}`, sources: DRAW_ED, ready: () => window.__drawFabric?.getObjects().length > 0, devices: EDITOR_DEVICES, settle: 800,
    steps: [click("#tShapes", 500), click("#toolCtxSettings button", 400), async (view) => { await view.locator("#shapePickerPop:not([hidden])").waitFor({ timeout: 3000 }).catch(() => {}); }, mouseAway] },
  { id: "logos-market-draw-text", category: CAT, title: "Edytor rysunku — narzędzie tekstu (wybór czcionki)", path: `/logos/editor/draw/?id=${IDS.logoDraw}`, sources: DRAW_ED, ready: () => window.__drawFabric?.getObjects().length > 0, devices: EDITOR_DEVICES, settle: 800,
    steps: [click("#tText", 500), click("#toolCtxSettings button", 400), async (view) => { await view.locator("#drawFontPickPop:not([hidden])").waitFor({ timeout: 3000 }); await view.locator("#drawFontPickPop").hover(); await view.waitForTimeout(800); }] },
  { id: "logos-market-draw-bg", category: CAT, title: "Edytor rysunku — tło sceny przełączone na białe", path: `/logos/editor/draw/?id=${IDS.logoDraw}`, sources: DRAW_ED, ready: () => window.__drawFabric?.getObjects().length > 0, devices: EDITOR_DEVICES, settle: 800,
    steps: [click("#tBg", 500), mouseAway] },
  { id: "logos-market-draw-preview", category: CAT, title: "Edytor rysunku — podgląd na wyświetlaczu", path: `/logos/editor/draw/?id=${IDS.logoDraw}`, sources: DRAW_ED, ready: () => window.__drawFabric?.getObjects().length > 0, devices: EDITOR_DEVICES, settle: 800,
    steps: [openModal("#tEye", "#previewOverlay"), wait(400)] },

  // ================= Edytor logo — obraz =================
  { id: "logos-market-image-empty", category: CAT, title: "Edytor obrazu — nowe logo bez obrazu", path: `/logos/editor/image/?id=${EMPTY_IMAGE}`, sources: IMAGE_ED, ready: "#logoName:not([disabled])", devices: EDITOR_DEVICES, settle: 800, db: addEmptyLogos },
  { id: "logos-market-image-preview", category: CAT, title: "Edytor obrazu — podgląd na pełnym ekranie", path: `/logos/editor/image/?id=${id("8300", 47)}`, sources: IMAGE_ED, ready: "#logoName:not([disabled])", devices: EDITOR_DEVICES, settle: 1500,
    steps: [wait(1000), openModal("#imgBigPreview", "#previewOverlay"), wait(400)] },

  // ================= Społeczność =================
  { id: "logos-market-market-search-empty", category: CAT, title: "Społeczność — wyszukiwanie bez wyników", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db) => { db.rpc.market_browse_rows = db.rpc.market_browse; db.rpc.market_browse = `fn:(args, db) => db.rpc.market_browse_rows.filter((g) => !args.p_search || (g.title + " " + g.description).toLowerCase().includes(args.p_search.toLowerCase()))`; },
    steps: [async (view, { device }) => {
      const input = view.locator("#searchInput");
      if (await input.isVisible()) await input.fill("zzzz");
      else {
        // telefon: pole w oknie wyszukiwania (list-search), zatwierdzenie OK
        await view.locator("#btnSearchFocus").click();
        await view.locator(".uni-modal .uni-inp").fill("zzzz");
        await view.locator(".uni-modal .uni-inp").press("Enter");
      }
      await view.locator(".mkt-empty").waitFor({ state: "visible" });
      await view.waitForTimeout(300);
    }] },
  { id: "logos-market-market-filter", category: CAT, title: "Społeczność — filtr języka (lista otwarta)", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    steps: [click("#langFilter .ui-select-btn, #langFilter", 900)] },
  { id: "logos-market-market-detail", category: CAT, title: "Społeczność — szczegóły gry z oceną", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db) => marketDetail(db, { user_stars: 4 }),
    steps: [async (view) => { await view.locator(".mkt-card").first().click(); await view.locator("#gameDetailOverlay[data-detail-state=ready]").waitFor(); await view.waitForTimeout(400); }] },
  { id: "logos-market-market-detail-own", category: CAT, title: "Społeczność — podgląd własnej gry (lista oceniających)", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db, lang) => { marketDetail(db, { author_username: db.user.user_metadata.username, description: SUBMIT_DESC[lang] || SUBMIT_DESC.pl, in_library: true }); db.rpc.market_game_raters = [["ania.k", 5], ["Wujek_Staszek", 4], ["quizmaster", 5], ["ola", 3]].map(([username, stars]) => ({ username, stars })); },
    steps: [openModal("#btnMySent", "#mySentOverlay"), wait(600), async (view) => { await view.locator("#mySentList [data-preview]").first().click(); await view.locator("#gameDetailOverlay[data-detail-state=ready]").waitFor(); await view.locator("#detailRaters:not([hidden])").waitFor(); await view.waitForTimeout(400); }] },
  { id: "logos-market-market-my-sent-all", category: CAT, title: "Społeczność — Moje wysłane: wszystkie statusy zgłoszeń", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db) => { db.rpc.market_my_submissions = [...db.rpc.market_my_submissions, { id: id("8b80", 4), title: "Sylwester 2025", lang: "pl", status: "withdrawn", library_count: 17, avg_rating: 4.1, rating_count: 6 }]; },
    steps: [openModal("#btnMySent", "#mySentOverlay")] },
  { id: "logos-market-market-my-sent-empty", category: CAT, title: "Społeczność — Moje wysłane: brak zgłoszeń", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db) => { db.rpc.market_my_submissions = []; }, steps: [openModal("#btnMySent", "#mySentOverlay")] },
  { id: "logos-market-market-withdraw", category: CAT, title: "Społeczność — potwierdzenie wycofania gry", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    steps: [openModal("#btnMySent", "#mySentOverlay"), wait(600), openModal("#mySentList [data-withdraw]", ".uni-modal")] },
  { id: "logos-market-market-submit", category: CAT, title: "Społeczność — zgłoszenie nowej gry (formularz)", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    steps: [openModal("#btnMySent", "#mySentOverlay"), wait(600), openModal("#btnSubmitNew", "#submitOverlay"), async (view, { lang }) => {
      await view.locator("#submitGameSelect .ui-select-btn, #submitGameSelect").first().click();
      await view.waitForTimeout(300);
      await view.locator("#submitGameSelect [role=option], #submitGameSelect .ui-select-option").first().click().catch(() => {});
      await view.locator("#submitTitle").fill(require("../data/panel.cjs")[lang].game);
      await view.locator("#submitDesc").fill(SUBMIT_DESC[lang] || SUBMIT_DESC.pl);
      await view.locator("#submitConfirm").check().catch(() => {});
      await view.waitForTimeout(300);
    }] },
  { id: "logos-market-market-submit-none", category: CAT, title: "Społeczność — zgłoszenie: brak gier gotowych do wysłania", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db) => { db.tables.games = []; },
    steps: [openModal("#btnMySent", "#mySentOverlay"), wait(600), openModal("#btnSubmitNew", "#submitOverlay")] },
  { id: "logos-market-market-guest", guest: true, category: CAT, title: "Społeczność — odwiedzający bez konta", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db) => { db.rpc.market_browse = db.rpc.market_browse.map((g) => ({ ...g, in_library: false })); } },
  { id: "logos-market-market-guest-detail", guest: true, category: CAT, title: "Społeczność — szczegóły gry bez konta (bez oceniania)", path: "/marketplace/", sources: MARKET, ready: ".mkt-card",
    db: (db) => { db.rpc.market_browse = db.rpc.market_browse.map((g) => ({ ...g, in_library: false })); marketDetail(db); },
    steps: [async (view) => { await view.locator(".mkt-card").nth(1).click(); await view.locator("#gameDetailOverlay[data-detail-state=ready]").waitFor(); await view.waitForTimeout(500); }] },

  // ================= Panel admina =================
  // Istniejące: admin-stats-snake, admin-badges, admin-market-pending.
  { id: "logos-market-admin-maintenance", category: CAT, title: "Panel admina — Prace techniczne (przerwa wyłączona)", path: "/settings/", sources: ADMIN, ready: "#panelStatus", db: adminData, settle: 800 },
  { id: "logos-market-admin-maintenance-on", category: CAT, title: "Panel admina — Prace techniczne (przerwa włączona, odliczanie)", path: "/settings/", sources: ADMIN, ready: "#panelStatus", settle: 800,
    db: (db) => { adminData(db); db.http["/_admin_api/state"] = { enabled: true, mode: "countdown", returnAt: "2026-10-21T18:30:00Z", endAt: "2026-10-21T18:30:00Z", message: "" }; } },
  { id: "logos-market-admin-maintenance-preview", category: CAT, title: "Panel admina — podgląd strony przerwy technicznej", path: "/settings/", sources: ADMIN, ready: "#panelStatus", db: adminData, settle: 800,
    steps: [wait(600), openModal("#btnMaintenancePreview", "#maintenancePreviewOverlay"), wait(600)] },
  { id: "logos-market-admin-stats", category: CAT, title: "Panel admina — Statystyki (przegląd i retencja)", path: "/settings/?tab=stats", sources: ADMIN, ready: () => /\d/.test(document.getElementById("statUsersTotal")?.textContent || ""), db: adminData, settle: 1000 },
  { id: "logos-market-admin-ratings", category: CAT, title: "Panel admina — Oceny (aplikacji i gier producenta)", path: "/settings/?tab=ratings", sources: ADMIN, ready: "#producerRatingsBody [data-raters-id]", db: adminData, settle: 1000 },
  { id: "logos-market-admin-ratings-raters", category: CAT, title: "Panel admina — Oceny: okno oceniających grę producenta", path: "/settings/?tab=ratings", sources: ADMIN, ready: "#producerRatingsBody [data-raters-id]", db: adminData, settle: 600,
    steps: [async (view) => { await view.locator("#producerRatingsBody [data-raters-id]").first().click(); await view.locator("#ratersOverlay table").waitFor(); await view.waitForTimeout(300); }] },
  { id: "logos-market-admin-mail", category: CAT, title: "Panel admina — Ustawienia maili (dostawcy, kolejka, logi)", path: "/settings/?tab=mail", sources: ADMIN, ready: "#mailPanel .provider-order-row", db: adminData, settle: 1000 },
  { id: "logos-market-admin-reports", category: CAT, title: "Panel admina — Poczta Familiada (skrzynka)", path: "/settings/?tab=reports", sources: ADMIN, ready: ".mail-thread-item", db: adminData, settle: 1000 },
  { id: "logos-market-admin-reports-message", category: CAT, title: "Panel admina — Poczta Familiada, otwarta wiadomość", path: "/settings/?tab=reports", sources: ADMIN, ready: ".mail-thread-item", db: adminData, settle: 800,
    steps: [async (view) => { await view.locator(".mail-thread-item").first().click(); await view.waitForTimeout(1200); }] },
  { id: "logos-market-admin-market-preview", category: CAT, title: "Panel admina — Gry Społeczności, podgląd zgłoszenia", path: "/settings/?tab=marketplace", sources: ADMIN, ready: "[data-market-preview]", db: adminData, settle: 600,
    steps: [openModal("[data-market-preview]", "#marketPreviewOverlay")] },
  { id: "logos-market-admin-market-reject", category: CAT, title: "Panel admina — Gry Społeczności, odrzucenie z powodem", path: "/settings/?tab=marketplace", sources: ADMIN, ready: "[data-market-reject]", db: adminData, settle: 600,
    steps: [openModal("[data-market-reject]", "#marketRejectOverlay"), async (view) => { const f = view.locator("#marketRejectOverlay textarea, #marketRejectOverlay input[type=text]").first(); if (await f.count()) await f.fill("Za mało pytań w finale i powtórzone odpowiedzi."); await view.waitForTimeout(200); }] },
  { id: "logos-market-admin-market-published", category: CAT, title: "Panel admina — Gry Społeczności, opublikowane", path: "/settings/?tab=marketplace", sources: ADMIN, ready: "[data-market-preview]", db: adminData, settle: 600,
    steps: [click("#mktTabPublished", 800)] },
  { id: "logos-market-admin-marketing", category: CAT, title: "Panel admina — Marketing", path: "/settings/?tab=marketing", sources: ADMIN, ready: "#marketingPanel", db: adminData, settle: 1000 },
  // Panel kontaktów ładuje dane dopiero przy zmianie atrybutu hidden (MutationObserver), więc krok przełącza zakładkę przyciskiem.
  { id: "logos-market-admin-contacts", category: CAT, title: "Panel admina — Kontakty Marketingowe", path: "/settings/", sources: ADMIN, ready: "#panelStatus", db: adminData, settle: 800,
    steps: [async (view) => { await view.evaluate(() => document.getElementById("btnTabMarketingContacts").click()); await view.waitForFunction(() => document.querySelectorAll("#mcTableBody tr").length > 1); await view.waitForTimeout(600); }] },
  // Funkcja Edge generate-game idzie przez Worker (/_admin_api/generator/<akcja>):
  // lista gier producenta z danych sceny, pozostałe akcje zwracają { ok: true }.
  { id: "logos-market-admin-generator", category: CAT, title: "Panel admina — Gry Producenta (wczytane gry producenta)", path: "/settings/?tab=generator", sources: ADMIN, ready: "#generatorPanel", devices: ["desktop"], settle: 800,
    db: (db, lang) => {
      adminData(db);
      const p = require("../data/panel.cjs")[lang];
      const market = require("../data/content.cjs")[lang].market.filter(([, , author]) => !author);
      db.http["/_admin_api/generator/*"] = { ok: true };
      db.http["/_admin_api/generator/list-producer-games"] = market.map(([title, description], i) => ({ id: `prod${i + 1}`, title, description, lang,
        payload: { questions: (i === 1 ? p.gameQuestions.slice(0, 6) : p.gameQuestions).map(([text, answers]) => ({ text, answers: answers.map(([a, pts]) => ({ text: a, fixed_points: pts })) })) } }));
    },
    steps: [async (view) => {
      await view.locator("#gen-load-btn").click();
      await view.locator("#gen-game-list .game-item").first().waitFor();
      await view.locator("#gen-game-list .game-item .game-chevron").first().click().catch(() => {});
      await view.waitForTimeout(400);
    }] },
];
