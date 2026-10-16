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
    return {
      game: games.find((game) => game.type === "prepared") || null,
      base: bases[0] || null,
      logos: {
        text: byLogoMode("TEXT"),
        draw: byLogoMode("DRAW"),
        image: byLogoMode("IMAGE"),
      },
      polls: {
        poll_points: games.find((game) => game.type === "poll_points" && game.status === "open") || null,
        poll_text: games.find((game) => game.type === "poll_text" && game.status === "open") || null,
      },
    };
  });
}

module.exports = { readE20GalleryData };
