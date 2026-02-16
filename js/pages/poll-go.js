// js/pages/poll-go.js
import { sb } from "../core/supabase.js";
import { getUser } from "../core/auth.js";
import { initI18n, t } from "../../translation/translation.js";
import { alertModal } from "../core/modal.js";

initI18n({ withSwitcher: true });

const MSG = {
  declined: () => t("pollGo.declined"),
  taskDeclined: () => t("pollGo.taskDeclined"),
  error: () => t("pollGo.error"),
  declineTaskFailed: () => t("pollGo.declineTaskFailed"),
  declineInviteFailed: () => t("pollGo.declineInviteFailed"),
  subHeading: (owner) => t("pollGo.subHeading", { owner }),
  taskHeading: (name, owner) => t("pollGo.taskHeading", { name, owner }),
  taskName: (name) => t("pollGo.taskName", { name }),
  pollFallback: () => t("pollGo.pollFallback"),
  ownerSuffix: (owner) => t("pollGo.ownerSuffix", { owner }),
  mismatch: (email) => t("pollGo.mismatch", { email }),
  inviteUsed: () => t("pollGo.inviteUsed"),
  acceptFailed: () => t("pollGo.acceptFailed"),
  subscriptionActive: () => t("pollGo.subscriptionActive"),
  inviteAccepted: () => t("pollGo.inviteAccepted"),
  inviteDeclined: () => t("pollGo.inviteDeclined"),
  inviteAcceptFailed: () => t("pollGo.inviteAcceptFailed"),
  emailMissingTitle: () => t("pollGo.emailMissingTitle"),
  emailMissingText: () => t("pollGo.emailMissingText"),
  subscribeFailed: () => t("pollGo.subscribeFailed"),
  subscribeAdded: () => t("pollGo.subscribeAdded"),
  subscriptionInviteActive: () => t("pollGo.subscriptionInviteActive"),
  subscribePrompt: () => t("pollGo.subscribePrompt"),
  acceptInHub: () => t("pollGo.acceptInHub"),
  hubLabel: () => t("pollGo.hubLabel"),
  acceptLabel: () => t("pollGo.acceptLabel"),
  declineLabel: () => t("pollGo.declineLabel"),
  subscribeLabel: () => t("pollGo.subscribeLabel"),
  loginToAccept: () => t("pollGo.loginToAccept"),
  loginLabel: () => t("pollGo.loginLabel"),
  loginToVote: () => t("pollGo.loginToVote"),
  taskInviteActive: () => t("pollGo.taskInviteActive"),
  voteLabel: () => t("pollGo.voteLabel"),
  missingLinkTitle: () => t("pollGo.missingLinkTitle"),
  missingLinkText: () => t("pollGo.missingLinkText"),
  invalidLinkTitle: () => t("pollGo.invalidLinkTitle"),
  invalidLinkText: () => t("pollGo.invalidLinkText"),
  inviteUnknown: () => t("pollGo.inviteUnknown"),
  openInviteFailed: () => t("pollGo.openInviteFailed"),
  invitationRecipient: () => t("pollGo.invitationRecipient"),
  ownerEmailBlocked: (owner) => t("pollGo.ownerEmailBlocked", { owner }),
};

const qs = new URLSearchParams(location.search);
const taskToken = qs.get("t");
const subToken = qs.get("s");
const hasTaskToken = Boolean(taskToken);
const hasSubToken = Boolean(subToken);
const goToken = hasTaskToken === hasSubToken ? null : (hasTaskToken ? taskToken : subToken);

const $ = (id) => document.getElementById(id);

const title = $("title");
const message = $("message");
const actions = $("actions");
const hint = $("hint");
const emailRow = $("emailRow");
const emailInput = $("emailInput");

let resolvedInviteData = null;

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
  url.searchParams.set("next", taskToken ? "polls-hub" : "subscriptions");
  if (taskToken) url.searchParams.set("t", taskToken);
  if (subToken) url.searchParams.set("s", subToken);
  location.href = url.toString();
}

function redirectToHub() {
  const hubPage = taskToken ? "polls-hub.html" : "subscriptions.html";
  const url = new URL(hubPage, location.href);
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

async function resolveProfileByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  try {
    const { data, error } = await sb()
      .from("profiles")
      .select("id,username,email")
      .eq("email", normalized)
      .maybeSingle();
    if (error || !data?.id) return null;
    return data;
  } catch (e) {
    console.warn("[poll-go] profile email lookup failed:", e);
    return null;
  }
}

