import { sb } from "../core/supabase.js";
import { niceAuthError } from "../core/auth.js";
import { updateUserLanguage } from "../core/auth.js";
import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js";

const status = document.getElementById("status");
const err = document.getElementById("err");
const go = document.getElementById("go");
const back = document.getElementById("back");
let sessionInfo = "";

function setStatus(m){ status.textContent = m; }
function setErr(m=""){ err.textContent = m || sessionInfo; }

function qp(name){
  return new URL(location.href).searchParams.get(name);
}

function hashParams(){
  return new URLSearchParams(location.hash.replace(/^#/, ""));
}

function hp(name){
  return hashParams().get(name);
}

async function syncProfileEmail(user) {
  if (!user?.id || !user?.email) return;
  try {
    await sb().from("profiles").update({ email: user.email }).eq("id", user.id);
  } catch (e) {
    console.warn("Profile email update failed:", e);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });
  setErr("");
  if (go) go.href = withLangParam(go.dataset.baseHref || "builder.html");
  if (back) back.href = withLangParam(back.dataset.baseHref || "login.html");
  const syncLanguage = () => updateUserLanguage(getUiLang());
  window.addEventListener("i18n:lang", syncLanguage);

  try {
    const { data } = await sb().auth.getSession();
    if (data?.session?.user) {
      await syncLanguage();
      sessionInfo = t("confirm.sessionInfo");
      setErr("");
    }
  } catch {}

  const hashError = hp("error_description") || hp("error");
  const hashMessage = hp("message");
  const queryError = qp("error_description") || qp("error");
  const queryMessage = qp("message");
  if (hashError || queryError) {
    const raw = hashError || queryError;
    const decoded = decodeURIComponent(raw.replace(/\+/g, " "));
    if (decoded.toLowerCase().includes("already") || decoded.toLowerCase().includes("used")) {
      setStatus(t("confirm.linkAlreadyUsed"));
      setErr(t("confirm.linkAlreadyUsedHint"));
    } else {
      setStatus(t("confirm.linkInvalid"));
      setErr(decoded);
    }
    back.style.display = "inline-flex";
    return;
  }

  const code = qp("code") || hp("code");
  const accessToken = hp("access_token");
  const refreshToken = hp("refresh_token");
  const hashType = hp("type");
  const tokenHash = qp("token_hash") || qp("token") || hp("token_hash") || hp("token");
  const otpType = qp("type") || hashType;

  if ((hashMessage || queryMessage) && !code && !accessToken && !refreshToken) {
    const raw = hashMessage || queryMessage;
    const decoded = decodeURIComponent(raw.replace(/\+/g, " "));
    if (decoded.toLowerCase().includes("confirm link sent to the other email")) {
      setStatus(t("confirm.firstLinkConfirmed"));
      setErr(t("confirm.firstLinkConfirmedHint"));
    } else {
      setStatus(decoded);
      setErr(t("confirm.checkOtherEmail"));
    }
    back.style.display = "inline-flex";
    return;
  }
  
  if (!code) {
    if (tokenHash && otpType) {
      try {
        setStatus(t("confirm.activating"));
        const { data, error } = await sb().auth.verifyOtp({ token_hash: tokenHash, type: otpType });
        if (error) throw error;
        if (data?.session) {
          await syncLanguage();
          await syncProfileEmail(data.session.user);
          if (otpType === "email_change") {
            try {
              await sb().auth.updateUser({ data: { familiada_email_change_pending: "" } });
            } catch {}
          }
          setStatus(t("confirm.done"));
          go.style.display = "inline-flex";
          setTimeout(() => (location.href = withLangParam("builder.html")), 700);
          return;
        }
        setStatus(t("confirm.savedNoSession"));
        back.style.display = "inline-flex";
        return;
      } catch (e) {
        console.error(e);
        setStatus(t("confirm.failed"));
        setErr(niceAuthError(e));
        back.style.display = "inline-flex";
        return;
      }
    }
    if (accessToken || refreshToken || hashType) {
      try {
        setStatus(t("confirm.activating"));
        const { data, error } = await sb().auth.getSessionFromUrl({ storeSession: true });
        if (error) throw error;

        if (data?.session) {
          await syncLanguage();
          await syncProfileEmail(data.session.user);
          if (otpType === "email_change") {
            try {
              await sb().auth.updateUser({ data: { familiada_email_change_pending: "" } });
            } catch {}
          }
          setStatus(t("confirm.done"));
          go.style.display = "inline-flex";
          setTimeout(() => (location.href = withLangParam("builder.html")), 700);
          return;
        }

        setStatus(t("confirm.savedNoSession"));
        back.style.display = "inline-flex";
        return;
      } catch (e) {
        console.error(e);
        setStatus(t("confirm.failed"));
        setErr(niceAuthError(e));
        back.style.display = "inline-flex";
        return;
      }
    }

    setStatus(t("confirm.missingCode"));
    setErr(t("confirm.missingCodeHint"));
    back.style.display = "inline-flex";
    return;
  }

  try{
    setStatus(t("confirm.activating"));
    const { data, error } = await sb().auth.exchangeCodeForSession(code);
    if (error) throw error;

    if (data?.session) {
      await syncLanguage();
      await syncProfileEmail(data.session.user);
          if (otpType === "email_change") {
            try {
              await sb().auth.updateUser({ data: { familiada_email_change_pending: "" } });
            } catch {}
          }
      setStatus(t("confirm.done"));
      go.style.display = "inline-flex";
      setTimeout(() => (location.href = withLangParam("builder.html")), 700);
    } else {
      setStatus(t("confirm.confirmedNoSession"));
      back.style.display = "inline-flex";
    }
  } catch(e){
    console.error(e);
    const msg = e?.message || String(e);
    const low = msg.toLowerCase();
    if (low.includes("already") || low.includes("used")) {
      setStatus(t("confirm.linkAlreadyUsed"));
      setErr(t("confirm.linkAlreadyUsedHint"));
    } else {
      setStatus(t("confirm.failed"));
      setErr(msg);
    }
    back.style.display = "inline-flex";
  }
});
