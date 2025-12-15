import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const msg = document.getElementById("msg");

function setMsg(t){
  msg.textContent = t || "";
  if(t) setTimeout(()=>msg.textContent="", 1400);
}

function pollLink(g){
  const base = new URL("poll.html", location.href);
  base.searchParams.set("id", g.id);
  base.searchParams.set("key", g.share_key_poll);
  return base.toString();
}

async function listPollGames(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,share_key_poll,created_at,poll_opened_at,poll_closed_at")
    .eq("kind","poll")
    .order("created_at", { ascending:false });

  if(error) throw error;
  return data || [];
}

async function setGameStatus(id, patch){
  const { error } = await sb().from("games").update(patch).eq("id", id);
  if(error) throw error;
}

async function openPoll(g){
  // włącz status i otwórz sesje (poll_sessions tworzą się same przy głosie, ale tu oznaczamy “poll_open”)
  await setGameStatus(g.id, { status: "poll_open", poll_opened_at: new Date().toISOString(), poll_closed_at: null });
}

async function closePollAndNormalize(g){
  // 1) pobierz pytania + odpowiedzi
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", g.id)
    .order("ord", { ascending:true });
  if(qErr) throw qErr;

  for(const q of (qs||[])){
    // 2) aktywna sesja dla pytania
    const { data: sess, error: sErr } = await sb()
      .from("poll_sessions")
      .select("id,is_open,created_at")
      .eq("game_id", g.id)
      .eq("question_id", q.id)
      .eq("is_open", true)
      .order("created_at", { ascending:false })
      .limit(1)
      .maybeSingle();

    // jeśli nie było sesji/głosów — nadal robimy zera, ale normalizacja i tak ma dać 100 rozłożone sensownie.
    // U Ciebie: jeśli brak głosów, rozdzielamy równo.
    const sessionId = sess?.id || null;

    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id,ord,text,fixed_points")
      .eq("question_id", q.id)
      .order("ord", { ascending:true });
    if(aErr) throw aErr;

    let counts = new Map();
    ans.forEach(a=>counts.set(a.id, 0));

    if(sessionId){
      const { data: votes, error: vErr } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sessionId);
      if(vErr) throw vErr;

      for(const v of (votes||[])){
        if(counts.has(v.answer_id)) counts.set(v.answer_id, counts.get(v.answer_id)+1);
      }
    }

    const total = Array.from(counts.values()).reduce((s,n)=>s+n,0);

    // 3) normalizacja do 100 (z korektą sumy)
    let perc = [];
    if(total > 0){
      for(const a of ans){
        perc.push({ id: a.id, ord: a.ord, raw: counts.get(a.id), p: Math.round((counts.get(a.id)/total)*100) });
      }
    } else {
      // brak głosów: rozdziel równo
      const n = ans.length || 1;
      const base = Math.floor(100 / n);
      let rest = 100 - base*n;
      perc = ans.map(a => {
        const add = rest>0 ? 1 : 0;
        if(rest>0) rest--;
        return { id:a.id, ord:a.ord, raw:0, p: base + add };
      });
    }

    // korekta na ostatnim (po ord) żeby suma=100
    const sum = perc.reduce((s,x)=>s+x.p,0);
    const diff = 100 - sum;
    if(perc.length){
      perc[perc.length-1].p += diff;
    }

    // 4) zapisz fixed_points i ustaw tryb fixed (bo do gry ma być “zamrożone”)
    for(const row of perc){
      const { error: uErr } = await sb().from("answers").update({ fixed_points: row.p }).eq("id", row.id);
      if(uErr) throw uErr;
    }
    const { error: qmErr } = await sb().from("questions").update({ mode: "fixed" }).eq("id", q.id);
    if(qmErr) throw qmErr;

    // 5) zamknij sesję jeśli była
    if(sessionId){
      const { error: cErr } = await sb().from("poll_sessions").update({ is_open:false }).eq("id", sessionId);
      if(cErr) throw cErr;
    }
  }

  // 6) zamknij grę
  await setGameStatus(g.id, { status: "ready", poll_closed_at: new Date().toISOString() });
}