async function hydrateInviteIdentity(data) {
  if (!data) return data;

  // Email-only: możemy dociągnąć label do UI, ale NIE ustawiamy *_user_id
  if (data.kind === "sub" && !data.subscriber_user_id && data.subscriber_email) {
    const match = await resolveProfileByEmail(data.subscriber_email);
    if (match?.id) {
      return {
        ...data,
        subscriber_label: data.subscriber_label || match.username || match.email,
      };
    }
  }

  if (data.kind === "task" && !data.recipient_user_id && data.recipient_email) {
    const match = await resolveProfileByEmail(data.recipient_email);
    if (match?.id) {
      return {
        ...data,
        recipient_label: data.recipient_label || match.username || match.email,
      };
    }
  }

  return data;
}

function openVote(type) {
  const page = type === "poll_points" ? "poll-points.html" : "poll-text.html";
  location.href = `${page}?t=${encodeURIComponent(goToken)}`;
}

async function declineTask() {
  try {
    await sb().rpc("poll_task_decline", { p_token: goToken });
    setView({ head: MSG.declined(), text: MSG.taskDeclined() });
    clearActions();
  } catch (e) {
    console.error(e);
    setView({ head: MSG.error(), text: MSG.declineTaskFailed() });
  }
}

function buildSubHeading(data) {
  const owner = data?.owner_label ? MSG.ownerSuffix(data.owner_label) : "";
  return MSG.subHeading(owner);
}

function buildTaskHeading(data) {
  const name = data?.game_name ? MSG.taskName(data.game_name) : MSG.pollFallback();
  const owner = data?.owner_label ? MSG.ownerSuffix(data.owner_label) : "";
  return MSG.taskHeading(name, owner);
}

function showMismatch(head, expectedEmail) {
  const emailText = expectedEmail || MSG.invitationRecipient();
  setView({
    head,
    text: MSG.mismatch(emailText),
  });
  clearActions();
  showEmailInput(false);
}

function showExpired(head) {
  setView({ head, text: MSG.inviteUsed() });
  clearActions();
  showEmailInput(false);
}

function matchesInviteTarget({ user, expectedUserId, expectedEmail }) {
  if (!user) return false;

  // ✅ Soft allow: jeśli token przypisany do konta → tylko user_id decyduje
  if (expectedUserId) return user.id === expectedUserId;

  // ✅ Email-only: match po email
  const u = normalizeEmail(user.email);
  const e = normalizeEmail(expectedEmail);
  if (!u || !e) return false;
  return u === e;
}

async function acceptSubDirect(email) {
  try {
    const { data, error } = await sb().rpc("poll_sub_accept_email", { p_token: goToken, p_email: email });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || MSG.acceptFailed());
    setView({ head: MSG.subscriptionActive(), text: MSG.inviteAccepted() });
    clearActions();
  } catch (e) {
    console.error(e);
    setView({ head: MSG.error(), text: MSG.inviteAcceptFailed() });
  }
}

async function subscribeByEmail() {
  const email = emailInput?.value.trim();
  if (!email) {
    setView({ head: MSG.emailMissingTitle(), text: MSG.emailMissingText() });
    return;
  }
  try {
    const ownerId = resolvedInviteData?.owner_id;
    if (ownerId) {
      const { data: owner } = await sb().from("profiles").select("id,username,email").eq("id", ownerId).maybeSingle();
      const ownerEmail = normalizeEmail(owner?.email);
      if (ownerEmail && normalizeEmail(email) === ownerEmail) {
        await alertModal({ text: MSG.ownerEmailBlocked(owner?.username || owner?.email || "") });
        return;
      }
    }

    const { data, error } = await sb().rpc("poll_go_subscribe_email", { p_token: goToken, p_email: email });
    if (error) throw error;
    if (!data) throw new Error(MSG.subscribeFailed());
    setView({ head: MSG.subscriptionActive(), text: MSG.subscribeAdded() });
    clearActions();
    showEmailInput(false);
  } catch (e) {
    console.error(e);
    setView({ head: MSG.error(), text: MSG.subscribeFailed() });
  }
}

async function declineSub() {
  try {
    const { data, error } = await sb().rpc("poll_sub_decline", { p_token: goToken });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || MSG.declineInviteFailed());
    setView({ head: MSG.declined(), text: MSG.inviteDeclined() });
    clearActions();
  } catch (e) {
    console.error(e);
    setView({ head: MSG.error(), text: MSG.declineInviteFailed() });
  }
}

