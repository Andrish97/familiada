// js/pages/poll-go.js
import { sb } from "../core/supabase.js";
import { getUser } from "../core/auth.js";

const qs = new URLSearchParams(location.search);
const taskToken = qs.get("t");
const subToken = qs.get("s");

const $ = (id) => document.getElementById(id);

const title = $("title");
const message = $("message");
const actions = $("actions");
const hint = $("hint");
const emailRow = $("emailRow");
const emailInput = $("emailInput");
const btnEmailNext = $("btnEmailNext");

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

async function handleTaskResolve(emailOverride) {
  const { data, error } = await sb().rpc("poll_task_resolve", { p_token: taskToken, p_email: emailOverride || null });
  if (error) throw error;
  return data;
}

async function handleTask() {
  const user = await getUser();
  try {
    const data = await handleTaskResolve();
    if (!data?.ok) {
      setView({ head: "Link nieważny", text: "Link jest nieważny lub nieaktywny." });
      return;
    }

    if (data.requires_auth && !user) {
      setView({ head: "Zaloguj się", text: "Zaloguj się, aby przejść do głosowania." });
      clearActions();
      addAction("Zaloguj się", "gold", redirectToLogin);
      addAction("Wróć", "", () => history.back());
      return;
    }

    if (data.needs_email) {
      setView({ head: "Podaj e-mail", text: "Podaj e-mail, aby odebrać zaproszenie." });
      showEmailInput(true);
      clearActions();
      addAction("Odrzuć", "danger", async () => declineTask());
      return;
    }

    showEmailInput(false);
    setView({ head: "Zadanie do głosowania", text: "Możesz przejść do głosowania lub odrzucić zadanie." });
    clearActions();
    addAction("Przejdź do głosowania", "gold", () => openVote(data.poll_type));
    addAction("Odrzuć", "danger", async () => declineTask());
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się otworzyć zaproszenia." });
  }
}

function openVote(type) {
  const page = type === "poll_points" ? "poll-points.html" : "poll-text.html";
  location.href = `${page}?t=${encodeURIComponent(taskToken)}`;
}

async function declineTask() {
  try {
    await sb().rpc("poll_task_decline", { p_token: taskToken });
    setView({ head: "Odrzucono", text: "Zadanie zostało odrzucone." });
    clearActions();
    addAction("Wróć", "", () => history.back());
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się odrzucić zadania." });
  }
}

async function handleSub() {
  const user = await getUser();
  if (user) {
    setView({ head: "Zaproszenie do subskrypcji", text: "Masz zaproszenie do subskrypcji. Przejdź do centrum sondaży, aby je obsłużyć." });
    clearActions();
    addAction("Przejdź do centrum", "gold", redirectToHub);
    return;
  }

  setView({ head: "Zaproszenie do subskrypcji", text: "Podaj e-mail, aby zaakceptować zaproszenie." });
  showEmailInput(true);
  clearActions();
  addAction("Subskrybuj", "gold", async () => acceptSubEmail());
  addAction("Odrzuć", "danger", async () => declineSub());
  if (hint) hint.textContent = "Możesz też zalogować się na konto, aby powiązać zaproszenie.";
}

async function acceptSubEmail() {
  const email = emailInput?.value.trim();
  if (!email) {
    setView({ head: "Brak e-maila", text: "Podaj poprawny adres e-mail." });
    return;
  }
  try {
    const { data, error } = await sb().rpc("poll_sub_accept_email", { p_token: subToken, p_email: email });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Nie udało się zaakceptować.");
    setView({ head: "Subskrypcja aktywna", text: "Zaproszenie zostało zaakceptowane." });
    clearActions();
    addAction("Wróć", "", () => history.back());
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się zaakceptować zaproszenia." });
  }
}

async function declineSub() {
  try {
    const { data, error } = await sb().rpc("poll_sub_decline", { p_token: subToken });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Nie udało się odrzucić.");
    setView({ head: "Odrzucono", text: "Zaproszenie zostało odrzucone." });
    clearActions();
    addAction("Wróć", "", () => history.back());
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się odrzucić zaproszenia." });
  }
}

btnEmailNext?.addEventListener("click", async () => {
  if (!taskToken) return;
  const email = emailInput?.value.trim();
  if (!email) {
    setView({ head: "Brak e-maila", text: "Podaj poprawny adres e-mail." });
    return;
  }
  try {
    const data = await handleTaskResolve(email);
    if (!data?.ok) throw new Error("invalid");
    showEmailInput(false);
    setView({ head: "Zadanie do głosowania", text: "Możesz przejść do głosowania lub odrzucić zadanie." });
    clearActions();
    addAction("Przejdź do głosowania", "gold", () => openVote(data.poll_type));
    addAction("Odrzuć", "danger", async () => declineTask());
  } catch (e) {
    console.error(e);
    setView({ head: "Błąd", text: "Nie udało się potwierdzić e-maila." });
  }
});

if (taskToken) {
  handleTask();
} else if (subToken) {
  handleSub();
} else {
  setView({ head: "Brak linku", text: "Brakuje tokenu zaproszenia." });
}
