// js/pages/polls.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Sondaże są dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const msg = document.getElementById("msg");

const cardMain = document.getElementById("cardMain");
const cardEmpty = document.getElementById("cardEmpty");

const chipKind = document.getElementById("chipKind");
const chipStatus = document.getElementById("chipStatus");

const gName = document.getElementById("gName");
const gMeta = document.getElementById("gMeta");
const pollLinkEl = document.getElementById("pollLink");

const qrBox = document.getElementById("qr");

const btnCopy = document.getElementById("btnCopy");
const btnOpen = document.getElementById("btnOpen");
const btnStart = document.getElementById("btnStart");
const btnClose = document.getElementById("btnClose");
const btnPreview = document.getElementById("btnPreview");
const votesEl = document.getElementById("votes");

let game = null;

function setMsg(t){
  msg.textContent = t || "";
  if(t) setTimeout(()=>msg.textContent="", 1800);
}

function pollLink(g){
  const base = new URL("poll.html", location.href);
  base.searchParams.set("id", g.id);
  base.searchParams.set("key", g.share_key_poll);
  return base.toString();
}

function setChips(g){
  chipKind.textContent = (g.kind === "poll") ? "SONDAŻOWA" : "LOKALNA";

  chipStatus.className = "chip status";
  const st = g.status || "draft";
  chipStatus.textContent = st.toUpperCase();

  if(st === "ready") chipStatus.classList.add("ok");
  else if(st === "poll_open") chipStatus.classList.add("warn");
  else chipStatus.classList.add("bad");
}

function clearQr(){
  if(qrBox) qrBox.innerHTML = "";
}

async function renderQr(link){
  if(!qrBox) return;
  qrBox.innerHTML = "";
  try{
    // QRCode global z CDN
    await QRCode.toCanvas(link, { width: 160, margin: 1 }, (err, canvas)=>{
      if(err) return;
      qrBox.appendChild(canvas);
    });
  }catch{
    clearQr();
  }
}

async function loadGame(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,share_key_poll")
    .eq("id", gameId)
    .single();
  if(error) throw error;
  return data;
}

async function updateGame(patch){
  const { error } = await sb().from("games").update(patch).eq("id", gameId);
  if(error) throw error;
}

// WARUNEK “niepusta” do uruchomienia sondażu:
// - min 1 pytanie
// - każde pytanie: min 2 odpowiedzi
// (Jak chcesz twardo 5 pytań: zamień qs.length < 1 na qs.length !== 5)
async function pollSetupCheck(gid){
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord")
    .eq("game_id", gid)
    .order("ord", { ascending:true });

  if(qErr) return { ok:false, reason:"Błąd wczytywania pytań." };
  if(!qs || qs.length < 1) return { ok:false, reason:"Ta Familiada nie ma jeszcze pytań." };

  for(const q of qs){
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id")
      .eq("question_id", q.id);

    if(aErr) return { ok:false, reason:`Błąd wczytywania odpowiedzi (pytanie #${q.ord}).` };
    if(!ans || ans.length < 2) return { ok:false, reason:`Pytanie #${q.ord} ma za mało odpowiedzi (min 2).` };
  }
  return { ok:true, reason:"" };
}

async function openPoll(){
  // walidacja “niepusta”
  const chk = await pollSetupCheck(gameId);
  if(!chk.ok){
    setMsg(chk.reason);
    return false;
  }

  // odpal status
  await updateGame({ status: "poll_open" });
  return true;
}

// Normalizacja do 100 na pytanie (zawsze wyrówna do 100 nawet przy 0 głosów)
async function closePollAndNormalize(){
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending:true });
  if(qErr) throw qErr;

  for(const q of (qs||[])){
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id,ord,text,fixed_points")
      .eq("question_id", q.id)
      .order("ord", { ascending:true });
    if(aErr) throw aErr;

    if(!ans || ans.length < 1) continue;

    // bierzemy najnowszą sesję (otwartą albo zamkniętą)
    const { data: sess, error: sErr } = await sb()
      .from("poll_sessions")
      .select("id,is_open,created_at")
      .eq("game_id", gameId)
      .eq("question_id", q.id)
      .order("created_at", { ascending:false })
      .limit(1)
      .maybeSingle();
    if(sErr) throw sErr;

    const sid = sess?.id || null;

    const counts = new Map();
    ans.forEach(a => counts.set(a.id, 0));

    if(sid){
      const { data: votes, error: vErr } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sid);
      if(vErr) throw vErr;

      for(const v of (votes||[])){
        if(counts.has(v.answer_id)) counts.set(v.answer_id, counts.get(v.answer_id)+1);
      }
    }

    const total = Array.from(counts.values()).reduce((s,n)=>s+n,0);

    let rows = [];
    if(total > 0){
      rows = ans.map(a => ({
        id: a.id,
        p: Math.round(((counts.get(a.id) || 0) / total) * 100),
      }));
    } else {
      // brak głosów: rozdział równy
      const n = ans.length;
      const base = Math.floor(100 / n);
      let rest = 100 - base*n;
      rows = ans.map(a => {
        const add = rest > 0 ? 1 : 0;
        if(rest > 0) rest--;
        return { id: a.id, p: base + add };
      });
    }

    // korekta końcowa, żeby suma = 100
    const sum = rows.reduce((s,x)=>s+x.p,0);
    const diff = 100 - sum;
    if(rows.length) rows[rows.length-1].p += diff;

    // zapis punktów
    for(const r of rows){
      const { error: uErr } = await sb().from("answers").update({ fixed_points: r.p }).eq("id", r.id);
      if(uErr) throw uErr;
    }

    // zamknij sesję jeśli była otwarta
    if(sid && sess?.is_open){
      const { error: cErr } = await sb().from("poll_sessions").update({ is_open:false }).eq("id", sid);
      if(cErr) throw cErr;
    }
  }

  // gotowa do gry
  await updateGame({ status: "ready" });
}

