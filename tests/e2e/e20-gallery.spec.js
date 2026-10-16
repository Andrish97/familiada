// Galeria E20 pokazuje front z badanego brancha na prawdziwym backendzie,
// wykorzystując wyłącznie rekordy już obecne na kontach testowych.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers/production-test");
const { serveBranchCode, serveBranchLoginHtml } = require("./helpers/branch-code");
const { galleryAccountNumbers, galleryAccountPaths, PREP_DIR } = require("./helpers/e20-gallery-accounts");
const { withE2EBypass } = require("./helpers/login");

const ORIGIN = "https://www.familiada.online";
const OUT = path.resolve(__dirname, "../test-results/e20-gallery");
// Playwright clears test-results on startup. Gallery output remains only page
// folders with PNGs; manifests live in runner temp and are not in the artifact.
const MANIFEST_DIR = path.join(PREP_DIR, "familiada-e20-gallery-manifests");
const PAGES = [
  "index", "account", "bases", "bases/explorer", "connect", "connect/tv",
  "control", "games",
  "games/editor", "games/settings", "friends", "go", "login", "login/confirm",
  "login/reset", "logos", "logos/editor/draw", "logos/editor/image", "logos/editor/text",
  "mails", "maintenance", "manual", "marketplace", "polls", "polls/vote/points",
  "polls/vote/qr", "polls/vote/text", "privacy", "subscribers", "tasks", "404",
];

