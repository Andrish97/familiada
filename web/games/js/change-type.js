// E21: „Zmień typ” -- edycja tego samego rekordu (docs/reguly-gier-transfer-plan.md
// §4 „Zmiana typu gry”). Ta sama bramka edit i to samo potwierdzenie resetu
// zamkniętej ankiety co „Edytuj” (editGate); konwersję wykonuje atomowo
// game_change_type. Wynik to szkic wybranego typu -- braki pokaże silnik reguł.
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-20T14100";
import { t } from "../../shared/translation/translation.js?v=v2026-10-20T14100";
import { confirmModal, alertModal } from "../../shared/js/core/modal.js?v=v2026-10-20T14100";
import { isResourceBusy } from "../../shared/js/core/resource-lock.js?v=v2026-10-20T14100";
import { editGate, TYPES } from "../../shared/js/core/game-validate.js?v=v2026-10-20T14100";

const SOURCE_TYPES = [TYPES.PREPARED, TYPES.POLL_POINTS, TYPES.POLL_TEXT];
// Nazwy typów jak na zakładkach Gier.
const TAB_KEY = { [TYPES.PREPARED]: "prepared", [TYPES.POLL_POINTS]: "pollPoints", [TYPES.POLL_TEXT]: "pollText" };

/** Klucz opisu konwersji (tabela z planu); null -- ten sam typ. */
export function conversionKey(from, to) {
  if (from === to) return null;
  if (to === TYPES.POLL_TEXT) return "toText";
  if (to === TYPES.POLL_POINTS) return from === TYPES.POLL_TEXT ? "textToPoints" : "preparedToPoints";
  return "toPrepared";
}

function buildBody(current) {
  const box = document.createElement("div");
  box.className = "change-type";
  const list = document.createElement("div");
  list.className = "change-type-list";
  list.setAttribute("role", "radiogroup");
  const summary = document.createElement("p");
  summary.className = "change-type-summary";
  summary.setAttribute("aria-live", "polite");
  for (const type of SOURCE_TYPES) {
    const label = document.createElement("label");
    label.className = "change-type-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "changeType";
    input.value = type;
    input.checked = type === current;
    const span = document.createElement("span");
    span.textContent = t(`games.tabs.${TAB_KEY[type]}`) + (type === current ? " " + t("games.changeType.current") : "");
    label.append(input, span);
    list.append(label);
  }
  const update = () => {
    const to = box.querySelector("input:checked")?.value;
    const key = conversionKey(current, to);
    summary.textContent = key ? t(`games.changeType.summary.${key}`) : t("games.changeType.summary.same");
  };
  list.addEventListener("change", update);
  box.append(list, summary);
  update();
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

  const { box, picked } = buildBody(game.type);
  const ok = await confirmModal({
    title: t("games.changeType.title"),
    text: t("games.changeType.text"),
    okText: t("games.changeType.ok"),
    cancelText: t("games.changeType.cancel"),
    body: box,
  });
  const to = picked();
  if (!ok || !to || (to === game.type && !gate.reset)) return null;

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
