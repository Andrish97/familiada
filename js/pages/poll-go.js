// js/pages/poll-go.js
import { sb } from "../core/supabase.js";
import { getUser } from "../core/auth.js";

const qs = new URLSearchParams(location.search);
const taskToken = qs.get("t");
const subToken = qs.get("s");
const goToken = taskToken || subToken;

const $ = (id) => document.getElementById(id);

const title = $("title");
const message = $("message");
const actions = $("actions");
const hint = $("hint");
const emailRow = $("emailRow");
const emailInput = $("emailInput");

function setView({ head, text, hintText }) {
  if (title) title.textContent = head;
  if (message) message.textContent = text;
  if (hint) hint.textContent = hintText || "";
}

function clearActions() {
  if (actions) actions.innerHTML = "";
}

function showEmailInput(show) {
  if (emailRow) emailRow.style.display = show ? "flex" : "none";
}

function addAction(label, kind, handler) {
  const btn = document.createElement("button");
  btn.className = `btn sm ${kind || ""}`.trim();
  btn.textContent = label;
  btn.addEventListener("click", handler);
  actions?.appendChild(btn);
}

function redirectToLogin() {
  const url = new URL("index.html", location.href);
  url.searchParams.set("from", "poll-go");
  url.searchParams.set("next", "polls-hub");
  if (taskToken) url.searchParams.set("t", taskToken);
  if (subToken) url.searchParams.set("s", subToken);
  location.href = url.toString();
}

