// Trwałe, idempotentne dane dla dedykowanego konta galerii E20.
// Nie usuwamy ich po przebiegu: następne zrzuty mają korzystać z tych samych
// rekordów i tych samych adresów. Każda nazwa jest ograniczona do test17.
async function seedE20GalleryFixtures(page) {
  return page.evaluate(async () => {
    const db = window.__sbClient;
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth?.user?.id) throw new Error(authError?.message || "Konto galerii nie jest zalogowane");
    const ownerId = auth.user.id;

    async function oneOrCreate(table, ownerColumn, name, row, selection = "id") {
      const { data: existing, error: readError } = await db.from(table).select(selection)
        .eq(ownerColumn, ownerId).eq("name", name).maybeSingle();
      if (readError) throw readError;
      if (existing) return existing;
      const { data, error } = await db.from(table).insert({ ...row, [ownerColumn]: ownerId, name })
        .select(selection).single();
      if (error) throw error;
      return data;
    }

    async function ensureQuestions(game, withAnswers) {
      const { data: existing, error: readError } = await db.from("questions").select("id,ord")
        .eq("game_id", game.id).order("ord", { ascending: true });
      if (readError) throw readError;
      const byOrd = new Map((existing || []).map((question) => [question.ord, question]));
      const missing = Array.from({ length: 10 }, (_, index) => index + 1).filter((ord) => !byOrd.has(ord));
      if (missing.length) {
        const questions = missing.map((ord) => ({
          game_id: game.id, ord, text: `Rodzinne pytanie ${ord}?`,
        }));
        const { data: inserted, error } = await db.from("questions").insert(questions).select("id,ord");
        if (error) throw error;
        for (const question of inserted || []) byOrd.set(question.ord, question);
      }
      if (withAnswers) {
        for (const question of byOrd.values()) {
          const { data: existingAnswers, error: answerReadError } = await db.from("answers")
            .select("ord").eq("question_id", question.id);
          if (answerReadError) throw answerReadError;
          const existingOrd = new Set((existingAnswers || []).map((answer) => answer.ord));
          const answerRows = [
            { ord: 1, text: "Wspólny wyjazd", fixed_points: 50 },
            { ord: 2, text: "Rodzinny obiad", fixed_points: 30 },
            { ord: 3, text: "Dobra zabawa", fixed_points: 20 },
          ].filter((answer) => !existingOrd.has(answer.ord))
            .map((answer) => ({ ...answer, question_id: question.id }));
          if (!answerRows.length) continue;
          const { error: answerError } = await db.from("answers").insert(answerRows);
          if (answerError) throw answerError;
        }
      }
    }

    const game = await oneOrCreate("games", "owner_id", "E20-GALLERY-GAME", {
      type: "prepared", status: "ready", settings: { teams: { teamA: "Alfa", teamB: "Beta" } },
    }, "id,status,share_key_poll");
    await ensureQuestions(game, true);
    const session = await db.rpc("control_runtime_session_touch", { p_game_id: game.id, p_session_id: null });
    if (session.error || !session.data?.ok) throw new Error(session.error?.message || "Nie udało się przygotować sesji Control");
    const deviceKeys = {};
    for (const type of ["display", "host", "buzzer"]) {
      const { data, error } = await db.rpc("control_runtime_device_link", { p_game_id: game.id, p_device_type: type });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || `Brak linku urządzenia: ${type}`);
      deviceKeys[type] = data.token;
    }

    const base = await oneOrCreate("question_bases", "owner_id", "E20-GALLERY-BASE", {}, "id");
    const { data: categories, error: categoryReadError } = await db.from("qb_categories").select("id,name,ord")
      .eq("base_id", base.id).order("ord", { ascending: true }).limit(1);
    if (categoryReadError) throw categoryReadError;
    let category = categories?.[0] || null;
    if (!category) {
      const { data, error } = await db.from("qb_categories")
        .insert({ base_id: base.id, name: "Rodzina", ord: 1 }).select("id").single();
      if (error) throw error;
      category = data;
    }
    const { data: baseQuestions, error: baseQuestionReadError } = await db.from("qb_questions").select("id")
      .eq("base_id", base.id).eq("category_id", category.id).limit(1);
    if (baseQuestionReadError) throw baseQuestionReadError;
    if (!baseQuestions?.length) {
      const { error: questionError } = await db.from("qb_questions").insert({
        base_id: base.id, category_id: category.id, ord: 1,
        payload: { text: "Co najbardziej lubimy robić razem?", answers: [{ text: "Spędzać czas", points: 20 }] },
      });
      if (questionError) throw questionError;
    }

    const logo = await oneOrCreate("user_logos", "user_id", "E20-GALLERY-LOGO", {
      type: "GLYPH_30x10",
      payload: { layers: [{ color: "main", rows: ["10101", "01110"] }], source: { mode: "TEXT", text: "RODZINA", fontId: "familiada" } },
    }, "id");

    const polls = {};
    for (const type of ["poll_points", "poll_text"]) {
      const poll = await oneOrCreate("games", "owner_id", `E20-GALLERY-${type.toUpperCase()}`, {
        type, status: "draft",
      }, "id,status,share_key_poll");
      await ensureQuestions(poll, type === "poll_points");
      if (poll.status !== "open") {
        const { error } = await db.rpc("poll_open", { p_game_id: poll.id, p_key: poll.share_key_poll });
        if (error) throw error;
      }
      const { data: current, error } = await db.from("games").select("id,status,share_key_poll")
        .eq("id", poll.id).single();
      if (error) throw error;
      polls[type] = current;
    }
    return { game, base, logo, deviceKeys, polls };
  });
}

module.exports = { seedE20GalleryFixtures };
