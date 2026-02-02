import { sb } from "../core/supabase.js";

const status = document.getElementById("status");
const err = document.getElementById("err");
const go = document.getElementById("go");
const back = document.getElementById("back");

function setStatus(m){ status.textContent = m; }
function setErr(m=""){ err.textContent = m; }

function qp(name){
  return new URL(location.href).searchParams.get(name);
}

document.addEventListener("DOMContentLoaded", async () => {
  setErr("");

  // Jeśli user już zalogowany -> od razu do panelu
  try{
    const { data } = await sb().auth.getUser();
    if (data?.user) {
      setStatus("Konto jest aktywne. Przechodzę do panelu…");
      go.style.display = "inline-flex";
      location.href = "builder.html";
      return;
    }
  } catch {}

  const code = qp("code");
  if (!code) {
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
      // zapisz profil (username z user_metadata)
      try {
        const u = data.user;
        const mail = String(u?.email || "").toLowerCase();
        const un = String(u?.user_metadata?.username || "").trim();

        if (!un) {
          // powinno być zawsze, bo rejestracja wymaga username
          throw new Error("Brak nazwy użytkownika w profilu rejestracji.");
        }

        // zakładam: profiles.id = auth.users.id
        const { error: e2 } = await sb()
          .from("profiles")
          .upsert({ id: u.id, email: mail, username: un }, { onConflict: "id" });

        if (e2) throw e2;
      } catch (e) {
        console.error(e);
        setStatus("Konto potwierdzone, ale nie mogę zapisać profilu.");
        setErr(e?.message || String(e));
        back.style.display = "inline-flex";
        return;
      }
      setStatus("Gotowe! Konto potwierdzone.");
      go.style.display = "inline-flex";
      setTimeout(() => (location.href = "builder.html"), 700);
    } else {
      setStatus("Konto potwierdzone, ale brak sesji.");
      back.style.display = "inline-flex";
    }
  } catch(e){
    console.error(e);
    setStatus("Nie udało się potwierdzić konta.");
    setErr(e?.message || String(e));
    back.style.display = "inline-flex";
  }
});
