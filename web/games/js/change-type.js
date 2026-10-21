// E21: „Zmień typ” -- edycja tego samego rekordu (docs/reguly-gier-transfer-plan.md
// §4 „Zmiana typu gry”). Ta sama bramka edit i to samo potwierdzenie resetu
// zamkniętej ankiety co „Edytuj” (editGate); konwersję wykonuje atomowo
// game_change_type. Wynik to szkic wybranego typu -- braki pokaże silnik reguł.
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-21T10061";
import { t } from "../../shared/translation/translation.js?v=v2026-10-21T10061";
import { confirmModal, alertModal } from "../../shared/js/core/modal.js?v=v2026-10-21T10061";
import { isResourceBusy } from "../../shared/js/core/resource-lock.js?v=v2026-10-21T10061";
import { editGate, TYPES } from "../../shared/js/core/game-validate.js?v=v2026-10-21T10061";

const SOURCE_TYPES = [TYPES.PREPARED, TYPES.POLL_POINTS, TYPES.POLL_TEXT];
// Nazwy typów jak na zakładkach Gier.
const TAB_KEY = { [TYPES.PREPARED]: "prepared", [TYPES.POLL_POINTS]: "pollPoints", [TYPES.POLL_TEXT]: "pollText" };

/**
 * Klucz opisu konwersji -- tylko to, co zrobi sama operacja na danych
 * (game_change_type); null -- ten sam typ.
 */
export function conversionKey(from, to) {
  if (from === to) return null;
  if (to === TYPES.POLL_TEXT) return "toText";
  if (to === TYPES.POLL_POINTS) return "toPoints";
  return "toPrepared";
}

// Karta na typ: nazwa jak na zakładce Gier i skutek zmiany; obecny typ
// wyłączony, domyślnie wybrany pierwszy inny.
function buildBody(current, reset) {
  const box = document.createElement("div");
  box.className = "change-type";
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", t("games.changeType.title"));
  const first = SOURCE_TYPES.find((type) => type !== current);
  for (const type of SOURCE_TYPES) {
    const label = document.createElement("label");
    label.className = "change-type-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "changeType";
    input.value = type;
    input.checked = type === first;
    input.disabled = type === current;
    const name = document.createElement("span");
    name.className = "change-type-name";
    name.textContent = t(`games.tabs.${TAB_KEY[type]}`);
    const desc = document.createElement("span");
    desc.className = "change-type-desc";
    const key = conversionKey(current, type);
    // reset zamkniętej ankiety zeruje punkty (_game_poll_reset)
    const extra = reset && key === "toPrepared" ? " " + t("games.changeType.summary.pointsRemoved") : "";
    desc.textContent = t(`games.changeType.summary.${key || "same"}`) + extra;
    label.append(input, name, desc);
    box.append(label);
  }
  return { box, picked: () => box.querySelector("input:checked")?.value };
}

/**
 * @param {{id: string, type: string}} game
 * @returns {Promise<string|null>} nowy typ albo null (anulowano / odmowa)
 */
export async function changeGameType(game) {
  if (!game || !SOURCE_TYPES.includes(game.type)) return null;
  const gate = await editGate(game.id, { action: "change_type", resetNow: false });
  if (!gate.ok) return null;

  const { box, picked } = buildBody(game.type, gate.reset);
  const ok = await confirmModal({
    title: t("games.changeType.title"),
    text: t("games.changeType.text"),
    okText: t("games.changeType.ok"),
    cancelText: t("games.changeType.cancel"),
    body: box,
    // na telefonie okno zastępuje stronę (wzorzec okien formularzowych)
    sheet: { backBtn: document.getElementById("btnBackSheet") },
  });
  const to = picked();
  if (!ok || !to || to === game.type) return null;

  if (await isResourceBusy("game", game.id)) {
    void alertModal({ text: t("resourceLock.gameMessage") });
    return null;
  }
  const { data, error } = await sb().rpc("game_change_type", { p_game_id: game.id, p_type: to, p_reset: gate.reset });
  if (error || !data?.ok) {
    console.error("[games] game_change_type:", error || data);
    const code = data?.code ? `gameValidate.${data.code}` : "games.changeType.failed";
    void alertModal({ text: t(code) });
    return null;
  }
  return data.type || to;
}
