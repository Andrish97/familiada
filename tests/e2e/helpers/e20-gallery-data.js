// Odczyt istniejących danych zalogowanego konta. Galeria nie tworzy, nie
// aktualizuje ani nie usuwa rekordów na produkcji.
async function readE20GalleryData(page) {
  return page.evaluate(async () => {
    const db = window.__sbClient;
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth?.user?.id) throw new Error(authError?.message || "Konto galerii nie jest zalogowane");
    const ownerId = auth.user.id;

    const [gamesResult, basesResult, logosResult] = await Promise.all([
      db.from("games").select("id,name,type,status,share_key_poll").eq("owner_id", ownerId).limit(100),
      db.from("question_bases").select("id,name").eq("owner_id", ownerId).limit(100),
      db.from("user_logos").select("id,name,type,payload").eq("user_id", ownerId).limit(100),
    ]);
    for (const result of [gamesResult, basesResult, logosResult]) {
      if (result.error) throw result.error;
    }

    // Pomijamy wyłącznie pozostałości po poprzedniej galerii E20, która
    // tworzyła rekordy demonstracyjne na kontach. Nie usuwamy ich ani nie
    // pokazujemy jako danych użytkownika.
    const isPreviousGalleryRecord = (record) => /^E20-GALLERY-/i.test(typeof record === "string" ? record : record.name || "");
    const games = (gamesResult.data || []).filter((record) => !isPreviousGalleryRecord(record));
    const bases = (basesResult.data || []).filter((record) => !isPreviousGalleryRecord(record));
    const logos = (logosResult.data || []).filter((record) => !isPreviousGalleryRecord(record));
    const byLogoMode = (mode) => logos.find((logo) => logo.payload?.source?.mode === mode) || null;
    const isOpen = (game) => game.status === "poll_open" || game.status === "open";
    const preferDemo = (items) => [...items].sort((a, b) => {
      const demoA = /\bdemo\b/i.test(a.name || "") ? 1 : 0;
      const demoB = /\bdemo\b/i.test(b.name || "") ? 1 : 0;
      if (demoA !== demoB) return demoB - demoA;
      const openA = isOpen(a) ? 1 : 0;
      const openB = isOpen(b) ? 1 : 0;
      return openB - openA;
    })[0] || null;
    const closedDemoForPreview = (type) => {
      const polls = games.filter((game) => game.type === type);
      const demos = polls.filter((game) => /\bdemo\b/i.test(game.name || ""));
      // Wiersz polls galerii ma pokazywać wyniki zamkniętego Demo. Otwarte
      // ankiety są wybierane osobno wyłącznie dla publicznych stron głosowania.
      return demos.find((game) => game.status === "ready") || null;
    };
    const galleryData = {
      game: preferDemo(games.filter((game) => game.type === "prepared")),
      base: bases[0] || null,
      baseCandidates: bases,
      logos: {
        text: byLogoMode("TEXT"),
        draw: byLogoMode("DRAW"),
        image: byLogoMode("IMAGE"),
      },
      polls: {
        // Zamknięta ankieta Demo daje pełny, stabilny widok właściciela i wyników.
        poll_points: closedDemoForPreview("poll_points"),
        poll_text: closedDemoForPreview("poll_text"),
        poll_points_vote: games.find((game) => game.type === "poll_points" && isOpen(game) && game.share_key_poll) || null,
        poll_text_vote: games.find((game) => game.type === "poll_text" && isOpen(game) && game.share_key_poll) || null,
      },
    };
    const missing = [];
    if (!galleryData.game) missing.push("przygotowana gra do widoków Games i edytora");
    if (!galleryData.base) missing.push("baza pytań do widoków Bases i Base Explorer");
    for (const mode of ["text", "draw", "image"]) {
      if (!galleryData.logos[mode]) missing.push(`logo trybu ${mode}`);
    }
    if (!galleryData.polls.poll_text && !galleryData.polls.poll_points) missing.push("zamknięta ankieta Demo do wyników");
    if (!galleryData.polls.poll_text_vote && !galleryData.polls.poll_points_vote) missing.push("otwarta ankieta z kodem do udostępniania i widoków mobilnych");
    if (missing.length) {
      throw new Error(`Konto nie ma rzeczywistych danych wymaganych przez zatwierdzoną galerię E20: ${missing.join("; ")}. Nie zastępuję ich fikcyjnymi rekordami.`);
    }
    return galleryData;
  });
}

module.exports = { readE20GalleryData };
