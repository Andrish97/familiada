import { sb } from "../core/supabase.js";
import { updateUserLanguage, validatePassword, niceAuthError, getPasswordRulesText } from "../core/auth.js";
import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js";

const status = document.getElementById("status");
const err = document.getElementById("err");
const form = document.getElementById("form");
const pwdHint = document.getElementById("pwdHint");
const p1 = document.getElementById("p1");
const p2 = document.getElementById("p2");
const save = document.getElementById("save");
const back = document.getElementById("back");

function setStatus(m){ status.textContent = m; }
function setErr(m=""){ err.textContent = m; }

function qp(name){
  return new URL(location.href).searchParams.get(name);
}

function hashParams(){
  return new URLSearchParams(location.hash.replace(/^#/, ""));
}

function hp(name){
  return hashParams().get(name);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: true });
  if (pwdHint) pwdHint.textContent = getPasswordRulesText();
  setErr("");
  if (back) back.href = withLangParam(back.dataset.baseHref || "login.html");
  const syncLanguage = () => updateUserLanguage(getUiLang());
  window.addEventListener("i18n:lang", syncLanguage);

  const code = qp("code") || hp("code");
  const accessToken = hp("access_token");
  const refreshToken = hp("refresh_token");
  const hashType = hp("type");
  const tokenHash = qp("token_hash") || qp("token") || hp("token_hash") || hp("token");
  const otpType = qp("type") || hashType || "recovery";

  try{
    setStatus(t("reset.statusVerifying"));
    let data = null;

    if (code) {
      const { data: exchangeData, error } = await sb().auth.exchangeCodeForSession(code);
      if (error) throw error;
      data = exchangeData;
    } else if (tokenHash) {
      const { data: verifyData, error } = await sb().auth.verifyOtp({ token_hash: tokenHash, type: otpType });
      if (error) throw error;
      data = verifyData;
    } else if (accessToken || refreshToken || hashType) {
      const { data: sessionData, error } = await sb().auth.getSessionFromUrl({ storeSession: true });
      if (error) throw error;
      data = sessionData;
    } else {
      setStatus(t("reset.missingCode"));
      setErr(t("reset.missingCodeHint"));
      back.style.display = "inline-flex";
      return;
    }

    if (!data?.session) {
      setStatus(t("reset.startFailed"));
      setErr(t("reset.noSession"));
      back.style.display = "inline-flex";
      return;
    }

    await syncLanguage();
    setStatus(t("reset.linkOk"));
    form.style.display = "grid";
  } catch(e){
    console.error(e);
    setStatus(t("reset.verifyFailed"));
    setErr(niceAuthError(e));
    back.style.display = "inline-flex";
    return;
  }

  save.addEventListener("click", async () => {
    setErr("");

    const a = p1.value;
    const b = p2.value;

    if (a !== b) return setErr(t("reset.errPasswordMismatch"));
    try {
      validatePassword(a);
    } catch (e) {
      return setErr(niceAuthError(e));
    }

    try{
      setStatus(t("reset.statusSaving"));
      const { error } = await sb().auth.updateUser({ password: a });
      if (error) throw error;

      setStatus(t("reset.statusSaved"));
      form.style.display = "none";
      back.style.display = "inline-flex";

      // wyloguj sesję recovery dla czystości
      try { await sb().auth.signOut(); } catch {}

      setTimeout(() => (location.href = withLangParam("login.html")), 900);
    } catch(e){
      console.error(e);
      setStatus(t("reset.saveFailed"));
      setErr(niceAuthError(e));
    }
  });

  p1?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    p2?.focus();
  });

  p2?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    save?.click();
  });
});