function redirectToHub() {
  const url = new URL("polls-hub.html", location.href);
  if (taskToken) url.searchParams.set("t", taskToken);
  if (subToken) url.searchParams.set("s", subToken);
  location.href = url.toString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function resolveToken() {
  const { data, error } = await sb().rpc("poll_go_resolve", { p_token: goToken });
  if (error) throw error;
  return data;
}

function openVote(type) {
  const page = type === "poll_points" ? "poll-points.html" : "poll-text.html";
  location.href = `${page}?t=${encodeURIComponent(goToken)}`;
}

async function declineTask() {
  try {
    await sb().rpc("poll_task_decline", { p_token: goToken });
    setView({ head: "Odrzucono", text: "Zadanie zostało odrzucone." });
    clearActions();
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się odrzucić zadania." });
  }
}

function buildSubHeading(data) {
  const owner = data?.owner_label ? ` od użytkownika ${data.owner_label}` : "";
  return `Zaproszenie do subskrypcji${owner}`;
}

function buildTaskHeading(data) {
  const name = data?.game_name ? `„${data.game_name}”` : "sondażu";
  const owner = data?.owner_label ? ` od użytkownika ${data.owner_label}` : "";
  return `Zaproszenie do głosowania w ${name}${owner}`;
}

function showMismatch(head, expectedEmail) {
  const emailText = expectedEmail || "adresata zaproszenia";
  setView({
    head,
    text: `Zaproszenie Ciebie nie dotyczy, zaloguj się jako ${emailText} i spróbuj ponownie.`,
  });
  clearActions();
  showEmailInput(false);
}

function showExpired(head) {
  setView({ head, text: "Zaproszenie zostało wykorzystane." });
  clearActions();
  showEmailInput(false);
}

async function acceptSubDirect(email) {
  try {
    const { data, error } = await sb().rpc("poll_sub_accept_email", { p_token: goToken, p_email: email });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Nie udało się zaakceptować.");
    setView({ head: "Subskrypcja aktywna", text: "Zaproszenie zostało zaakceptowane." });
    clearActions();
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się zaakceptować zaproszenia." });
  }
}

async function subscribeByEmail() {
  const email = emailInput?.value.trim();
  if (!email) {
    setView({ head: "Brak e-maila", text: "Podaj poprawny adres e-mail." });
    return;
  }
  try {
    const { data, error } = await sb().rpc("poll_go_subscribe_email", { p_token: goToken, p_email: email });
    if (error) throw error;
    if (!data) throw new Error("Nie udało się zasubskrybować.");
    setView({ head: "Subskrypcja aktywna", text: "Subskrypcja została dodana." });
    clearActions();
    showEmailInput(false);
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się dodać subskrypcji." });
  }
}

async function declineSub() {
  try {
    const { data, error } = await sb().rpc("poll_sub_decline", { p_token: goToken });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Nie udało się odrzucić.");
    setView({ head: "Odrzucono", text: "Zaproszenie zostało odrzucone." });
    clearActions();
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się odrzucić zaproszenia." });
  }
}

async function handleSubInvite(data, user) {
  const head = buildSubHeading(data);
  const expectedEmail = normalizeEmail(data.subscriber_email);
  const isActive = data.status === "pending";
  const hasAccountInvite = Boolean(data.subscriber_user_id);
  const userEmail = normalizeEmail(user?.email);

  if (user) {
    const matchById = data.subscriber_user_id && user.id === data.subscriber_user_id;
    const matchByEmail = !data.subscriber_user_id && expectedEmail && userEmail === expectedEmail;
    if (!(matchById || matchByEmail)) {
      showMismatch(head, data.subscriber_email);
      return;
    }

    if (!isActive) {
      showExpired(head);
      return;
    }

    setView({ head, text: "Żeby zaakceptować przejdź do Centrum Sondaży." });
    clearActions();
    addAction("Centrum Sondaży", "gold", redirectToHub);
    showEmailInput(false);
    return;
  }

  if (!isActive) {
    if (hasAccountInvite) {
      showExpired(head);
      return;
    }

    setView({ head, text: "Jeśli chcesz zasubskrybować podaj adres email." });
    showEmailInput(true);
    clearActions();
    addAction("Subskrybuj", "gold", async () => subscribeByEmail());
    return;
  }

  if (hasAccountInvite) {
    setView({ head, text: "Żeby zaakceptować musisz się zalogować." });
    clearActions();
    addAction("Zaloguj", "gold", redirectToLogin);
    showEmailInput(false);
    return;
  }

  setView({ head, text: "Zaproszenie do subskrypcji jest aktywne." });
  clearActions();
  showEmailInput(false);
  addAction("Akceptuj", "gold", async () => acceptSubDirect(data.subscriber_email));
  addAction("Odrzuć", "danger", async () => declineSub());
}

async function handleTaskInvite(data, user) {
  const head = buildTaskHeading(data);
  const expectedEmail = normalizeEmail(data.recipient_email);
  const isActive = ["pending", "opened"].includes(data.status);
  const hasAccountInvite = Boolean(data.recipient_user_id);
  const userEmail = normalizeEmail(user?.email);

  if (user) {
    const matchById = data.recipient_user_id && user.id === data.recipient_user_id;
    const matchByEmail = !data.recipient_user_id && expectedEmail && userEmail === expectedEmail;
    if (!(matchById || matchByEmail)) {
      showMismatch(head, data.recipient_email);
      return;
    }

    if (!isActive) {
      showExpired(head);
      return;
    }

    setView({ head, text: "Żeby zaakceptować przejdź do Centrum Sondaży." });
    clearActions();
    addAction("Centrum Sondaży", "gold", redirectToHub);
    showEmailInput(false);
    return;
  }

  if (!isActive) {
    showExpired(head);
    return;
  }

  if (hasAccountInvite) {
    setView({ head, text: "Żeby zagłosować musisz się zalogować." });
    clearActions();
    addAction("Zaloguj", "gold", redirectToLogin);
    showEmailInput(false);
    return;
  }

  setView({ head, text: "Zaproszenie do głosowania jest aktywne." });
  clearActions();
  showEmailInput(false);
  addAction("Głosuj", "gold", () => openVote(data.poll_type));
  addAction("Odrzuć", "danger", async () => declineTask());
}

async function init() {
  if (!goToken) {
    setView({ head: "Brak linku", text: "Brakuje tokenu zaproszenia." });
    return;
  }

  const user = await getUser();
  try {
    const data = await resolveToken();
    if (!data?.ok) {
      setView({ head: "Link nieważny", text: "Link jest nieważny lub nieaktywny." });
      return;
    }

    if (data.kind === "sub") {
      await handleSubInvite(data, user);
      return;
    }

    if (data.kind === "task") {
      await handleTaskInvite(data, user);
      return;
    }

    setView({ head: "Błąd", text: "Nie udało się rozpoznać zaproszenia." });
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się otworzyć zaproszenia." });
  }
}

emailInput?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!goToken) return;
  await subscribeByEmail();
});

init();
