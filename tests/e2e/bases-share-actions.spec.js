// Udostępnianie baz (podręcznik 12.2–12.5): błędne i podejrzane działania.
// Okno „Udostępnij”: siebie, nieistniejąca lub niepełna nazwa, adres bez
// konta, puste pole, kilku odbiorców naraz (jedno uprawnienie), ponowne
// zaproszenie oczekującej osoby i osoby z dostępem. Uprawnienia: osoba
// z edycją, z podglądem i obca nie udostępnią, nie zmienią nazwy, nie usuną
// bazy ani ról; obcy nie przyjmie cudzego zaproszenia. Strony z kodu brancha,
// baza produkcyjna; maile nie są wysyłane (send-mail podmieniony
// w przeglądarce). Działa także lokalnie (scripts/agent-tools/local-e2e).
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { acceptBaseShare } = require("./helpers/base-sharing");

test.use({ serviceWorkers: "block", needs: { standard: 3, noaccount: 1 } });
test.describe.configure({ mode: "serial" });

const SITE = "https://www.familijna.app";

async function user(browser, loginAs, identity) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["bases"] });
  await context.route("**/functions/v1/send-mail", (route) => route.fulfill({
    json: { ok: true, queued: false, results: [{ ok: true, queued: false, skipped: "e2e" }] },
  }));
  const page = await context.newPage();
  await loginAs(page, context, identity);
  const { id, name } = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const id = (await sb.auth.getUser()).data.user.id;
    const { data } = await sb.from("profiles").select("username").eq("id", id).single();
    return { id, name: data?.username };
  });
  return { context, page, id, name, email: identity.email };
}
async function rpc(page, name, args = {}) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }, { name, args });
}
const first = (data) => (Array.isArray(data) ? data[0] : data);
async function createBase(page, name) {
  return page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb.from("question_bases").insert({ name, owner_id: u.user.id }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, name);
}
async function openShare(page, baseId) {
  await page.goto(`${SITE}/bases/`);
  await expect(page.locator("[data-skel-step]").first()).toHaveClass(/skel-step-ready/, { timeout: 30_000 });
  await page.locator(`#mineGrid [data-base-id="${baseId}"]`).click();
  await page.locator("#btnShareSend").click();
  await expect(page.locator("#shareSendOverlay")).toBeVisible();
  await expect(page.locator("#baseShareFriends .shareRow, #baseShareFriends .shareEmpty").first()).toBeVisible();
}
// Wpisany adres/nazwa + [Udostępnij]; zwraca odpowiedź base_share_by_user.
async function shareTo(page, lookup) {
  const box = page.locator("#appToast.show");
  if (await box.count()) await box.click();
  await page.locator("#shareEmail").fill(lookup);
  const response = page.waitForResponse((r) => r.url().endsWith("/rpc/base_share_by_user"));
  await page.locator("#btnShareAdd").click();
  return first(await (await response).json());
}
const toast = (page) => page.locator("#appToast");
const tasks = (page, baseId) => rpc(page, "list_base_share_tasks_outgoing", { p_base_id: baseId });

test("udostępnianie bazy: siebie, nieistniejąca lub niepełna nazwa, adres bez konta i puste pole -- okno zostaje z komunikatem", async ({ browser, accounts, loginAs }) => {
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const other = await user(browser, loginAs, accounts.standard[1]);
  let baseId = null;
  try {
    baseId = await createBase(owner.page, `E2E-BSA-WRONG-${Date.now()}`);
    await openShare(owner.page, baseId);
    // bez odbiorcy przycisk jest nieaktywny; same spacje też nie są odbiorcą
    await expect(owner.page.locator("#btnShareAdd")).toBeDisabled();
    await owner.page.locator("#shareEmail").fill("   ");
    await expect(owner.page.locator("#btnShareAdd")).toBeDisabled();

    for (const lookup of [owner.name, owner.email.toUpperCase()]) {
      expect(await shareTo(owner.page, lookup), lookup).toMatchObject({ ok: false, err: "owner" });
      await expect(toast(owner.page)).toContainText("Jesteś właścicielem tej bazy");
      await expect(owner.page.locator("#shareSendOverlay")).toBeVisible();
    }
    for (const lookup of [`e2e.brak-${Date.now()}`, other.name.slice(0, -1), accounts.noaccount[0].email]) {
      expect(await shareTo(owner.page, lookup), lookup).toMatchObject({ ok: false, err: "unknown_user" });
      await expect(toast(owner.page)).toContainText("Nie znam takiej nazwy użytkownika");
      await expect(owner.page.locator("#shareSendOverlay")).toBeVisible();
      await expect(owner.page.locator("#shareEmail")).toHaveValue(lookup);
    }
    expect(await tasks(owner.page, baseId)).toEqual([]);
  } finally {
    if (baseId) await owner.page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, baseId).catch(() => {});
    await owner.context.close();
    await other.context.close();
  }
});