function card(g){
  const el = document.createElement("div");
  el.className = "card";

  const link = pollLink(g);

  el.innerHTML = `
    <div class="name"></div>
    <div class="meta"></div>

    <div class="row">
      <input class="inp" readonly />
      <button class="btn" data-copy type="button">Kopiuj link</button>
      <button class="btn gold" data-open type="button">Otwórz link</button>
    </div>

    <div class="row">
      <button class="btn gold" data-start type="button">Uruchom sondaż</button>
      <button class="btn danger" data-close type="button">Zakończ sondaż</button>
      <button class="btn" data-preview type="button">Podgląd głosów</button>
    </div>

    <div class="small">Status: <b>${g.status}</b></div>
    <pre class="votes" style="display:none;"></pre>
  `;

  el.querySelector(".name").textContent = g.name;
  el.querySelector(".meta").textContent = `Link sondażu działa tylko dla tej Familiady. Po zamknięciu pokaże komunikat.`;
  el.querySelector(".inp").value = link;

  el.querySelector("[data-copy]").addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(link);
      setMsg("Skopiowano link sondażu.");
    }catch{
      setMsg("Nie udało się skopiować.");
    }
  });

  el.querySelector("[data-open]").addEventListener("click", ()=>{
    window.open(link, "_blank", "noopener,noreferrer");
  });

  el.querySelector("[data-start]").addEventListener("click", async ()=>{
    if(g.status === "poll_open"){
      setMsg("Sondaż już jest uruchomiony.");
      return;
    }
    const ok = await confirmModal({
      title:"Uruchomić sondaż?",
      text:`Uruchomić sondaż dla "${g.name}"? Link zacznie przyjmować głosy.`,
      okText:"Uruchom",
      cancelText:"Anuluj",
    });
    if(!ok) return;

    await openPoll(g);
    setMsg("Sondaż uruchomiony.");
    await refresh();
  });

  el.querySelector("[data-close]").addEventListener("click", async ()=>{
    if(g.status !== "poll_open"){
      setMsg("Sondaż nie jest otwarty.");
      return;
    }
    const ok = await confirmModal({
      title:"Zakończyć sondaż?",
      text:`Zamknąć sondaż i przeliczyć wyniki do 100 dla każdego pytania?`,
      okText:"Zakończ",
      cancelText:"Anuluj",
    });
    if(!ok) return;

    await closePollAndNormalize(g);
    setMsg("Sondaż zamknięty. Gra gotowa do zagrania.");
    await refresh();
  });

  el.querySelector("[data-preview]").addEventListener("click", async ()=>{
    const pre = el.querySelector(".votes");
    if(pre.style.display === "none"){
      pre.style.display = "block";
      pre.textContent = "Ładuję…";
    } else {
      pre.style.display = "none";
      return;
    }

    // podgląd: zlicz per pytanie
    const { data: qs, error: qErr } = await sb()
      .from("questions")
      .select("id,ord,text")
      .eq("game_id", g.id)
      .order("ord",{ascending:true});
    if(qErr){ pre.textContent = "Błąd wczytywania pytań."; return; }

    let out = [];
    for(const q of (qs||[])){
      const { data: ans, error: aErr } = await sb()
        .from("answers")
        .select("id,ord,text")
        .eq("question_id", q.id)
        .order("ord",{ascending:true});
      if(aErr){ out.push(`Q${q.ord}: błąd odpowiedzi`); continue; }

      // ostatnia otwarta sesja
      const { data: sess } = await sb()
        .from("poll_sessions")
        .select("id")
        .eq("game_id", g.id)
        .eq("question_id", q.id)
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle();

      const sid = sess?.id;
      let counts = new Map();
      ans.forEach(a=>counts.set(a.id,0));

      if(sid){
        const { data: votes } = await sb().from("poll_votes").select("answer_id").eq("poll_session_id", sid);
        for(const v of (votes||[])){
          if(counts.has(v.answer_id)) counts.set(v.answer_id, counts.get(v.answer_id)+1);
        }
      }

      out.push(`Q${q.ord}: ${q.text}`);
      for(const a of ans){
        out.push(`  - ${a.text}: ${counts.get(a.id)} głosów`);
      }
      out.push("");
    }

    pre.textContent = out.join("\n").trim() || "Brak danych.";
  });

  return el;
}

async function refresh(){
  const list = await listPollGames();
  grid.innerHTML = "";
  list.forEach(g=>grid.appendChild(card(g)));
  if(!list.length){
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = `<div class="name">Brak Familiad sondażowych</div><div class="meta">Utwórz grę typu “sondaż” w Moje gry.</div>`;
    grid.appendChild(empty);
  }
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const u = await requireAuth("index.html");
  who.textContent = u?.email || "—";

  btnBack.addEventListener("click", ()=>location.href="builder.html");
  btnLogout.addEventListener("click", async ()=>{
    await signOut();
    location.href="index.html";
  });

  await refresh();
});