const PROFILES = [
  { id: "macbook", label: "MacBook", width: 1440, height: 900, scale: 2, mobile: false, touch: false, safe: null },
  { id: "ipad-portrait", label: "iPad mini 7 pionowo", width: 744, height: 1133, scale: 2, mobile: true, touch: true, ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: "ipad-landscape", label: "iPad mini 7 poziomo", width: 1133, height: 744, scale: 2, mobile: true, touch: true, ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: "iphone-portrait", label: "iPhone 14 pionowo", width: 390, height: 844, scale: 3, mobile: true, touch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { id: "iphone-landscape", label: "iPhone 14 poziomo", width: 844, height: 390, screen: { width: 390, height: 844 }, scale: 3, mobile: true, touch: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { id: "tv", label: "Telewizor 1920 × 1080", width: 1920, height: 1080, scale: 1, mobile: false, touch: false, ua: "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36", safe: null },
];
const requestedPages = String(process.env.E20_GALLERY_PAGES || "").split(",").map((value) => value.trim()).filter(Boolean);
const requestedProfiles = String(process.env.E20_GALLERY_PROFILES || "").split(",").map((value) => value.trim()).filter(Boolean);
const requestedAccounts = galleryAccountNumbers();

function urls(data) {
  const game = data.game;
  const openDemoPoll = data.polls.poll_open_demo;
  const pollPoints = data.polls.poll_points_vote;
  const pollTextVote = data.polls.poll_text_vote;
  const result = [
    ["home", "/"], ["account", "/account/"], ["bases", "/bases/"],
    ["connect", "/connect/"], ["connect-tv", "/connect/tv/"],
    ["games", "/games/"],
    ["friends", "/friends/"], ["go", "/go/"], ["login", "/login/"],
    ["login-confirm", "/login/confirm/"], ["login-reset", "/login/reset/"], ["logos", "/logos/"],
    ["mails", "/mails/"], ["maintenance", "/maintenance/"], ["manual", "/manual/"],
    // Główny widok Ankiet pokazuje otwartą ankietę Demo. Dodatkowy stan
    // `results` poniżej pokazuje zamknięte Demo z wynikami.
    ["marketplace", "/marketplace/"], ["polls", openDemoPoll ? `/polls/?id=${openDemoPoll.id}` : "/polls/"],
    ["privacy", "/privacy/"], ["subscribers", "/subscribers/"], ["tasks", "/tasks/"], ["404", "/404.html"],
  ];
  if (data.base) result.push(["base-explorer", `/bases/explorer/?id=${data.base.id}`]);
  if (game) {
    result.push(["control", `/control/?id=${game.id}`]);
    result.push(["game-editor", `/games/editor/?id=${game.id}`]);
    result.push(["game-settings", `/games/settings/?id=${game.id}`]);
  }
  for (const modePage of ["text", "draw", "image"]) {
    const logo = data.logos[modePage];
    if (logo) result.push([`logo-editor-${modePage}`, `/logos/editor/${modePage}/?id=${logo.id}`]);
  }
  if (pollPoints?.share_key_poll) {
    result.push(["poll-vote-points", `/polls/vote/points/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`]);
    result.push(["poll-vote-qr", `/polls/vote/qr/?id=${pollPoints.id}&key=${pollPoints.share_key_poll}`]);
  }
  if (pollTextVote?.share_key_poll) {
    result.push(["poll-vote-text", `/polls/vote/text/?id=${pollTextVote.id}&key=${pollTextVote.share_key_poll}`]);
  }
  return result;
}

function additionalStates(data) {
  const pollForRecipientModal = data.polls.poll_text_vote || data.polls.poll_points_vote;
  const mobileSharePoll = data.polls.poll_text_vote || data.polls.poll_points_vote;
  const pollPreview = data.polls.poll_text || data.polls.poll_points;
  const states = [
    ...(data.game ? [{
      id: "connect", stateId: "modal:device-preview", page: "connect", href: "/connect/",
      modalCapture: true, expectedModalId: "devicePreviewOverlay", actionLabel: "Podłączanie urządzenia → podgląd przed połączeniem",
      prepare: async (page) => {
        if (!/^\d{6}$/.test(data.connectPreviewCode || "")) {
          throw new Error("Control nie udostępnił prawdziwego kodu urządzenia do podglądu Connect.");
        }
        await page.goto(`${ORIGIN}/connect/?lang=pl`, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.locator("#connectCodeInput").waitFor({ state: "visible", timeout: 15_000 });
        await page.locator("#connectCodeInput").fill(data.connectPreviewCode);
        await page.locator("#btnConnectCode").click();
        await page.locator("#devicePreviewOverlay").waitFor({ state: "visible", timeout: 15_000 });
      },
    }] : []),
    {
      id: "bases", stateId: "shared", page: "bases", href: "/bases/?tab=shared",
      actionLabel: "Moje bazy → Udostępnione",
      prepare: async (page) => {
        await expect(page.locator("#tabBasesShared")).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#basesSectionShared")).toHaveClass(/active/);
        await page.locator("#sharedGrid").waitFor({ state: "visible", timeout: 15_000 });
      },
    },
    {
      id: "bases", stateId: "modal:create-base", page: "bases", href: "/bases/",
      modalCapture: true, expectedModalId: "nameOverlay", actionLabel: "Moje bazy → Utwórz bazę",
      prepare: async (page) => { await page.locator("#mineGrid .addCard").click(); },
    },
    {
      id: "bases", stateId: "modal:import-base", page: "bases", href: "/bases/",
      modalCapture: true, expectedModalId: "importOverlay", actionLabel: "Moje bazy → Importuj bazę",
      prepare: async (page) => { await page.locator("#btnImport").click(); },
    },
    ...(data.base ? [
      {
        id: "bases", stateId: "modal:rename-base", page: "bases", href: "/bases/",
        modalCapture: true, expectedModalId: "nameOverlay", actionLabel: "Moje bazy → Zmień nazwę bazy",
        prepare: async (page) => {
          const tile = await selectOwnedBase(page, data.base.id);
          await tile.dblclick();
        },
        cleanup: async (page) => {
          const modal = page.locator("#nameOverlay");
          if (await modal.isVisible().catch(() => false)) {
            await page.locator("#btnNameCancel").click();
            await modal.waitFor({ state: "hidden", timeout: 5_000 });
          }
        },
      },
      {
        id: "bases", stateId: "modal:share-base", page: "bases", href: "/bases/",
        modalCapture: true, expectedModalId: "shareOverlay", actionLabel: "Moje bazy → Udostępnij bazę",
        prepare: async (page) => {
          await selectOwnedBase(page, data.base.id);
          await page.locator("#btnShare").waitFor({ state: "visible" });
          await expect(page.locator("#btnShare")).toBeEnabled();
          await page.locator("#btnShare").click();
        },
      },
      {
        id: "bases", stateId: "modal:export-base-json", page: "bases", href: "/bases/",
        modalCapture: true, expectedModalId: "exportJsonOverlay", actionLabel: "Moje bazy → Eksportuj bazę do JSON",
        prepare: async (page) => {
          await selectOwnedBase(page, data.base.id);
          await expect(page.locator("#btnExport")).toBeEnabled();
          await page.locator("#btnExport").click();
        },
      },
    ] : []),
    ...(data.base ? [
      {
        id: "base-explorer", stateId: "modal:export-questions", page: "base-explorer",
        href: `/bases/explorer/?id=${data.base.id}`, modalCapture: true,
        expectedModalId: "exportOverlay", actionLabel: "Eksplorator bazy → Eksport pytań",
        prepare: async (page) => {
          const target = await findUnlockedQuestionAcrossBases(page, data);
          if (!target) throw new Error("Brak dostępnego pytania do wyboru w eksporcie bazy.");
          await page.goto(`${ORIGIN}/bases/explorer/?id=${target.base.id}&lang=pl`, { waitUntil: "domcontentloaded", timeout: 20_000 });
          await page.waitForFunction(() => !document.documentElement.classList.contains("page-loading"), null, { timeout: 20_000 });
          await openQuestionInBaseFolder(page, target.base.id, target.question);
          const drawer = page.locator("#btnDrawerToggle");
          if (await drawer.isVisible().catch(() => false)) await drawer.click();
          await page.locator('#toolbar [data-act="createGame"]').click();
        },
      },
      {
        id: "base-explorer", stateId: "modal:rename-item", page: "base-explorer",
        href: `/bases/explorer/?id=${data.base.id}`, modalCapture: true,
        expectedVisibleSelector: "#renameModal", actionLabel: "Eksplorator bazy → Zmień nazwę elementu",
        prepare: async (page) => {
          const item = page.locator('#list .row[data-kind="cat"][data-id]').first();
          await item.waitFor({ state: "visible", timeout: 15_000 });
          await item.click();
          const drawer = page.locator("#btnDrawerToggle");
          if (await drawer.isVisible().catch(() => false)) await drawer.click();
          await page.locator('#toolbar [data-act="rename"]').click();
          await page.locator("#renameModal").waitFor({ state: "visible", timeout: 15_000 });
        },
      },
      {
        id: "base-explorer", stateId: "modal:edit-question", page: "base-explorer",
        href: `/bases/explorer/?id=${data.base.id}`, modalCapture: true,
        expectedModalId: "questionOverlay", actionLabel: "Eksplorator bazy → Edytuj pytanie",
        prepare: async (page) => {
          const target = await findUnlockedQuestionAcrossBases(page, data);
          if (!target) throw new Error("Brak odblokowanego pytania, którego edycję można pokazać na bazie rzeczywistych danych.");
          await page.goto(`${ORIGIN}/bases/explorer/?id=${target.base.id}&lang=pl`, { waitUntil: "domcontentloaded", timeout: 20_000 });
          await page.waitForFunction(() => !document.documentElement.classList.contains("page-loading"), null, { timeout: 20_000 });
          await openQuestionInBaseFolder(page, target.base.id, target.question);
          const drawer = page.locator("#btnDrawerToggle");
          if (await drawer.isVisible().catch(() => false)) await drawer.click();
          const action = page.locator('#toolbar [data-act="editQuestion"]');
          await action.click();
          await page.locator("#questionOverlay").waitFor({ state: "visible", timeout: 10_000 });
        },
      },
      {
        id: "base-explorer", stateId: "modal:add-question", page: "base-explorer",
        href: `/bases/explorer/?id=${data.base.id}`, modalCapture: true,
        expectedModalId: "questionOverlay", actionLabel: "Eksplorator bazy → Dodaj pytanie",
        prepare: async (page) => {
          await page.goto(`${ORIGIN}/bases/explorer/?id=${data.base.id}&lang=pl`, { waitUntil: "domcontentloaded", timeout: 20_000 });
          await page.waitForFunction(() => !document.documentElement.classList.contains("page-loading"), null, { timeout: 20_000 });
          const previousLastQuestion = await page.evaluate(async (baseId) => {
            const { data, error } = await window.__sbClient.from("qb_questions")
              .select("id,ord,payload").eq("base_id", baseId).is("category_id", null)
              .order("ord", { ascending: false }).limit(1).maybeSingle();
            if (error) throw error;
            return data || null;
          }, data.base.id);
          const visibleQuestionIds = await page.locator('#list .row[data-kind="q"][data-id]').evaluateAll((rows) =>
            rows.map((row) => row.dataset.id));
          page.__e20VisibleQuestionIdsBeforeCreate = visibleQuestionIds;
          page.__e20QuestionStateBeforeCreate = previousLastQuestion;
          const drawer = page.locator("#btnDrawerToggle");
          if (await drawer.isVisible().catch(() => false)) await drawer.click();
          await page.locator('#toolbar [data-act="newQuestion"]').click();
          await page.waitForFunction((beforeIds) =>
            [...document.querySelectorAll('#list .row[data-kind="q"][data-id]')]
              .some((row) => !beforeIds.includes(row.dataset.id)),
          visibleQuestionIds, { timeout: 15_000 });
          const newId = await page.locator('#list .row[data-kind="q"][data-id]').evaluateAll((rows, beforeIds) =>
            rows.find((row) => !beforeIds.includes(row.dataset.id))?.dataset.id || "", visibleQuestionIds);
          if (!newId) throw new Error("UI nie ujawnił identyfikatora nowo dodanego pytania.");
          page.__e20TemporaryQuestionId = newId;
          const newQuestionRow = page.locator(`#list .row[data-kind="q"][data-id="${newId}"]`);
          await newQuestionRow.waitFor({ state: "visible", timeout: 15_000 });
          await newQuestionRow.click();
          const editButton = page.locator('#toolbar [data-act="editQuestion"]');
          if (!await editButton.isVisible().catch(() => false)) {
            const drawer = page.locator("#btnDrawerToggle");
            if (await drawer.isVisible().catch(() => false)) await drawer.click();
          }
          await editButton.click();
          await page.locator("#questionOverlay").waitFor({ state: "visible", timeout: 10_000 });
        },
        cleanup: async (page) => {
          if (page.isClosed()) return;
          let questionId = page.__e20TemporaryQuestionId;
          if (!questionId && page.__e20VisibleQuestionIdsBeforeCreate) {
            questionId = await page.locator('#list .row[data-kind="q"][data-id]').evaluateAll((rows, beforeIds) =>
              rows.find((row) => !beforeIds.includes(row.dataset.id))?.dataset.id || "",
            page.__e20VisibleQuestionIdsBeforeCreate);
          }
          if (!questionId && page.__e20QuestionStateBeforeCreate) {
            questionId = await page.evaluate(async ({ baseId, before }) => {
              const { data, error } = await window.__sbClient.from("qb_questions")
                .select("id,ord,payload").eq("base_id", baseId).is("category_id", null)
                .order("ord", { ascending: false }).limit(1).maybeSingle();
              if (error) throw error;
              return data && data.id !== before?.id && Number(data.ord) > Number(before?.ord || 0)
                && data.payload?.text === "Nowe pytanie" ? data.id : "";
            }, { baseId: data.base.id, before: page.__e20QuestionStateBeforeCreate });
          }
          if (!questionId) return;
          let removed = false;
          try {
            if (await page.locator("#questionOverlay").isVisible().catch(() => false)) {
              await page.locator("#qClose").click();
              await page.locator("#questionOverlay").waitFor({ state: "hidden", timeout: 10_000 });
            }
            const row = page.locator(`#list .row[data-kind="q"][data-id="${questionId}"]`);
            if (await row.isVisible().catch(() => false)) {
              await row.click();
              const deleteButton = page.locator('#toolbar [data-act="delete"]');
              if (!await deleteButton.isVisible().catch(() => false)) {
                const drawer = page.locator("#btnDrawerToggle");
                if (await drawer.isVisible().catch(() => false)) await drawer.click();
              }
              await deleteButton.click();
              const confirm = page.locator(".uni-modal:visible");
              await confirm.waitFor({ state: "visible", timeout: 10_000 });
              await confirm.locator(".uni-foot .gold").click();
              await page.waitForFunction((id) => !document.querySelector(`#list .row[data-kind="q"][data-id="${CSS.escape(id)}"]`), questionId, { timeout: 15_000 });
              removed = true;
            }
          } catch (cleanupError) {
            const errorMessage = await page.evaluate(async (id) => {
              const { error } = await window.__sbClient.from("qb_questions").delete().eq("id", id);
              return error?.message || "";
            }, questionId).catch((error) => error.message);
            if (errorMessage) throw new Error(`Nie udało się usunąć tymczasowego pytania E20 (${cleanupError.message}; ${errorMessage})`);
            removed = true;
          }
          if (!removed) {
            const errorMessage = await page.evaluate(async (id) => {
              const { error } = await window.__sbClient.from("qb_questions").delete().eq("id", id);
              return error?.message || "";
            }, questionId);
            if (errorMessage) throw new Error(`Nie udało się usunąć tymczasowego pytania E20: ${errorMessage}`);
          }
          page.__e20TemporaryQuestionId = null;
        },
      },
    ] : []),
    ...(pollPreview ? [{
      id: "polls", stateId: "results", page: "polls", href: `/polls/?id=${pollPreview.id}&tab=results`,
      actionLabel: "Ankiety → wyniki zamkniętej ankiety Demo",
      prepare: async (page) => {
        await expect(page.locator("#tabResults")).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#resultsList")).toBeVisible();
      },
    }] : []),
    ...(mobileSharePoll ? [
      {
        id: "polls", stateId: "anonymous", page: "polls", href: `/polls/?id=${mobileSharePoll.id}&tab=share`, mobileOnly: true,
        actionLabel: "Ankiety → udostępnianie anonimowe",
        prepare: async (page) => {
          await expect(page.locator("#tabShare")).toHaveAttribute("aria-selected", "true");
          await expect(page.locator("#secShare")).toHaveClass(/active/);
        },
      },
      {
        id: "polls", stateId: "recipients", page: "polls", href: `/polls/?id=${mobileSharePoll.id}&tab=recipients`, mobileOnly: true,
        actionLabel: "Ankiety → odbiorcy",
        prepare: async (page) => {
          await expect(page.locator("#tabRecipients")).toHaveAttribute("aria-selected", "true");
          await expect(page.locator("#pollTabsCard")).toHaveClass(/mobile-recipients-active/);
        },
      },
    ] : []),
    { id: "marketplace", stateId: "mine", page: "marketplace", href: "/marketplace/", prepare: async (page) => {
      await page.locator("#btnMySent").click();
      await page.locator("#viewMine").waitFor({ state: "visible", timeout: 15_000 });
    } },
    ...["friends", "subscribers"].map((id) => ({
      id, stateId: "list", page: id, href: `/${id}/?tab=received`, mobileOnly: true,
      actionLabel: `${id === "friends" ? "Znajomi" : "Subskrybenci"} → otrzymane zaproszenia`,
      prepare: async (page) => {
        await expect(page.locator("#contactsTabReceived")).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#contactsReceived")).toBeVisible();
      },
    })),
    ...(data.game ? [
      {
        id: "game-editor", stateId: "modal:import-questions-text", page: "game-editor",
        href: `/games/editor/?id=${data.game.id}`, modalCapture: true,
        expectedModalId: "txtImportOverlay", actionLabel: "Edytor gry → Import pytań z tekstu",
        prepare: async (page) => {
          await page.locator("#btnImportTxt").click();
          await page.locator("#txtImportOverlay").waitFor({ state: "visible", timeout: 15_000 });
        },
      },
      {
        id: "games", stateId: "modal:create-game", page: "games", href: "/games/",
        modalCapture: true, expectedModalId: "nameOverlay", actionLabel: "Gry → Utwórz grę",
        prepare: async (page) => { await page.locator("#grid .addCard").first().click(); },
      },
      {
        id: "games", stateId: "modal:rename-game", page: "games", href: "/games/",
        modalCapture: true, expectedModalId: "nameOverlay", actionLabel: "Gry → Zmień nazwę gry",
        prepare: async (page) => {
          const tile = page.locator(`#grid .card[data-game-id="${data.game.id}"]`);
          await tile.waitFor({ state: "visible", timeout: 15_000 });
          await tile.dblclick();
        },
        cleanup: async (page) => {
          const modal = page.locator("#nameOverlay");
          if (await modal.isVisible().catch(() => false)) {
            await page.locator("#btnNameCancel").click();
            await modal.waitFor({ state: "hidden", timeout: 5_000 });
          }
        },
      },
      {
        id: "games", stateId: "modal:import-games", page: "games", href: "/games/",
        modalCapture: true, expectedModalId: "importOverlay", actionLabel: "Gry → Importuj gry",
        prepare: async (page) => { await page.locator("#btnImport").click(); },
      },
      {
        id: "games", stateId: "modal:export-game-base", page: "games", href: "/games/",
        modalCapture: true, expectedModalId: "exportBaseOverlay", actionLabel: "Gry → Eksportuj grę do bazy",
        prepare: async (page) => {
          await page.locator(`#grid .card[data-game-id="${data.game.id}"]`).click();
          await expect(page.locator("#btnExportBase")).toBeEnabled();
          await page.locator("#btnExportBase").click();
        },
      },
      {
        id: "games", stateId: "modal:export-game-json", page: "games", href: "/games/",
        modalCapture: true, expectedModalId: "exportJsonOverlay", actionLabel: "Gry → Eksport JSON",
        prepare: async (page) => {
          await page.locator(`#grid .card[data-game-id="${data.game.id}"]`).click();
          await expect(page.locator("#btnExport")).toBeEnabled();
          await page.locator("#btnExport").click();
        },
      },
      {
        id: "games", stateId: "modal:preview-game", page: "games", href: "/games/",
        modalCapture: true, expectedModalId: "previewOverlay", actionLabel: "Gry → Podgląd gry",
        prepare: async (page) => {
          await page.locator(`#grid .card[data-game-id="${data.game.id}"]`).click();
          await expect(page.locator("#btnPreview")).toBeEnabled();
          await page.locator("#btnPreview").click();
          await page.locator("#previewOverlay").waitFor({ state: "visible", timeout: 15_000 });
          await page.locator("#previewQuestions").waitFor({ state: "visible", timeout: 10_000 });
        },
      },
      {
        id: "game-editor", stateId: "question", page: "game-editor", href: `/games/editor/?id=${data.game.id}`,
        mobileOnly: true,
        prepare: async (page) => {
          const question = page.locator("#qList .qcard[data-id]").first();
          await question.waitFor({ state: "visible", timeout: 20_000 });
          await question.click();
          await expect(page.locator("body")).toHaveClass(/mobile-editing/);
          await page.locator("#qText").scrollIntoViewIfNeeded();
        },
      },
      {
        id: "game-editor", stateId: "answers", page: "game-editor", href: `/games/editor/?id=${data.game.id}`,
        mobileOnly: true,
        prepare: async (page) => {
          const question = page.locator("#qList .qcard[data-id]").first();
          await question.waitFor({ state: "visible", timeout: 20_000 });
          await question.click();
          await expect(page.locator("body")).toHaveClass(/mobile-editing/);
          await page.locator("#aList").scrollIntoViewIfNeeded();
        },
      },
    ] : []),
    ...((data.logos.text || data.logos.draw || data.logos.image) ? [{
      id: "logos", stateId: "modal:rename-logo", page: "logos", href: "/logos/",
      modalCapture: true, expectedModalId: "renameOverlay", actionLabel: "Lista logo → Zmień nazwę",
      prepare: async (page) => {
        const logo = data.logos.text || data.logos.draw || data.logos.image;
        const tile = page.locator(`.logoTile[data-key="${logo.id}"]`);
        await tile.waitFor({ state: "visible", timeout: 15_000 });
        await tile.dblclick();
      },
    }] : []),
    ...((data.logos.text || data.logos.draw || data.logos.image) ? [
      {
        id: "logos", stateId: "modal:preview-logo", page: "logos", href: "/logos/",
        modalCapture: true, expectedModalId: "previewOverlay", actionLabel: "Lista logo → Podgląd logo",
        prepare: async (page) => {
          const logo = data.logos.text || data.logos.draw || data.logos.image;
          await page.locator(`.logoTile[data-key="${logo.id}"]`).click();
          await expect(page.locator("#btnPreview")).toBeEnabled();
          await page.locator("#btnPreview").click();
        },
      },
      {
        id: "logos", stateId: "modal:import-logo", page: "logos", href: "/logos/",
        modalCapture: true, expectedModalId: "logoImportOverlay", actionLabel: "Lista logo → Import logo",
        prepare: async (page) => { await page.locator("#btnImport").click(); },
      },
      {
        id: "logos", stateId: "modal:export-logo", page: "logos", href: "/logos/",
        modalCapture: true, expectedModalId: "logoExportOverlay", actionLabel: "Lista logo → Eksport logo",
        prepare: async (page) => {
          const logo = data.logos.text || data.logos.draw || data.logos.image;
          await page.locator(`.logoTile[data-key="${logo.id}"]`).click();
          await expect(page.locator("#btnExport")).toBeEnabled();
          await page.locator("#btnExport").click();
          await page.locator("#logoExportOverlay").waitFor({ state: "visible", timeout: 15_000 });
          await expect(page.locator("#logoExportSub")).toBeVisible();
        },
      },
    ] : []),
    ...["text", "draw", "image"].flatMap((mode) => {
      const logo = data.logos[mode];
      if (!logo) return [];
      const pageId = `logo-editor-${mode}`;
      const trigger = mode === "text" ? "#bigPreview" : mode === "draw" ? "#tEye" : "#imgBigPreview";
      return [{
        id: pageId, stateId: "modal:preview", page: pageId,
        href: `/logos/editor/${mode}/?id=${logo.id}`,
        modalCapture: true, expectedModalId: "previewOverlay",
        actionLabel: `Edytor logo ${mode} → Powiększony podgląd`,
        prepare: async (page) => {
          await page.locator(trigger).waitFor({ state: "visible", timeout: 15_000 });
          await page.locator(trigger).click();
        },
      }];
    }),
    ...(pollPreview ? [{
      id: "games", stateId: "modal:preview-poll", page: "games", href: "/games/",
      modalCapture: true, expectedModalId: "previewOverlay", actionLabel: "Podgląd gry → Ankieta",
      prepare: async (page) => {
        const tab = pollPreview.type === "poll_points" ? "#tabPollPoints" : "#tabPollText";
        await page.locator(tab).click();
        const card = page.locator(`#grid .card[data-game-id="${pollPreview.id}"]`);
        await card.waitFor({ state: "visible", timeout: 15_000 });
        await card.click();
        await page.locator("#btnPreview").waitFor({ state: "visible" });
        await expect(page.locator("#btnPreview")).toBeEnabled();
        await page.locator("#btnPreview").click();
        await page.locator("#previewOverlay").waitFor({ state: "visible", timeout: 15_000 });
        await page.locator("#btnPreviewModePoll").click();
        await page.locator("#previewPoll").waitFor({ state: "visible", timeout: 10_000 });
        await page.waitForFunction(() => !/^(ładowanie|loading)[.…\s]*$/i.test(document.querySelector("#previewPollMeta")?.textContent?.trim() || ""), null, { timeout: 20_000 });
      },
    }] : []),
    ...(data.game ? [{
      id: "game-settings", stateId: "modal:color-picker", page: "game-settings", href: `/games/settings/?id=${data.game.id}`,
      modalCapture: true, expectedVisibleSelector: ".uni-modal", actionLabel: "Ustawienia gry → Wybór koloru",
      prepare: async (page) => {
        await page.locator('#gsSidebar [data-cat="display"]').click();
        await page.locator(".swatchBtn").first().waitFor({ state: "visible", timeout: 15_000 });
        await page.locator(".swatchBtn").first().click();
        await page.locator(".uni-modal").waitFor({ state: "visible", timeout: 15_000 });
      },
    }] : []),
    ...(pollForRecipientModal?.share_key_poll ? [
      {
        id: "polls", stateId: "modal:recipient-picker", page: "polls",
        href: `/polls/?id=${pollForRecipientModal.id}&tab=share`, modalCapture: true,
        expectedModalId: "pollRecipientsOverlay", actionLabel: "Odbiorcy ankiety → Wybierz odbiorców",
        prepare: async (page) => {
          await page.locator("#btnAddRecipients").waitFor({ state: "visible", timeout: 15_000 });
          await page.locator("#btnAddRecipients").click();
        },
      },
      {
        id: "polls", stateId: "modal:display-qr", page: "polls",
        href: `/polls/?id=${pollForRecipientModal.id}&tab=share`, modalCapture: true,
        expectedModalId: "pollQrModalOverlay", actionLabel: "Udostępnianie ankiety → QR wyświetlacza",
        prepare: async (page) => {
          await page.locator("#btnOpenQr").waitFor({ state: "visible", timeout: 15_000 });
          await page.locator("#btnOpenQr").click();
        },
      },
      {
        id: "polls", stateId: "modal:vote-qr-large", page: "polls",
        href: `/polls/?id=${pollForRecipientModal.id}&tab=share`, modalCapture: true,
        expectedModalId: "pollQrModalOverlay", actionLabel: "Udostępnianie ankiety → powiększony QR do głosowania",
        prepare: async (page) => {
          await page.locator("#qr").waitFor({ state: "visible", timeout: 15_000 });
          await page.locator("#qr").click();
          await page.locator("#pollQrModalOverlay").waitFor({ state: "visible", timeout: 15_000 });
          await page.locator("#pollQrModalVote").waitFor({ state: "visible", timeout: 15_000 });
        },
      },
    ] : []),
    {
      id: "marketplace", stateId: "modal:marketplace-detail", page: "marketplace", href: "/marketplace/",
      modalCapture: true, expectedModalId: "gameDetailOverlay", actionLabel: "Gry Społeczności → Szczegóły gry",
      prepare: async (page) => {
        const card = page.locator(".mkt-card").first();
        await card.waitFor({ state: "visible", timeout: 20_000 });
        await card.click();
      },
    },
    {
      id: "marketplace", stateId: "modal:marketplace-submit", page: "marketplace", href: "/marketplace/?tab=mine",
      modalCapture: true, expectedModalId: "submitOverlay", actionLabel: "Moje wysłane → Zgłoś grę",
      prepare: async (page) => {
        await page.locator("#btnMySent").click();
        await page.locator("#viewMine").waitFor({ state: "visible", timeout: 15_000 });
        await page.locator("#btnSubmitNew").waitFor({ state: "visible", timeout: 15_000 });
        await page.locator("#btnSubmitNew").click();
      },
    },
    {
      id: "marketplace", stateId: "modal:marketplace-search", page: "marketplace", href: "/marketplace/",
      mobileOnly: true, maxWidth: 600, modalCapture: true, expectedVisibleSelector: ".uni-modal",
      actionLabel: "Gry Społeczności → mobilne wyszukiwanie",
      prepare: async (page) => {
        await page.locator("#btnSearchFocus").click();
        await page.locator(".uni-modal").waitFor({ state: "visible", timeout: 15_000 });
      },
    },
    {
      id: "games", stateId: "modal:contact", page: "games", href: "/games/",
      modalCapture: true, expectedModalId: "contactModalOverlay", actionLabel: "Gry → Kontakt",
      prepare: async (page) => {
        await page.locator("[data-contact-modal]").click();
        await page.locator("#contactModalOverlay").waitFor({ state: "visible", timeout: 15_000 });
      },
    },
  ];
  return states;
}

async function selectOwnedBase(page, baseId) {
  const mineTab = page.locator("#tabBasesMine");
  await mineTab.click();
  await expect(mineTab).toHaveAttribute("aria-selected", "true");
  const tile = page.locator(`.tile[data-base-id="${baseId}"]`);
  await tile.waitFor({ state: "visible", timeout: 15_000 });
  await tile.click();
  await expect(tile).toHaveClass(/selected/);
  return tile;
}

async function restartControlToDevices(page) {
  const startOver = page.locator("#btnStartOver");
  if (!await startOver.isVisible().catch(() => false)) {
    const menuToggle = page.locator(".topbar-menu-toggle");
    await menuToggle.waitFor({ state: "visible", timeout: 10_000 });
    await menuToggle.click();
  }
  await startOver.waitFor({ state: "visible", timeout: 10_000 });
  await startOver.click();
  const confirmation = page.getByRole("dialog", { name: "Zacznij od nowa" });
  await confirmation.waitFor({ state: "visible", timeout: 10_000 });
  await expect(confirmation.locator(".mTitle")).toHaveText("Zacznij od nowa");
  await confirmation.locator(".uni-foot .btn.gold").click();
  await page.waitForFunction(() => document.body.dataset.controlStep === "devices_display", null, { timeout: 20_000 });
}

async function saveDeviceScreenshot(page, profile, id, outputPath, captureWithoutFontWait = false, capturedImage = null) {
  let image;
  const captureWithCDP = async () => {
    const session = await page.context().newCDPSession(page);
    try {
      const result = await session.send("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false,
      });
      return Buffer.from(result.data, "base64");
    } finally {
      await session.detach();
    }
  };
  if (capturedImage) {
    image = capturedImage;
  } else if (captureWithoutFontWait) {
    image = await captureWithCDP();
  } else {
    try {
      image = await page.screenshot({ fullPage: false, scale: "css", animations: "disabled", timeout: 20_000 });
    } catch (error) {
      if (!/TimeoutError|timeout/i.test(error.message)) throw error;
      // Playwright czeka na document.fonts.ready; CDP zapisuje ten sam viewport bez tego oczekiwania.
      image = await captureWithCDP();
    }
  }
  if (!["iphone-portrait", "iphone-landscape", "ipad-portrait", "ipad-landscape"].includes(profile.id)) {
    fs.writeFileSync(outputPath, image);
    return;
  }
  const iPhone = profile.id.startsWith("iphone");
  const landscape = profile.id.endsWith("landscape");
  const radius = iPhone ? 42 : 28;
  const bezel = iPhone ? 8 : 9;
  const notch = iPhone
    ? landscape
      ? '<i class="notch side"><b></b></i>'
      : '<i class="notch top"><b></b></i>'
    : "";
  const deviceIndicators = `${notch}<i class="gesture"></i>`;
  const frame = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#10131a;display:grid;place-items:center;overflow:hidden}
    .device{display:inline-block;padding:${bezel}px;background:#030407;border:2px solid #30343d;border-radius:${radius + bezel}px;box-shadow:0 12px 44px #000b;line-height:0}
    .screen{position:relative;width:${profile.width}px;height:${profile.height}px;overflow:hidden;border-radius:${radius}px;background:#050914}
    img{display:block;width:100%;height:100%;object-fit:fill}
    .notch{position:absolute;display:block;background:#030407;z-index:3}
    .notch.top{top:0;left:50%;transform:translateX(-50%);width:32.3%;height:4.27%;border-radius:0 0 22px 22px}
    .notch.top b{position:absolute;top:34%;right:13%;width:15%;height:15%;border-radius:5px;background:#111318;box-shadow:-28px 0 0 3px #08090c}
    .notch.side{left:0;top:50%;transform:translateY(-50%);width:4.27%;height:32.3%;border-radius:0 22px 22px 0}
    .notch.side b{position:absolute;left:34%;bottom:13%;width:15%;height:15%;border-radius:5px;background:#111318;box-shadow:0 -28px 0 3px #08090c}
    .gesture{position:absolute;z-index:3;left:50%;bottom:7px;transform:translateX(-50%);width:92px;height:4px;border-radius:99px;background:#ffffffa8}
  </style><div class="device"><div class="screen"><img src="data:image/png;base64,${image.toString("base64")}">${deviceIndicators}</div></div>`;
  // Najpierw opuszczamy badaną stronę, żeby zwolnić jej JS i ewentualne blokady.
  // Ramkę rysuje osobna, krótko żyjąca karta bez URL/backendu; nie zostawia
  // zakodowanych obrazów w rendererze, który otworzy następną stronę aplikacji.
  await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 10_000 });
  const framePage = await page.context().newPage();
  try {
    await framePage.setViewportSize({ width: profile.width + 2 * bezel + 8, height: profile.height + 2 * bezel + 8 });
    await framePage.setContent(frame, { waitUntil: "load", timeout: 20_000 });
    await framePage.screenshot({ path: outputPath, fullPage: true, scale: "css", animations: "disabled", timeout: 20_000 });
  } finally {
    await framePage.close();
  }
  const png = fs.readFileSync(outputPath);
  const actualFrameSize = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const expectedFrameSize = { width: profile.width + 2 * bezel + 8, height: profile.height + 2 * bezel + 8 };
  if (actualFrameSize.width !== expectedFrameSize.width || actualFrameSize.height !== expectedFrameSize.height) {
    throw new Error(`${profile.label} · ${id}: obraz ramki ma rozmiar ${actualFrameSize.width}×${actualFrameSize.height}, oczekiwano ${expectedFrameSize.width}×${expectedFrameSize.height}`);
  }
}

function pageModalIds(page) {
  return page.locator('.overlay[id], .overlay .modal, .colorModalOverlay[id], .dt-modal[id], .drawer-overlay[id], dialog[id], [role="dialog"][id]')
    .evaluateAll((items) => items
      .filter((el) => !["pageGuard", "resourceLockGuard"].includes(el.id))
      .filter((el) => !/(alert|confirm|error|errModal)/i.test(el.id))
      .filter((el) => {
        const style = getComputedStyle(el);
        return !el.hidden && style.display !== "none" && style.visibility !== "hidden"
          && el.getClientRects().length > 0;
      })
      .map((el) => el.id || el.classList?.[0] || el.querySelector?.(".mTitle")?.textContent?.trim() || "dialog"));
}

// Wybór pytania odbywa się po sprawdzeniu blokady przez tę samą funkcję RPC,
// której używa UI. Sam zrzut nadal otwiera modal przez widok i kliknięcia UI.
async function findUnlockedBaseQuestion(page, baseId) {
  return page.evaluate(async (id) => {
    const db = window.__sbClient;
    if (!db) throw new Error("Brak klienta bazy danych w stronie eksploratora");
    const { data: questions, error } = await db.from("qb_questions")
      .select("id,category_id")
      .eq("base_id", id)
      .limit(1000);
    if (error) throw error;
    for (const question of questions || []) {
      const tabId = `e20-gallery-probe:${crypto.randomUUID()}`;
      const { data: lock, error: lockError } = await db.rpc("acquire_edit_lock_mode", {
        p_resource_type: "base_question",
        p_resource_id: question.id,
        p_tab_id: tabId,
        p_context: "e20-gallery-probe",
        p_mode: "exclusive",
      });
      if (lockError) throw lockError;
      if (!lock?.ok) continue;
      const { error: releaseError } = await db.rpc("release_edit_lock", {
        p_resource_type: "base_question", p_resource_id: question.id, p_tab_id: tabId,
      });
      if (releaseError) throw releaseError;
      return question;
    }
    return null;
  }, baseId);
}

async function findUnlockedQuestionAcrossBases(page, data) {
  const candidates = data.baseCandidates?.length ? data.baseCandidates : data.base ? [data.base] : [];
  for (const base of candidates) {
    const question = await findUnlockedBaseQuestion(page, base.id);
    if (question) return { base, question };
  }
  return null;
}

async function openQuestionInBaseFolder(page, baseId, question) {
  if (question.category_id) {
    const href = `/bases/explorer/?id=${encodeURIComponent(baseId)}&folder=${encodeURIComponent(question.category_id)}&lang=pl`;
    await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains("page-loading"), null, { timeout: 20_000 });
  }
  const row = page.locator(`#list .row[data-kind="q"][data-id="${question.id}"]`);
  await row.waitFor({ state: "visible", timeout: 15_000 });
  await row.click();
}

async function dismissBlockingModal(page, profile, id) {
  const ratingOverlay = page.locator("#ratingOverlay");
  const hasRatingModal = await ratingOverlay.count() > 0 && await ratingOverlay.isVisible().catch(() => false);
  const genericDialog = page.locator(".overlay:visible").filter({ has: page.locator("button:visible") }).first();
  const hasGenericModal = !hasRatingModal && await genericDialog.count() > 0 && await genericDialog.isVisible().catch(() => false);
  if (!hasRatingModal && !hasGenericModal) return;

  if (hasRatingModal) {
    await page.locator("#btnRatingLater").click({ timeout: 5_000 });
    await ratingOverlay.waitFor({ state: "detached", timeout: 10_000 });
    return;
  }

  const safeDismiss = genericDialog.getByRole("button", { name: /zamknij|close|anuluj|cancel|później|later|nie/i }).first();
  if (await safeDismiss.count()) {
    await safeDismiss.click();
  } else {
    const buttons = genericDialog.locator("button:visible");
    const count = await buttons.count();
    if (!count) throw new Error(`${profile.label} · ${id}: widoczny modal informacyjny nie ma przycisku do zamknięcia`);
    await buttons.nth(count > 1 ? 0 : count - 1).click();
  }
  await genericDialog.waitFor({ state: "hidden", timeout: 10_000 });
}

async function capture(page, profile, id, href, manifest, prepare = null, readySelector = null, options = {}) {
  const url = `${ORIGIN}${href}${href.includes("?") ? "&" : "?"}lang=pl`;
  const pageErrors = [];
  const onPageError = (error) => pageErrors.push(error.message);
  page.on("pageerror", onPageError);
  if (id === "maintenance") {
    // Podgląd Maintenance korzysta z właściwej strony i jej JS, a przykładowy
    // stan pozwala pokazać ją również wtedy, gdy produkcyjna przerwa jest wyłączona.
    await page.route("**/maintenance-state.json*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ enabled: true, mode: "message", useStandardText: true }),
    }));
  }
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  } catch (error) {
    throw new Error(`${profile.label} · ${id}: nawigacja nie zakończyła się (${error.message})`);
  }
  try {
    await page.waitForFunction(() => {
      const html = document.documentElement;
      const guarded = html.dataset.deviceGuard && html.dataset.deviceGuard !== "ok"
        && document.getElementById("pageGuard")?.style.display === "flex";
      return !html.classList.contains("page-loading") || guarded;
    }, null, { timeout: 8_000 });
  } catch {
    const diagnostics = await page.evaluate(() => ({
      loading: document.documentElement.classList.contains("page-loading"),
      guard: document.documentElement.dataset.deviceGuard || "",
      guardDisplay: document.getElementById("pageGuard")?.style.display || "missing",
      title: document.title,
      text: document.body?.innerText?.slice(0, 240) || "",
    })).catch(() => ({}));
    throw new Error(`${profile.label} · ${id}: ładowanie strony nie zakończyło się w 8 s; ${JSON.stringify({ ...diagnostics, pageErrors })}`);
  }
  // initPage może zatrzymać stronę na globalnym komunikacie. Zamykamy takie
  // blokady, ale nie zapisujemy ich jako dodatkowych stanów galerii; lista
  // zrzutów modalnych jest wymuszona jawnie w additionalStates().
  let contentReady = true;
  await page.waitForFunction(() => {
    const rating = document.getElementById("ratingOverlay");
    if (rating) {
      const style = getComputedStyle(rating);
      if (!rating.hidden && style.display !== "none" && style.visibility !== "hidden" && rating.getClientRects().length) return true;
    }
    const genericModal = [...document.querySelectorAll(".overlay .modal")].find((item) => {
      const style = getComputedStyle(item);
      return !item.hidden && style.display !== "none" && style.visibility !== "hidden"
        && item.getClientRects().length && item.querySelector("button");
    });
    if (genericModal) return true;
    const guard = document.getElementById("pageGuard");
    if (guard?.style.display === "flex" && guard.dataset.state) return true;
    const steps = [...document.querySelectorAll("[data-skel-step]")].filter((step) => {
      for (let node = step; node && node !== document.body; node = node.parentElement) {
        if (node.hidden || getComputedStyle(node).display === "none") return false;
      }
      return step.classList.contains("skel-step-ready") || step.getClientRects().length > 0;
    });
    return steps.length > 0 && steps.every((step) => step.classList.contains("skel-step-ready"));
  }, null, { timeout: 20_000 }).catch(() => { contentReady = false; });
  await dismissBlockingModal(page, profile, id);
  try {
    await page.waitForFunction(() => {
      const root = document.documentElement;
      const overlay = document.getElementById("pageGuard");
      const guarded = overlay?.style.display === "flex" && Boolean(overlay.dataset.state);
      const resourceGuard = document.getElementById("resourceLockGuard");
      const resourceBlocked = resourceGuard && getComputedStyle(resourceGuard).display !== "none"
        && getComputedStyle(resourceGuard).visibility !== "hidden";
      if (guarded || resourceBlocked) return true;
      const visibleSteps = [...document.querySelectorAll("[data-skel-step]")].filter((step) => {
        for (let node = step; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || style.display === "none") return false;
        }
        // Gotowy etap może mieć zerowy własny rect (np. kontener siatki
        // logowania), ale jego treść i tak jest już odsłonięta.
        return step.classList.contains("skel-step-ready") || step.getClientRects().length > 0;
      });
      return visibleSteps.length > 0 && visibleSteps.every((step) => step.classList.contains("skel-step-ready"));
    }, null, { timeout: 20_000 });
  } catch {
    contentReady = false;
    console.log(`[e20-gallery] ${profile.id} · ${id}: limit oczekiwania na etap treści; zapisuję widoczny stan aplikacji.`);
  }
  if (readySelector) {
    await page.waitForFunction((selector) => {
      const html = document.documentElement;
      const guarded = html.dataset.deviceGuard && html.dataset.deviceGuard !== "ok"
        && document.getElementById("pageGuard")?.style.display === "flex";
      return guarded || [...document.querySelectorAll(selector)].some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
      });
    }, readySelector, { timeout: 20_000 }).catch(() => {
      contentReady = false;
      console.log(`[e20-gallery] ${profile.id} · ${id}: brak elementu ${readySelector}; zapisuję widoczny stan aplikacji.`);
    });
  }
  if (options.waitForReady && contentReady) await options.waitForReady(page);
  const pollPageHasId = id === "polls" && /[?&]id=/.test(href);
  const pollBlockedByDeviceGuard = pollPageHasId && await page.evaluate(() => {
    const guard = document.getElementById("pageGuard");
    const state = document.documentElement.dataset.deviceGuard || "";
    return Boolean(guard && state && state !== "ok"
      && getComputedStyle(guard).display !== "none" && guard.getClientRects().length);
  });
  let pollContentReady = false;
  if (pollPageHasId && !pollBlockedByDeviceGuard) {
    // Strona właściciela może chwilowo pokazać rzeczywistą blokadę edycji
    // pozostawioną przez poprzednią kartę galerii. resource-lock.js sam
    // ponawia próbę po zwolnieniu zasobu (lub wygaśnięciu TTL); czekamy na
    // ten stan, zamiast archiwizować ekran blokady jako widok ankiety.
    await page.waitForFunction(() => {
      const guard = document.getElementById("resourceLockGuard");
      return !guard || getComputedStyle(guard).display === "none"
        || getComputedStyle(guard).visibility === "hidden";
    }, null, { timeout: 150_000 }).catch(() => {
      contentReady = false;
      console.log(`[e20-gallery] ${profile.id} · polls: zasób Demo pozostał zablokowany; nie zapisuję ekranu blokady jako ankiety.`);
    });
    await page.waitForFunction(() => {
      const load = document.getElementById("pollLoadState");
      const main = document.getElementById("cardMain");
      const bar = document.getElementById("pollBar");
      const results = document.getElementById("resultsList");
      const meta = document.getElementById("resultsMeta");
      const visible = (element) => element && !element.hidden
        && getComputedStyle(element).display !== "none"
        && element.getClientRects().length > 0;
      const resultsSelected = document.getElementById("tabResults")?.getAttribute("aria-selected") === "true";
      const recipientsSelected = document.getElementById("tabRecipients")?.getAttribute("aria-selected") === "true";
      const sectionReady = resultsSelected
        ? visible(document.getElementById("secResults")) && Boolean(meta?.textContent.trim())
        : visible(document.getElementById("secShare"))
          || (recipientsSelected && document.getElementById("pollTabsCard")?.classList.contains("mobile-recipients-active"));
      return load?.hidden && visible(main) && visible(bar) && sectionReady
        && Boolean(document.getElementById("pollGameName")?.textContent.trim())
        && results?.classList.contains("skel-step-ready")
        && Boolean(document.getElementById("pollStateWord")?.textContent.trim());
    }, null, { timeout: 30_000 }).then(() => {
      pollContentReady = true;
      contentReady = true;
    }).catch(() => {
      contentReady = false;
      console.log(`[e20-gallery] ${profile.id} · polls: brak gotowej ankiety Demo; zrzut nie będzie oznaczony jako stabilny.`);
    });
  }
  // Dane aplikacji są już potwierdzone przez gotowe etapy i readySelector.
  // Nie wymagamy pełnej ciszy sieci: urządzenia gry mają heartbeat, a listy
  // mogą odpytywać backend mimo gotowej treści.
  let contentStable = true;
  try {
    if (!contentReady) throw new Error("etap treści nie jest gotowy");
    await page.waitForLoadState("networkidle", { timeout: 1_000 }).catch(() => {});
    await page.waitForFunction(() => {
      const body = document.body;
      if (!body) return false;
      const pendingImage = [...document.images].some((image) => image.getClientRects().length && !image.complete);
      if (pendingImage) return false;
      const pendingText = /^(ładowanie|ładuję|wczytuję|loading|please wait)[.…\s]*$/i;
      const visibleLoading = [...body.querySelectorAll("[aria-busy='true'], .loading, .skeleton, .skel")]
        .some((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      const textLoading = [...body.querySelectorAll("body *")].some((el) => {
        if (el.children.length || !el.getClientRects().length) return false;
        return pendingText.test((el.textContent || "").trim());
      });
      return !visibleLoading && !textLoading;
    }, null, { timeout: 20_000 });
    await page.evaluate(() => Promise.all([
      Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 5_000))]),
      ...[...document.images].filter((image) => image.complete && image.decode).map((image) => image.decode().catch(() => {})),
    ]));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  } catch {
    contentStable = false;
    console.log(`[e20-gallery] ${profile.id} · ${id}: treść nie osiągnęła stabilnego stanu; zapisuję widoczny stan aplikacji.`);
  }
  if (pollContentReady) {
    // Polls używa odpytywania na żywo, które może utrzymywać ogólną klasę
    // loading mimo zakończonego RPC. Własny sygnał wyników (gotowa lista i
    // meta po get_poll_preview) jest tu wiarygodniejszy niż globalny skaner.
    await page.evaluate(() => Promise.all([
      Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 5_000))]),
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ]));
    contentStable = true;
  }
  if (pollPageHasId && !pollBlockedByDeviceGuard && !pollContentReady) {
    const diagnostics = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      requestedGameId: new URLSearchParams(location.search).get("id"),
      text: document.body?.innerText?.slice(0, 500) || "",
      load: document.getElementById("pollLoadMessage")?.textContent?.trim() || "",
      guard: document.getElementById("resourceLockGuard")?.innerText?.trim().slice(0, 240) || "",
      status: document.getElementById("pollStateWord")?.textContent?.trim() || "",
      game: document.getElementById("pollGameName")?.textContent?.trim() || "",
      loadHidden: document.getElementById("pollLoadState")?.hidden ?? null,
      selectedTab: [...document.querySelectorAll("#pollTabs [aria-selected='true']")].map((item) => item.id),
      resultMeta: document.getElementById("resultsMeta")?.textContent?.trim() || "",
    }));
    throw new Error(`${profile.label} · polls: ankieta nie osiągnęła stabilnego widoku z rzeczywistymi danymi; oczekiwano „${options.expectedPollName || "nieznanej ankiety"}”; ${JSON.stringify(diagnostics)}`);
  }
  const blockedByGuard = await page.evaluate(() => {
    const state = document.documentElement.dataset.deviceGuard || "";
    const pageGuard = document.getElementById("pageGuard");
    const resourceGuard = document.getElementById("resourceLockGuard");
    const visible = (element) => element && getComputedStyle(element).display !== "none"
      && getComputedStyle(element).visibility !== "hidden" && element.getClientRects().length > 0;
    return Boolean((state !== "" && state !== "ok" && pageGuard?.style.display === "flex") || visible(resourceGuard));
  });
  const allowSpecificModalPreparation = options.allowInitialSkeletonTimeout === true;
  if (prepare && (!contentReady || blockedByGuard) && !(allowSpecificModalPreparation && !blockedByGuard)) {
    throw new Error(`${profile.label} · ${id}: nie można otworzyć wymaganego stanu „${options.actionLabel || options.stateId || "widok"}” — treść nie jest gotowa lub strona jest zablokowana`);
  }
  // Stany interaktywne nie zastępują guarda: na niedostępnym urządzeniu
  // zapisujemy ten guard zamiast wymuszać klik w ukryty zasób.
  let preparedState = null;
  if (prepare && !blockedByGuard && (contentReady || allowSpecificModalPreparation)) {
    await dismissBlockingModal(page, profile, id);
    preparedState = await prepare(page);
    if (options.expectedModalId) {
      try {
        await page.locator(`#${options.expectedModalId}`).waitFor({ state: "visible", timeout: 15_000 });
      } catch (error) {
        const modalDiagnostics = await page.evaluate(() => ({
          visibleOverlays: [...document.querySelectorAll(".overlay, [role=dialog]")]
            .filter((element) => element.getClientRects().length && getComputedStyle(element).display !== "none")
            .map((element) => ({ id: element.id, className: element.className, text: element.innerText.trim().slice(0, 180) })),
          selectedRows: [...document.querySelectorAll('#list .row.is-selected')].map((row) => ({ kind: row.dataset.kind, id: row.dataset.id })),
          selectedBaseTiles: [...document.querySelectorAll(".tile.selected[data-base-id]")].map((tile) => ({ id: tile.dataset.baseId, text: tile.querySelector(".name")?.textContent?.trim() || "" })),
          exportButtonDisabled: document.querySelector("#btnExport")?.disabled ?? null,
          tagActionDisabled: document.querySelector('#toolbar [data-act="editTags"]')?.disabled ?? null,
        }));
        throw new Error(`${profile.label} · ${id}: modale #${options.expectedModalId} nie otworzył się po akcji; ${JSON.stringify({ ...modalDiagnostics, pageErrors })}; ${error.message}`);
      }
    }
    if (options.expectedVisibleSelector) {
      await page.locator(options.expectedVisibleSelector).waitFor({ state: "visible", timeout: 15_000 });
    }
    if (allowSpecificModalPreparation && (options.expectedModalId || options.expectedVisibleSelector)) {
      // W Base Explorer globalne etapy skeletonu potrafią pozostać niegotowe,
      // mimo że konkretne, wymagane okno jest już otwarte i zweryfikowane.
      // Stan modala ma własny, jawny warunek gotowości.
      contentReady = true;
      contentStable = true;
    }
  }
  const expectedSafe = profile.safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const actualSafe = await page.evaluate(() => {
    const root = document.documentElement;
    return Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [
      side,
      Number.parseFloat(root.style.getPropertyValue(`--e20-safe-area-inset-${side}`)) || 0,
    ]));
  });
  if (profile.safe) {
    const injected = await page.locator("html").getAttribute("data-e20-safe-area-injected");
    if (injected !== "true") throw new Error(`${profile.label} · ${id}: skrypt galerii nie wstrzyknął safe area`);
  }
  for (const side of ["top", "right", "bottom", "left"]) {
    if (actualSafe[side] !== expectedSafe[side]) {
      throw new Error(`${profile.label} · ${id}: safe area ${side}=${actualSafe[side]}px, oczekiwano ${expectedSafe[side]}px`);
    }
  }
  const safeGeometry = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar");
    const footer = document.querySelector(".footer");
    const number = (value) => Number.parseFloat(value) || 0;
    const style = topbar ? getComputedStyle(topbar) : null;
    const footerStyle = footer ? getComputedStyle(footer) : null;
    const rect = topbar?.getBoundingClientRect();
    return {
      topbarTop: rect?.top ?? null,
      topbarPadding: style ? {
        top: number(style.paddingTop), right: number(style.paddingRight), bottom: number(style.paddingBottom), left: number(style.paddingLeft),
      } : null,
      footerPaddingBottom: footerStyle && footerStyle.position !== "fixed" ? number(footerStyle.paddingBottom) : null,
      footerBottom: footerStyle?.position === "fixed" ? number(footerStyle.bottom) : null,
    };
  });
  if (safeGeometry.topbarTop !== null && safeGeometry.topbarTop !== 0) {
    throw new Error(`${profile.label} · ${id}: topbar nie rozciąga tła od krawędzi ekranu (${safeGeometry.topbarTop}px)`);
  }
  // Górny pasek nie zajmuje dolnej krawędzi ekranu. Dolny inset sprawdzamy
  // osobno na stopce; pozostałe trzy krawędzie topbara muszą chronić treść.
  for (const side of ["top", "right", "left"]) {
    if (safeGeometry.topbarPadding && safeGeometry.topbarPadding[side] + 0.5 < expectedSafe[side]) {
      throw new Error(`${profile.label} · ${id}: topbar ${side} safe area=${safeGeometry.topbarPadding[side]}px, oczekiwano co najmniej ${expectedSafe[side]}px`);
    }
  }
  if (safeGeometry.footerPaddingBottom !== null && safeGeometry.footerPaddingBottom + 0.5 < expectedSafe.bottom) {
    throw new Error(`${profile.label} · ${id}: stopka nie uwzględnia dolnej safe area (${safeGeometry.footerPaddingBottom}px < ${expectedSafe.bottom}px)`);
  }
  if (safeGeometry.footerBottom !== null && safeGeometry.footerBottom + 0.5 < expectedSafe.bottom) {
    throw new Error(`${profile.label} · ${id}: pływająca stopka nie uwzględnia dolnej safe area (${safeGeometry.footerBottom}px < ${expectedSafe.bottom}px)`);
  }
  const state = await page.evaluate(() => ({
    guard: document.documentElement.dataset.deviceGuard || document.getElementById("pageGuard")?.dataset.state || "",
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    bodyHeight: document.body?.scrollHeight || 0,
    pageText: document.body?.innerText?.slice(0, 500) || "",
    loading: document.documentElement.classList.contains("page-loading"),
    listHeaderActionsBelow: document.querySelector("main .bar")?.classList.contains("has-actions-below") || false,
    listBottomLayout: document.querySelector(".games-bottom")?.classList.contains("is-single-row")
      ? "single-row"
      : document.querySelector(".games-bottom")?.classList.contains("is-balanced-wrap") ? "balanced-wrap" : "not-measured",
    listBottomTextLabels: [...document.querySelectorAll(".games-bottom-right .only-desktop")]
      .some((label) => label.getClientRects().length > 0),
    listBottomMetrics: (() => {
      const bar = document.querySelector(".games-bottom");
      const naturalWidth = (group) => {
        if (!group) return 0;
        const widths = [...group.children].filter((child) => child.getClientRects().length)
          .map((child) => child.getBoundingClientRect().width);
        const style = getComputedStyle(group);
        const gap = Number.parseFloat(style.columnGap || style.gap) || 0;
        const width = widths.reduce((total, itemWidth) => total + itemWidth, 0) + Math.max(0, widths.length - 1) * gap;
        return width;
      };
      const rowSizes = (group) => {
        if (!group) return [];
        const rows = new Map();
        for (const child of group.children) {
          if (!child.getClientRects().length) continue;
          const top = Math.round(child.getBoundingClientRect().top);
          rows.set(top, (rows.get(top) || 0) + 1);
        }
        return [...rows.values()];
      };
      if (!bar) return null;
      const left = bar.querySelector(":scope > .games-bottom-left");
      const right = bar.querySelector(":scope > .games-bottom-right");
      return {
        available: bar.clientWidth,
        left: naturalWidth(left),
        right: naturalWidth(right),
        groupGap: Number.parseFloat(getComputedStyle(bar).columnGap || getComputedStyle(bar).gap) || 0,
        leftRows: rowSizes(left),
        rightRows: rowSizes(right),
      };
    })(),
  }));
  if (state.scrollWidth > state.viewportWidth + 1) {
    throw new Error(`${profile.label} · ${id}: poziomy overflow ${state.scrollWidth}px przy viewport ${state.viewportWidth}px`);
  }
  if (contentReady && ["games", "bases", "logos"].includes(id) && state.listBottomMetrics?.available > 0) {
    if (profile.width >= 1133 && state.listHeaderActionsBelow) {
      throw new Error(`${profile.label} · ${id}: pasek nagłówka przeniósł akcje mimo szerokiego ekranu`);
    }
    const fitsSingleRow = state.listBottomMetrics
      && state.listBottomMetrics.left + state.listBottomMetrics.right + state.listBottomMetrics.groupGap <= state.listBottomMetrics.available + 1;
    if (fitsSingleRow && state.listBottomLayout !== "single-row") {
      throw new Error(`${profile.label} · ${id}: dolny pasek zawinął się, choć mieści się w jednym wierszu; ${JSON.stringify(state.listBottomMetrics)}`);
    }
    if (!fitsSingleRow && state.listBottomLayout !== "balanced-wrap") {
        throw new Error(`${profile.label} · ${id}: dolny pasek nie zastosował równomiernego zawinięcia; ${JSON.stringify(state.listBottomMetrics)}`);
    }
    if (state.listBottomTextLabels && state.listBottomMetrics) {
      const longestGroup = Math.max(state.listBottomMetrics.leftRows.length, state.listBottomMetrics.rightRows.length);
      if (longestGroup > 2) {
        throw new Error(`${profile.label} · ${id}: tekstowe przyciski paska filtrów/akcji tworzą więcej niż dwa rzędy zamiast przejść do ikon; ${JSON.stringify(state.listBottomMetrics)}`);
      }
    }
    if (profile.width >= 744) {
      const { available, left, right, groupGap } = state.listBottomMetrics;
      console.log(`[e20-layout] ${profile.id} · ${id}: naturalne ${Math.round(left + right + groupGap)}px / dostępne ${available}px; ${state.listBottomLayout}; akcje pod nagłówkiem=${state.listHeaderActionsBelow}`);
    }
  }
  const modalIds = await pageModalIds(page).catch(() => []);
  if (options.requireModal && !modalIds.length) {
    throw new Error(`${profile.label} · ${id}: akcja „${options.actionLabel || "?"}” nie otworzyła prawdziwego modala`);
  }
  if (options.expectedModalId && !modalIds.includes(options.expectedModalId)) {
    throw new Error(`${profile.label} · ${id}: oczekiwano modala #${options.expectedModalId}, widoczne: ${modalIds.join(", ") || "brak"}`);
  }
  if (options.expectedVisibleSelector && !await page.locator(options.expectedVisibleSelector).isVisible().catch(() => false)) {
    throw new Error(`${profile.label} · ${id}: oczekiwano widocznej warstwy ${options.expectedVisibleSelector}`);
  }
  const safeModalName = (modalIds[0] || "dialog").replace(/[^a-zA-Z0-9_-]/g, "-");
  const fileName = options.fileName || (options.modalCapture
    ? `modal-${safeModalName}-${profile.id}.png`
    : options.stateId ? `${options.stateId}-${profile.id}.png` : `${profile.id}.png`);
  const finalUrl = page.url();
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  // Każdy plik ma przedstawiać rzeczywisty ekran urządzenia. Pełnostronicowe
  // zrzuty na długich/animowanych widokach wisiały w Chromium po 45 s; wysokość
  // całej strony pozostaje w manifeście, a screenshot zachowuje viewport i safe area.
  await saveDeviceScreenshot(page, profile, id, path.join(OUT, id, fileName), Boolean(options.modalCapture));
  expect(page.context().pages(), `${profile.label} · ${id}: otwarto równoległą kartę`).toHaveLength(1);
  page.off("pageerror", onPageError);
  console.log(`[e20-gallery] ${profile.id}: captured ${id}`);
  manifest.push({
    id,
    ...(options.stateId || (options.modalCapture && modalIds[0]) ? { stateId: options.stateId || `modal:${modalIds[0]}` } : {}),
    profile: profile.id,
    label: profile.label,
    safeAreaInsets: expectedSafe,
    url: href,
    finalUrl,
    ...(options.actionLabel ? { actionLabel: options.actionLabel } : {}),
    file: `${id}/${fileName}`,
    contentReady,
    contentStable,
    blockedByGuard,
    ...state,
  });
  // Checkpoint after every image so a failed profile still leaves useful work.
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(MANIFEST_DIR, `manifest-${profile.id}.json`), JSON.stringify(manifest, null, 2));
  return { modalIds, blockedByGuard, preparedState };
}