async function previewVotes(){
  votesEl.style.display = "";
  votesEl.textContent = "Ładuję…";

  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord",{ascending:true});
  if(qErr){ votesEl.textContent = "Błąd wczytywania pytań."; return; }

  let out = [];
  for(const q of (qs||[])){
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id,ord,text")
      .eq("question_id", q.id)
      .order("ord",{ascending:true});
    if(aErr){ out.push(`Q${q.ord}: błąd odpowiedzi`); continue; }

    const { data: sess } = await sb()
      .from("poll_sessions")
      .select("id")
      .eq("game_id", gameId)
      .eq("question_id", q.id)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();

    const sid = sess?.id;
    const counts = new Map();
    (ans||[]).forEach(a=>counts.set(a.id,0));

    if(sid){
      const { data: votes } = await sb()
        .from("poll_votes")
        .select("answer_id")
        .eq("poll_session_id", sid);
      for(const v of (votes||[])){
        if(counts.has(v.answer_id)) counts.set(v.answer_id, counts.get(v.answer_id)+1);
      }
    }

    out.push(`Q${q.ord}: ${q.text}`);
    for(const a of (ans||[])){
      out.push(`  - ${a.text}: ${counts.get(a.id) || 0} głosów`);
    }
    out.push("");
  }

  votesEl.textContent = out.join("\n").trim() || "Brak danych.";
}

async function refresh(){
  if(!gameId){
    cardMain.style.display = "none";
    cardEmpty.style.display = "";
    chipKind.textContent = "—";
    chipStatus.textContent = "—";
    return;
  }

  game = await loadGame();

  if(game.kind !== "poll"){
    cardMain.style.display = "none";
    cardEmpty.style.display = "";
    setMsg("To nie jest gra sondażowa.");
    return;
  }

  setChips(game);

  cardEmpty.style.display = "none";
  cardMain.style.display = "";

  gName.textContent = game.name;
  gMeta.textContent = "Link i QR pojawiają się dopiero, gdy sondaż jest URUCHOMIONY i gra ma pytania z odpowiedziami.";

  // domyślnie: link/QR OFF
  pollLinkEl.value = "";
  btnCopy.disabled = true;
  btnOpen.disabled = true;
  clearQr();

  const st = game.status || "draft";

  // przyciski wg statusu + setup check
  const chk = await pollSetupCheck(game.id);

  btnStart.disabled = !chk.ok || (st === "poll_open" || st === "ready");
  btnClose.disabled = (st !== "poll_open");

  // link/qr tylko w poll_open i gdy setup OK
  if(st === "poll_open" && chk.ok){
    const link = pollLink(game);
    pollLinkEl.value = link;
    btnCopy.disabled = false;
    btnOpen.disabled = false;
    await renderQr(link);
  } else {
    if(!chk.ok) setMsg(chk.reason);
    else if(st === "ready") setMsg("Sondaż jest zamknięty (gra gotowa). Link do głosowania nieaktywny.");
    else setMsg("Sondaż jeszcze nie jest uruchomiony — link i QR pojawią się po uruchomieniu.");
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

  btnCopy.addEventListener("click", async ()=>{
    if(!pollLinkEl.value) return;
    try{
      await navigator.clipboard.writeText(pollLinkEl.value);
      setMsg("Skopiowano link sondażu.");
    }catch{
      setMsg("Nie udało się skopiować.");
    }
  });

  btnOpen.addEventListener("click", ()=>{
    if(!pollLinkEl.value) return;
    window.open(pollLinkEl.value, "_blank", "noopener,noreferrer");
  });

  btnStart.addEventListener("click", async ()=>{
    if(!game) return;

    const ok = await confirmModal({
      title:"Uruchomić sondaż?",
      text:`Uruchomić sondaż dla "${game.name}"? Link zacznie przyjmować głosy.`,
      okText:"Uruchom",
      cancelText:"Anuluj",
    });
    if(!ok) return;

    const started = await openPoll();
    if(!started) return;

    setMsg("Sondaż uruchomiony.");
    await refresh();
  });

  btnClose.addEventListener("click", async ()=>{
    if(!game) return;

    const ok = await confirmModal({
      title:"Zakończyć sondaż?",
      text:`Zamknąć sondaż i przeliczyć wyniki do 100 dla każdego pytania?`,
      okText:"Zakończ",
      cancelText:"Anuluj",
    });
    if(!ok) return;

    try{
      await closePollAndNormalize();
      setMsg("Sondaż zamknięty. Gra gotowa do zagrania.");
      await refresh();
    }catch(e){
      console.error("[polls] close error:", e);
      alert("Nie udało się zamknąć sondażu. Sprawdź konsolę.");
    }
  });

  btnPreview.addEventListener("click", async ()=>{
    if(votesEl.style.display === "none"){
      await previewVotes();
    } else {
      votesEl.style.display = "none";
    }
  });

  await refresh();
});
