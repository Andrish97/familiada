import { sb } from "../core/supabase.js";

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
  setErr("");

  try {
    const { data } = await sb().auth.getSession();
    if (data?.session?.user) {
      sessionInfo = "Masz aktywną sesję — nie przeszkadza w potwierdzeniu linków.";
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
      setStatus("Ten link został już użyty.");
      setErr("Jeśli to zmiana e-maila, potwierdź drugi link z drugiej skrzynki.");
    } else {
      setStatus("Link jest nieprawidłowy lub wygasł.");
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
      setStatus("Potwierdzono pierwszy link.");
      setErr("Potwierdź drugi link z drugiej skrzynki (może być na innym urządzeniu). Dopiero wtedy zalogujesz się na nowy e-mail.");
    } else {
      setStatus(decoded);
      setErr("Sprawdź drugi adres e-mail, aby dokończyć zmianę.");
    }
    back.style.display = "inline-flex";
    return;
  }

  if (!code) {
    if (tokenHash && otpType) {
      try {
        setStatus("Aktywuję konto…");
        const { data, error } = await sb().auth.verifyOtp({ token_hash: tokenHash, type: otpType });
        if (error) throw error;
        if (data?.session) {
          await syncProfileEmail(data.session.user);
          setStatus("Gotowe! Konto potwierdzone.");
          go.style.display = "inline-flex";
          setTimeout(() => (location.href = "builder.html"), 700);
          return;
        }
        setStatus("Potwierdzenie zapisane. Zaloguj się ponownie.");
        back.style.display = "inline-flex";
        return;
      } catch (e) {
        console.error(e);
        setStatus("Nie udało się potwierdzić konta.");
        setErr(e?.message || String(e));
        back.style.display = "inline-flex";
        return;
      }
    }
    if (accessToken || refreshToken || hashType) {
      try {
        setStatus("Aktywuję konto…");
        const { data, error } = await sb().auth.getSessionFromUrl({ storeSession: true });
        if (error) throw error;

        if (data?.session) {
          await syncProfileEmail(data.session.user);
          setStatus("Gotowe! Konto potwierdzone.");
          go.style.display = "inline-flex";
          setTimeout(() => (location.href = "builder.html"), 700);
          return;
        }

        setStatus("Potwierdzenie zapisane. Zaloguj się ponownie.");
        back.style.display = "inline-flex";
        return;
      } catch (e) {
        console.error(e);
        setStatus("Nie udało się potwierdzić konta.");
        setErr(e?.message || String(e));
        back.style.display = "inline-flex";
        return;
      }
    }

    setStatus("Brak kodu w linku.");
    setErr("Wygląda na to, że link jest niepełny albo został już użyty.");
    back.style.display = "inline-flex";
    return;
  }

  try{
    setStatus("Aktywuję konto…");
    const { data, error } = await sb().auth.exchangeCodeForSession(code);
    if (error) throw error;

    if (data?.session) {
      await syncProfileEmail(data.session.user);
      setStatus("Gotowe! Konto potwierdzone.");
      go.style.display = "inline-flex";
      setTimeout(() => (location.href = "builder.html"), 700);
    } else {
      setStatus("Konto potwierdzone, ale brak sesji.");
      back.style.display = "inline-flex";
    }
  } catch(e){
    console.error(e);
    const msg = e?.message || String(e);
    const low = msg.toLowerCase();
    if (low.includes("already") || low.includes("used")) {
      setStatus("Ten link został już użyty.");
      setErr("Jeśli to zmiana e-maila, potwierdź drugi link z drugiej skrzynki.");
    } else {
      setStatus("Nie udało się potwierdzić konta.");
      setErr(msg);
    }
    back.style.display = "inline-flex";
  }
});