// Profile są rozdzielone między istniejące konta. Każde konto robi swoje
// widoki i urządzenia po kolei, a niezależne konta mogą pracować równolegle.
// To usuwa współbieżność blokad zasobów bez tworzenia osobnego konta galerii.
test.describe.configure({ mode: "parallel" });
test.setTimeout(requestedPages.length ? 5 * 60 * 1000 : requestedProfiles.length === 1 ? 15 * 60 * 1000 : 30 * 60 * 1000);
test.use({ serviceWorkers: "block" });

const selectedProfiles = PROFILES.filter((item) => !requestedProfiles.length || requestedProfiles.includes(item.id));
for (const [accountIndex, accountNumber] of requestedAccounts.entries()) {
  const accountProfiles = selectedProfiles.filter((_, profileIndex) => profileIndex % requestedAccounts.length === accountIndex);
  if (!accountProfiles.length) continue;
  test(`E20 gallery · test${accountNumber} · ${accountProfiles.map((profile) => profile.id).join(", ")}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const files = galleryAccountPaths(accountNumber);
    if (!fs.existsSync(files.data) || !fs.existsSync(files.authState)) {
      throw new Error(`Brak przygotowanej sesji lub odczytu danych konta test${accountNumber}; uruchom krok Prepare E20 session`);
    }
    const data = JSON.parse(fs.readFileSync(files.data, "utf8"));
    for (const profile of accountProfiles) {
      const viewport = { width: profile.width, height: profile.height };
      const deviceOptions = {
        viewport, screen: profile.screen || viewport, deviceScaleFactor: profile.scale,
        isMobile: profile.mobile, hasTouch: profile.touch,
        ...(profile.ua ? { userAgent: profile.ua } : {}), serviceWorkers: "block",
      };
      const manifest = [];
      const selectedUrls = urls(data)
        .filter(([id]) => !requestedPages.length || requestedPages.includes(id));

      // Home/Login są publiczne: fotografujemy je w jednej tymczasowej
      // niezalogowanej sesji, zamykamy ją, a dopiero potem otwieramy sesję
      // konta. Nie uruchamiamy testów guarda gościa ani dwóch stron naraz.
      // Te strony mogą wylogować aktywną sesję. To publiczne przepływy
      // logowania, więc fotografujemy je przed prywatnymi stronami.
      const publicUrls = selectedUrls.filter(([id]) => ["home", "login", "login-confirm", "login-reset"].includes(id));
      if (publicUrls.length) {
        const publicContext = await browser.newContext(deviceOptions);
        try {
          await withE2EBypass(publicContext);
          await serveBranchCode(publicContext, { pages: PAGES, safeAreaInsets: profile.safe });
          await publicContext.route(/^https:\/\/www\.familiada\.online\/login\/?(?:\?.*)?$/, serveBranchLoginHtml);
          const publicPage = await publicContext.newPage();
          publicPage.setDefaultTimeout(20_000);
          publicPage.setDefaultNavigationTimeout(20_000);
          for (const [id, href] of publicUrls) await capture(publicPage, profile, id, href, manifest);
        } finally {
          await publicContext.close();
        }
      }

      const context = await browser.newContext({ ...deviceOptions, storageState: files.authState });
      try {
        await withE2EBypass(context);
        await serveBranchCode(context, { pages: PAGES, safeAreaInsets: profile.safe });
        await context.route(/^https:\/\/www\.familiada\.online\/login\/?(?:\?.*)?$/, serveBranchLoginHtml);
        let page = await context.newPage();
        page.setDefaultTimeout(20_000);
        page.setDefaultNavigationTimeout(20_000);
        for (const [id, href] of selectedUrls) {
          if (["home", "login", "login-confirm", "login-reset"].includes(id)) continue;
          const readySelector = id === "games"
            ? data.game ? `.card[data-game-id="${data.game.id}"]` : null
            : id === "bases"
              ? data.base ? `.tile[data-base-id="${data.base.id}"]` : null
              : id === "logos"
                ? (data.logos.text || data.logos.draw || data.logos.image)
                  ? `.logoTile[data-key="${(data.logos.text || data.logos.draw || data.logos.image).id}"]` : null
                : null;
          const isControl = id === "control";
          const isBaseExplorer = id === "base-explorer";
          const baseState = await capture(page, profile, id, href, manifest, null, readySelector, id === "control" ? {
            waitForReady: async (controlPage) => {
              const unavailable = await controlPage.evaluate(() => {
                const state = document.documentElement.dataset.deviceGuard || "";
                const pageGuard = document.getElementById("pageGuard");
                const resourceGuard = document.getElementById("resourceLockGuard");
                const visible = (element) => element && getComputedStyle(element).display !== "none"
                  && getComputedStyle(element).visibility !== "hidden" && element.getClientRects().length > 0;
                return (state !== "" && state !== "ok" && pageGuard?.style.display === "flex") || visible(resourceGuard);
              });
              if (unavailable) return;
              await restartControlToDevices(controlPage);
              const code = controlPage.locator('#app .device-row[data-device="display"] .device-connect-code-val');
              await code.waitFor({ state: "visible", timeout: 20_000 });
              await controlPage.waitForFunction(() =>
                /^\d{6}$/.test(document.querySelector('#app .device-row[data-device="display"] .device-connect-code-val')?.textContent?.trim() || ""),
              null, { timeout: 20_000 });
              data.connectPreviewCode = (await code.innerText()).trim();
            },
          } : id === "polls" ? {
            expectedPollName: data.polls.poll_open_demo?.name || null,
          } : {});
          if (id === "control") {
            if (profile.width < 980) {
              expect(baseState.blockedByGuard, `${profile.label} · Control should show its minimum-width guard`)
                .toBe(true);
            } else {
              expect(baseState.blockedByGuard, `${profile.label} · Control should be available at this width`)
                .toBe(false);
            }
          }
          if (isBaseExplorer && !baseState.blockedByGuard) {
            const tagShots = [
              {
                stateId: "modal:tags-assign",
                fileName: `modal-tags-assign-${profile.id}.png`,
                layerId: "tagsL1",
                actionLabel: "Tagi → przypisz",
                prepare: async (modalPage) => {
                  const action = modalPage.locator('#toolbar [data-act="editTags"]');
                  await action.waitFor({ state: "visible", timeout: 5_000 });
                  const target = await findUnlockedQuestionAcrossBases(modalPage, data);
                  if (!target) throw new Error("W żadnej z baz konta nie ma pytania, którego blokadę można legalnie uzyskać; nie podstawiam fikcyjnego stanu.");
                  await modalPage.goto(`${ORIGIN}/bases/explorer/?id=${target.base.id}&lang=pl`, { waitUntil: "domcontentloaded", timeout: 20_000 });
                  await modalPage.waitForFunction(() => !document.documentElement.classList.contains("page-loading"), null, { timeout: 20_000 });
                  await openQuestionInBaseFolder(modalPage, target.base.id, target.question);
                  await action.click();
                  await modalPage.locator("#tagsOverlay").waitFor({ state: "visible", timeout: 10_000 });
                },
              },
              {
                stateId: "modal:tags-create",
                fileName: `modal-tags-create-${profile.id}.png`,
                layerId: "tagsL2",
                actionLabel: "Tagi → dodaj tag",
                prepare: async (modalPage) => {
                  const drawer = modalPage.locator("#btnDrawerToggle");
                  if (await drawer.isVisible().catch(() => false)) await drawer.click();
                  await modalPage.locator("#btnAddTag").click();
                },
              },
              {
                stateId: "modal:tags-color",
                fileName: `modal-tags-color-${profile.id}.png`,
                layerId: "tagsL3",
                actionLabel: "Tagi → dodaj tag → wybierz kolor",
                prepare: async (modalPage) => {
                  const drawer = modalPage.locator("#btnDrawerToggle");
                  if (await drawer.isVisible().catch(() => false)) await drawer.click();
                  await modalPage.locator("#btnAddTag").click();
                  await modalPage.locator("#tagsEditColorTile").click();
                },
              },
            ];
            // Najpierw warstwy dostępne bez zaznaczenia rekordu; przypisanie
            // wymaga istniejącego pytania i jego blokady edycji.
            tagShots.push(tagShots.shift());
            for (const shot of tagShots) {
              await page.close();
              page = await context.newPage();
              page.setDefaultTimeout(20_000);
              page.setDefaultNavigationTimeout(20_000);
              await capture(
                page, profile, id, href, manifest, shot.prepare, null,
                {
                  modalCapture: true,
                  requireModal: true,
                  expectedModalId: "tagsOverlay",
                  actionLabel: shot.actionLabel,
                  stateId: shot.stateId,
                  fileName: shot.fileName,
                  expectedVisibleSelector: `#${shot.layerId}`,
                },
              );
            }
          }
          if (isControl && !baseState.blockedByGuard) {
            await page.close();
            page = await context.newPage();
            page.setDefaultTimeout(20_000);
            page.setDefaultNavigationTimeout(20_000);
            await capture(
              page, profile, id, href, manifest,
              async (modalPage) => {
                await restartControlToDevices(modalPage);
                const shareButton = modalPage.locator('#app .device-row[data-device="display"] button')
                  .filter({ hasText: /Udostępnij/ }).first();
                await shareButton.waitFor({ state: "visible", timeout: 15_000 });
                await shareButton.click();
              },
              null,
              { modalCapture: true, requireModal: true, expectedModalId: "shareDeviceOverlay", actionLabel: "Urządzenia → Udostępnij urządzenie", stateId: "modal:share-device", fileName: `modal-share-device-${profile.id}.png` },
            );
          }
        }
        const guardedPages = new Set(manifest
          .filter((entry) => entry.profile === profile.id && !entry.stateId && entry.blockedByGuard)
          .map((entry) => entry.id));
        const extra = additionalStates(data).filter((state) =>
          (!requestedPages.length || requestedPages.includes(state.page))
          && !guardedPages.has(state.page)
          // Widoki „mobile” dopasowują się do rzeczywistych breakpointów;
          // łącznie z iPhone landscape (niska wysokość) i bez iPada landscape.
          && (!state.mobileOnly || (profile.mobile && (profile.width <= 1100 || profile.height <= 720)))
          && (!state.maxWidth || profile.width <= state.maxWidth));
        if (extra.length) {
          // Podstawowe strony mogą zostawić stan karty lub heartbeat blokady.
          // Zamykamy ją całkowicie i stany dodatkowe fotografujemy w nowej,
          // pojedynczej karcie, nadal sekwencyjnie.
          await page.close();
          page = await context.newPage();
          page.setDefaultTimeout(20_000);
          page.setDefaultNavigationTimeout(20_000);
        }
        for (const state of extra) {
          const stateOptions = {
            stateId: state.stateId,
            ...(state.id === "base-explorer" ? { allowInitialSkeletonTimeout: true } : {}),
            ...(state.actionLabel ? { actionLabel: state.actionLabel } : {}),
            ...(state.modalCapture ? {
              modalCapture: true,
              requireModal: true,
              actionLabel: state.actionLabel,
              fileName: `modal-${state.stateId.replace(/^modal:/, "")}-${profile.id}.png`,
            } : {}),
            ...(state.expectedModalId ? { expectedModalId: state.expectedModalId } : {}),
            ...(state.expectedVisibleSelector ? { expectedVisibleSelector: state.expectedVisibleSelector } : {}),
          };
          try {
            await capture(page, profile, state.id, state.href, manifest, state.prepare, null, stateOptions);
          } finally {
            if (state.cleanup) await state.cleanup(page);
          }
        }
        expect(manifest.filter((entry) => !entry.stateId)).toHaveLength(selectedUrls.length);
        const layoutIssues = manifest.filter((entry) => entry.scrollWidth > entry.viewportWidth + 1);
        expect(layoutIssues, `Poziomy overflow: ${JSON.stringify(layoutIssues.map(({ id, url, scrollWidth, viewportWidth }) => ({ id, url, scrollWidth, viewportWidth })))}`).toEqual([]);
        const incomplete = manifest.filter((entry) => entry.contentReady === false || entry.contentStable === false);
        if (incomplete.length) {
          console.log(`[e20-gallery] ${profile.id}: ${incomplete.length} widoków zapisano w stanie ładowania aplikacji (${[...new Set(incomplete.map((entry) => entry.id))].join(", ")}).`);
        }
      } finally {
        await context.close();
      }
    }
  });
}
