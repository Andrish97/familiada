// Gry ankietowe w stanie „otwarta” i „zamknięta” przez te same ścieżki co
// użytkownik: poll_open (Centrum ankiet) i import pliku .famgame z zamkniętą
// ankietą (game_import_package). Stanu gry ankietowej nie da się ustawić
// zapisem z przeglądarki (migracja 513, sondy G3 w tests/sql/abuse-probes.sql).

// Szkic z 10 pytaniami (po 3 odpowiedzi), potem otwarcie ankiety. -> id gry
async function seedOpenPoll(page, { type = "poll_text", name }) {
  return await page.evaluate(async ({ type, name }) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data: g, error } = await sb.from("games")
      .insert({ name, owner_id: u.user.id, type, status: "draft" })
      .select("id,share_key_poll").single();
    if (error) throw new Error("insert game: " + error.message);
    const { data: qs, error: qErr } = await sb.from("questions")
      .insert(Array.from({ length: 10 }, (_, i) => ({ game_id: g.id, ord: i + 1, text: `Pytanie ${i + 1}` })))
      .select("id");
    if (qErr) throw new Error("insert questions: " + qErr.message);
    if (type === "poll_points") {
      const { error: aErr } = await sb.from("answers")
        .insert(qs.flatMap((q) => [1, 2, 3].map((ord) => ({ question_id: q.id, ord, text: `Odp ${ord}`, fixed_points: 0 }))));
      if (aErr) throw new Error("insert answers: " + aErr.message);
    }
    const { error: oErr } = await sb.rpc("poll_open", { p_game_id: g.id, p_key: g.share_key_poll });
    if (oErr) throw new Error("poll_open: " + oErr.message);
    return g.id;
  }, { type, name });
}

// Import .famgame z zamkniętą ankietą: `questions` pytań, odpowiedzi z punktami
// `points` (każda ≥ 4, suma ≤ 100 -- inaczej import zostawia szkic).
// -> { id, questionIds, answerIds } (pierwsze pytanie / jego odpowiedzi wg ord)
async function importClosedPoll(page, { type = "poll_points", name, questions = 10, points = [42, 20, 10] }) {
  return await page.evaluate(async ({ type, name, questions, points }) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const payload = {
      format_version: 2,
      game: { name, type, state: "closed" },
      questions: Array.from({ length: questions }, (_, i) => ({
        text: `Pytanie ${i + 1}`,
        answers: points.map((p, j) => ({ text: `Odp ${i + 1}.${j + 1}`, fixed_points: p })),
      })),
    };
    const { data, error } = await sb.rpc("game_import_package", {
      p_payload: payload, p_owner_id: u.user.id, p_request_id: crypto.randomUUID(),
    });
    if (error) throw new Error("game_import_package: " + error.message);
    if (!data?.ok || data.state !== "closed") throw new Error("import nie zamknął ankiety: " + JSON.stringify(data));
    const { data: qs, error: qErr } = await sb.from("questions")
      .select("id,ord,answers(id,ord)").eq("game_id", data.id).order("ord");
    if (qErr) throw new Error("questions: " + qErr.message);
    const first = (qs[0]?.answers || []).slice().sort((a, b) => a.ord - b.ord);
    return { id: data.id, questionIds: qs.map((q) => q.id), answerIds: first.map((a) => a.id) };
  }, { type, name, questions, points });
}

module.exports = { seedOpenPoll, importClosedPoll };