async function handleSubInvite(data, user) {
  const head = buildSubHeading(data);
  const expectedEmail = normalizeEmail(data.subscriber_email);
  const isActive = data.status === "pending";
  const hasAccountInvite = Boolean(data.subscriber_user_id);
  const userEmail = normalizeEmail(user?.email);

  if (user) {
    if (hasAccountInvite) {
      // ✅ najpierw user_id, a jak go nie ma → email
      const okTarget = matchesInviteTarget({
        user,
        expectedUserId: data.subscriber_user_id,
        expectedEmail: data.subscriber_email,
      });
  
      if (!okTarget) {
        showMismatch(head, data.subscriber_email);
        return;
      }
  
      if (!isActive) {
        showExpired(head);
        return;
      }
  
      setView({
        head,
        text: MSG.acceptInHub(),
        hintText: expectedEmail ? `${MSG.invitationRecipient()}: ${expectedEmail}` : "",
      });
      clearActions();
      addAction(MSG.hubLabel(), "gold", redirectToHub);
      showEmailInput(false);
      return;
    }
  }

  if (user && !hasAccountInvite) {
    if (!isActive) {
      showExpired(head);
      return;
    }

    setView({ head, text: MSG.subscriptionInviteActive() });
    clearActions();
    showEmailInput(false);
    addAction(MSG.acceptLabel(), "gold", async () => acceptSubDirect(userEmail || expectedEmail));
    addAction(MSG.declineLabel(), "danger", async () => declineSub());
    return;
  }

  if (!isActive) {
    if (hasAccountInvite) {
      showExpired(head);
      return;
    }

    setView({ head, text: MSG.subscribePrompt() });
    showEmailInput(true);
    clearActions();
    addAction(MSG.subscribeLabel(), "gold", async () => subscribeByEmail());
    return;
  }

  if (hasAccountInvite) {
    setView({ head, text: MSG.loginToAccept() });
    clearActions();
    addAction(MSG.loginLabel(), "gold", redirectToLogin);
    showEmailInput(false);
    return;
  }

  setView({ head, text: MSG.subscriptionInviteActive() });
  clearActions();
  showEmailInput(false);
  addAction(MSG.acceptLabel(), "gold", async () => acceptSubDirect(data.subscriber_email));
  addAction(MSG.declineLabel(), "danger", async () => declineSub());
}

async function handleTaskInvite(data, user) {
  const expectedEmail = normalizeEmail(data.recipient_email);
  const head = buildTaskHeading(data);
  const isActive = ["pending", "opened"].includes(data.status);
  const hasAccountInvite = Boolean(data.recipient_user_id);

  if (user) {
    if (hasAccountInvite) {
      const okTarget = matchesInviteTarget({
        user,
        expectedUserId: data.recipient_user_id,
        expectedEmail: data.recipient_email,
      });
  
      if (!okTarget) {
        showMismatch(head, data.recipient_email);
        return;
      }
  
      if (!isActive) {
        showExpired(head);
        return;
      }
  
      setView({
        head,
        text: MSG.acceptInHub(),
        hintText: expectedEmail ? `${MSG.invitationRecipient()}: ${expectedEmail}` : "",
      });
      clearActions();
      addAction(MSG.hubLabel(), "gold", redirectToHub);
      showEmailInput(false);
      return;
    }
  }

  if (user && !hasAccountInvite) {
    if (!isActive) {
      showExpired(head);
      return;
    }

    setView({ head, text: MSG.taskInviteActive() });
    clearActions();
    showEmailInput(false);
    addAction(MSG.voteLabel(), "gold", () => openVote(data.poll_type));
    addAction(MSG.declineLabel(), "danger", async () => declineTask());
    return;
  }

  if (!isActive) {
    showExpired(head);
    return;
  }

  if (hasAccountInvite) {
    setView({ head, text: MSG.loginToVote() });
    clearActions();
    addAction(MSG.loginLabel(), "gold", redirectToLogin);
    showEmailInput(false);
    return;
  }

  setView({ head, text: MSG.taskInviteActive() });
  clearActions();
  showEmailInput(false);
  addAction(MSG.voteLabel(), "gold", () => openVote(data.poll_type));
  addAction(MSG.declineLabel(), "danger", async () => declineTask());
}

async function init() {
  if (!goToken) {
    setView({ head: MSG.missingLinkTitle(), text: MSG.missingLinkText() });
    return;
  }

  const user = await getUser();
  try {
    const raw = await resolveToken();
    const data = await hydrateInviteIdentity(raw);
    resolvedInviteData = data || null;
    if (!data?.ok) {
      setView({ head: MSG.invalidLinkTitle(), text: MSG.invalidLinkText() });
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

    setView({ head: MSG.error(), text: MSG.inviteUnknown() });
  } catch (e) {
    console.error(e);
    setView({ head: MSG.error(), text: MSG.openInviteFailed() });
  }
}

emailInput?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!goToken) return;
  await subscribeByEmail();
});

init();