test("udostępnianie bazy: kilku odbiorców z jednym uprawnieniem, ponownie oczekującej osobie i osobie z dostępem -- bez kopii", async ({ browser, accounts, loginAs }) => {
  test.setTimeout(120_000);
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const friend = await user(browser, loginAs, accounts.standard[1]);
  const other = await user(browser, loginAs, accounts.standard[2]);
  let baseId = null;
  try {
    await rpc(owner.page, "e2e_friendships_cleanup", { p_other_user_id: friend.id });
    const invite = await rpc(owner.page, "friends_invite", { p_handle: friend.email });
    expect((await rpc(friend.page, "friends_accept", { p_id: invite.id })).ok).toBe(true);
    baseId = await createBase(owner.page, `E2E-BSA-MANY-${Date.now()}`);
    await openShare(owner.page, baseId);
    await owner.page.locator(`#baseShareFriends [data-id="${friend.id}"] input`).check();
    await expect(owner.page.locator("#btnShareAdd")).toHaveText(/^\s*Udostępnij\s*$/);
    await owner.page.locator("#shareEmail").fill(other.name);
    await expect(owner.page.locator("#btnShareAdd")).toContainText("Udostępnij (2)");
    await owner.page.locator('#shareRole label:has(input[value="viewer"])').click();
    await owner.page.locator("#btnShareAdd").click();
    await expect(owner.page.locator("#shareSendOverlay")).toBeHidden();
    const sent = await tasks(owner.page, baseId);
    expect(sent.map((t) => [t.recipient_user_id, t.role, t.status]).sort()).toEqual(
      [[friend.id, "viewer", "pending"], [other.id, "viewer", "pending"]].sort());

    // ta sama osoba jeszcze raz: inną drogą (adres zamiast nazwy) -- nadal jedno zaproszenie
    await openShare(owner.page, baseId);
    // znajomy z oczekującym zaproszeniem nie jest już do zaznaczenia
    await expect(owner.page.locator(`#baseShareFriends [data-id="${friend.id}"]`)).toHaveCount(0);
    expect(await shareTo(owner.page, other.email)).toMatchObject({ ok: false, err: "already_pending" });
    await expect(toast(owner.page)).toContainText("Zaproszenie już oczekuje na akceptację.");
    await expect(owner.page.locator("#shareSendOverlay")).toBeVisible();

    // po przyjęciu: „ma już dostęp”, wciąż bez nowego zaproszenia
    const task = sent.find((t) => t.recipient_user_id === other.id);
    expect(await rpc(other.page, "base_share_accept", { p_task_id: task.task_id })).toBe(true);
    expect(await shareTo(owner.page, other.name)).toMatchObject({ ok: false, err: "already_active" });
    await expect(toast(owner.page)).toContainText("Ta osoba ma już dostęp do bazy.");
    expect((await tasks(owner.page, baseId)).filter((t) => t.recipient_user_id === other.id && ["pending", "opened"].includes(t.status))).toEqual([]);
    expect((await rpc(owner.page, "list_base_shares", { p_base_id: baseId })).map((s) => [s.user_id, s.role])).toEqual([[other.id, "viewer"]]);
  } finally {
    if (baseId) await owner.page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, baseId).catch(() => {});
    await rpc(owner.page, "e2e_friendships_cleanup", { p_other_user_id: friend.id }).catch(() => {});
    await owner.context.close();
    await friend.context.close();
    await other.context.close();
  }
});

