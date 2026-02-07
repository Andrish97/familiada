import { sb } from "../core/supabase.js";
import { validatePassword } from "../core/auth.js";

const status = document.getElementById("status");
const err = document.getElementById("err");
const form = document.getElementById("form");
const p1 = document.getElementById("p1");
const p2 = document.getElementById("p2");
const save = document.getElementById("save");
const back = document.getElementById("back");

function setStatus(m){ status.textContent = m; }
function setErr(m=""){ err.textContent = m; }

function qp(name){
  return new URL(location.href).searchParams.get(name);
}

document.addEventListener("DOMContentLoaded", async () => {
  setErr("");

  const code = qp("code");
  if (!code) {
    setStatus("Brak kodu w linku.");
    setErr("Wygląda na to, że link jest niepełny albo wygasł.");
    back.style.display = "inline-flex";
    return;
  }

  try{
    setStatus("Weryfikuję link resetu…");
    const { data, error } = await sb().auth.exchangeCodeForSession(code);
    if (error) throw error;

    if (!data?.session) {
      setStatus("Nie udało się rozpocząć resetu.");
      setErr("Brak sesji po weryfikacji linku.");
      back.style.display = "inline-flex";
      return;
    }

    setStatus("Link OK. Ustaw nowe hasło.");
    form.style.display = "grid";
  } catch(e){
    console.error(e);
    setStatus("Nie udało się zweryfikować linku.");
    setErr(e?.message || String(e));
    back.style.display = "inline-flex";
    return;
  }

  save.addEventListener("click", async () => {
    setErr("");

    const a = p1.value;
    const b = p2.value;

    if (a !== b) return setErr("Hasła nie są takie same.");
    try {
      validatePassword(a);
    } catch (e) {
      return setErr(e?.message || String(e));
    }

    try{
      setStatus("Zapisuję nowe hasło…");
      const { error } = await sb().auth.updateUser({ password: a });
      if (error) throw error;

      setStatus("Hasło zmienione. Wracam do logowania…");
      form.style.display = "none";
      back.style.display = "inline-flex";

      // wyloguj sesję recovery dla czystości
      try { await sb().auth.signOut(); } catch {}

      setTimeout(() => (location.href = "index.html"), 900);
    } catch(e){
      console.error(e);
      setStatus("Błąd zapisu hasła.");
      setErr(e?.message || String(e));
    }
  });
});