test("bazy: osoba z edycją, z podglądem i obca nie udostępnią, nie zmienią nazwy, ról ani nie usuną bazy; obcy nie przyjmie cudzego zaproszenia", async ({ browser, accounts, loginAs }) => {
  test.setTimeout(120_000);
  const owner = await user(browser, loginAs, accounts.standard[0]);
  const editor = await user(browser, loginAs, accounts.standard[1]);
  const stranger = await user(browser, loginAs, accounts.standard[2]);
  let baseId = null;
  const bases = [];
  const name = `E2E-BSA-RIGHTS-${Date.now()}`;
  try {
    baseId = await createBase(owner.page, name);
    await acceptBaseShare(owner.page, editor.page, baseId, editor.id, "editor");
    for (const [actor, role] of [[editor, "editor"], [editor, "viewer"], [stranger, "obcy"]]) {
      if (role === "viewer") await acceptBaseShare(owner.page, editor.page, baseId, editor.id, "viewer");
      const label = `${role}`;
      expect(first(await rpc(actor.page, "base_share_by_user", { p_base_id: baseId, p_user_lookup: stranger.name, p_role: "editor" })), label).toMatchObject({ ok: false, err: "not_owner" });
      expect(first(await rpc(actor.page, "update_base_share_role", { p_base_id: baseId, p_user_id: editor.id, p_role: "editor" })), label).toMatchObject({ ok: false });
      expect(await rpc(actor.page, "rename_resource_checked", { p_resource_type: "base", p_resource_id: baseId, p_name: "PRZEJĘTA" }), label).toMatchObject({ ok: false });
      expect(await rpc(actor.page, "delete_resource_checked", { p_resource_type: "base", p_resource_id: baseId }), label).toMatchObject({ ok: false });
      const direct = await actor.page.evaluate(async (id) => {
        const sb = window.__sbClient;
        const upd = await sb.from("question_bases").update({ name: "PRZEJĘTA" }).eq("id", id).select("id");
        const del = await sb.from("question_bases").delete().eq("id", id).select("id");
        const share = await sb.from("question_base_shares").update({ role: "editor" }).eq("base_id", id).select("base_id");
        return { upd: upd.data?.length || 0, del: del.data?.length || 0, share: share.data?.length || 0 };
      }, baseId);
      expect(direct, label).toEqual({ upd: 0, del: 0, share: 0 });
    }
    const base = await owner.page.evaluate(async (id) => (await window.__sbClient.from("question_bases").select("name").eq("id", id).single()).data, baseId);
    expect(base.name).toBe(name);
    expect((await rpc(owner.page, "list_base_shares", { p_base_id: baseId })).map((s) => s.role)).toEqual(["viewer"]);

    // właściciel nie „opuści” własnej bazy; rezygnacja odbiorcy ([Usuń z listy])
    // działa jak odmowa -- właściciel nie zaprosi go ponownie przez 30 dni
    expect(await rpc(owner.page, "leave_shared_base", { p_base_id: baseId })).toBe(false);
    expect(await rpc(editor.page, "leave_shared_base", { p_base_id: baseId })).toBe(true);
    expect((await rpc(editor.page, "list_shared_bases_ext")).map((b) => b.id)).not.toContain(baseId);
    const again = first(await rpc(owner.page, "base_share_by_user", { p_base_id: baseId, p_user_lookup: editor.email, p_role: "viewer" }));
    expect(again, JSON.stringify(again)).toMatchObject({ ok: false, err: "declined" });
    expect(Date.parse(again.cooldown_until) - Date.now()).toBeGreaterThan(29 * 86400_000);

    // zaproszenie dla innej osoby (nowa baza): obcy nie przyjmie, nie odrzuci i nie zmieni roli
    const nextId = await createBase(owner.page, `${name}-NEXT`);
    bases.push(nextId);
    const sent = first(await rpc(owner.page, "base_share_by_user", { p_base_id: nextId, p_user_lookup: editor.email, p_role: "viewer" }));
    expect(sent, JSON.stringify(sent)).toMatchObject({ ok: true });
    const task = (await tasks(owner.page, nextId)).find((t) => t.recipient_user_id === editor.id && ["pending", "opened"].includes(t.status));
    expect(await rpc(stranger.page, "base_share_accept", { p_task_id: task.task_id })).toBe(false);
    const declined = await rpc(stranger.page, "base_share_decline", { p_task_id: task.task_id });
    expect(declined === false || first(declined)?.ok === false, JSON.stringify(declined)).toBe(true);
    const roleChange = first(await rpc(stranger.page, "base_share_update_invite_role", { p_task_id: task.task_id, p_role: "editor" }));
    expect(roleChange === false || roleChange?.ok === false, JSON.stringify(roleChange)).toBe(true);
    expect((await rpc(stranger.page, "list_shared_bases_ext")).map((b) => b.id)).not.toContain(nextId);
    // zmiana uprawnienia przez właściciela przed przyjęciem obowiązuje po przyjęciu
    const ownerChange = first(await rpc(owner.page, "base_share_update_invite_role", { p_task_id: task.task_id, p_role: "editor" }));
    expect(ownerChange === true || ownerChange?.ok === true, JSON.stringify(ownerChange)).toBe(true);
    expect(await rpc(editor.page, "base_share_accept", { p_task_id: task.task_id })).toBe(true);
    expect((await rpc(owner.page, "list_base_shares", { p_base_id: nextId })).map((s) => [s.user_id, s.role])).toEqual([[editor.id, "editor"]]);
  } finally {
    for (const id of [baseId, ...bases]) if (id) await owner.page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, id).catch(() => {});
    await owner.context.close();
    await editor.context.close();
    await stranger.context.close();
  }
});
