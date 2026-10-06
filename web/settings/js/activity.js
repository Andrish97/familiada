const PAGE_NAMES = {home:'Strona główna',games:'Moje gry',control:'Panel sterowania',control2:'Panel sterowania 2',editor:'Edytor gry','game-settings':'Ustawienia rozgrywki','game-settings2':'Ustawienia rozgrywki 2',bases:'Bazy pytań','base-explorer':'Edytor bazy','logo-editor':'Edytor logo',polls:'Ankieta','polls-hub':'Ankiety',subscriptions:'Subskrypcje',account:'Konto',marketplace:'Gry społeczności',manual:'Instrukcja','connect-device':'Podłącz urządzenie'};
const CONTEXT_NAMES = {control:'Panel sterowania',editor:'Edytor gry','game-settings':'Ustawienia rozgrywki','game-settings2':'Ustawienia rozgrywki 2','logo-editor':'Edytor logo','base-explorer':'Edytor bazy'};
const RESOURCE_NAMES = {game:'Gra',logo:'Logo',base:'Baza',base_question:'Pytanie bazy',base_folder:'Folder bazy',base_tag:'Tag bazy'};
import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-06T19222";

export function gameActivity(game) {
  const open = !game.ended_at && ['started','playing','final'].includes(game.status);
  const preparing = /^(devices_|settings_|r_intro)/.test(game.step || '');
  if (game.control_version === 2 && game.step === 'r_gameEnd') return {label:'Zakończenie gry',risk:false};
  if (preparing) return {label:'Przygotowanie gry',risk:false};
  if (game.operator_online && open) return {label:game.status==='final'?'Finał w toku':'Gra w toku',risk:true};
  if (open) return {label:'Możliwa trwająca gra',risk:true};
  if (game.operator_online || game.control_lock) return {label:'Otwarty panel sterowania',risk:false};
  return {label:'Podłączone urządzenia',risk:false};
}
function stepName(game) {
  if (!game.step) return '';
  if (game.step.startsWith('devices_')) return 'Podłączanie urządzeń';
  if (game.step.startsWith('settings_')) return 'Podsumowanie ustawień';
  if (game.step==='r_intro') return 'Rozpoczęcie gry';
  if (game.step==='r_gameEnd') return 'Zakończenie gry';
  if (game.step.startsWith('f_p1_entry')) return 'Finał — wpisywanie gracza 1';
  if (game.step.startsWith('f_p2_entry')) return 'Finał — wpisywanie gracza 2';
  if (/^f_p[12]_map/.test(game.step)) return 'Finał — dopasowanie i odsłanianie';
  if (game.step.startsWith('f_')) return 'Finał — przejście';
  return {BUZZ:'Pojedynek',PLAY:'Odpowiedzi drużyny',STEAL:'Kradzież banku',REVEAL:'Odsłanianie pozostałych odpowiedzi'}[game.phase] || 'Rundy';
}
export function startActivityPanel() {
  const root=document.getElementById('maintenanceActivity');
  if (!root) return;
  const summary=root.querySelector('[data-activity-summary]');
  const rows=root.querySelector('[data-activity-rows]');
  const time=root.querySelector('[data-activity-time]');
  const refresh=root.querySelector('button');
  let pending=false;
  let history=null;
  let period='hour';
  const periods=[{value:'hour',label:'Godzinowo — 48 godzin'},{value:'day',label:'Dziennie — 30 dni'},{value:'week',label:'Tygodniowo — 90 dni'}];
  const chart=document.querySelector("[data-activity-chart]");
  function paintChart() {
    chart.replaceChildren();
    const items=history?.[period]||[];
    if (!items.length) { chart.textContent="Brak historii w tym przedziale. Dane zbierają się od wdrożenia.";return; }
    const max=Math.max(1,...items.map(item=>Number(item.users)));
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 900 220");svg.setAttribute("role","img");svg.setAttribute("aria-label","Aktywni użytkownicy — "+periods.find(item=>item.value===period).label);
    const width=840/items.length;
    for (const [i,item] of items.entries()) {
      const rect=document.createElementNS(svg.namespaceURI,"rect");const h=160*Number(item.users)/max;
      rect.setAttribute("x",String(40+i*width));rect.setAttribute("y",String(180-h));rect.setAttribute("width",String(Math.max(1,width-3)));rect.setAttribute("height",String(h));rect.setAttribute("fill","#ffeaa6");
      const label=new Date(item.bucket).toLocaleString("pl-PL",{timeZone:"Europe/Warsaw",day:"2-digit",month:"2-digit",...(period==="hour"?{hour:"2-digit",minute:"2-digit"}:{})});
      const title=document.createElementNS(svg.namespaceURI,"title");title.textContent=label+": "+item.users+" użytkowników";rect.append(title);svg.append(rect);
      if (i===0 || i===items.length-1 || i%Math.ceil(items.length/6)===0) {
        const text=document.createElementNS(svg.namespaceURI,"text");text.setAttribute("x",String(40+i*width));text.setAttribute("y","205");text.setAttribute("fill","currentColor");text.setAttribute("font-size","11");text.textContent=label;svg.append(text);
      }
    }
    const scale=document.createElementNS(svg.namespaceURI,"text");scale.setAttribute("x","4");scale.setAttribute("y","20");scale.setAttribute("fill","currentColor");scale.setAttribute("font-size","12");scale.textContent=String(max);svg.append(scale);chart.append(svg);
    const table=document.createElement("details");const caption=document.createElement("summary");caption.textContent="Pokaż wartości wykresu";table.append(caption);
    for (const item of items) {const line=document.createElement("div");line.textContent=new Date(item.bucket).toLocaleString("pl-PL",{timeZone:"Europe/Warsaw"})+" — "+item.users;table.append(line);}
    chart.append(table);
  }
  initUiSelect(document.getElementById('activityChartPeriod'),{options:periods,value:period,onChange(value){period=value;paintChart();}});
  function row(user,activity,resource,context,stamp,risk=false) {
    const item=document.createElement('tr');
    if (risk) item.className='activity-risk';
    for (const value of [user,activity,resource,context,stamp?new Date(stamp).toLocaleTimeString('pl-PL'):'—']) {
      const cell=document.createElement('td');cell.textContent=value || '—';item.append(cell);
    }
    rows.append(item);
  }
  async function load(force=false) {
    if (pending || (!force && (document.hidden || (root.closest('[hidden]') && document.getElementById('panelScreen')?.hidden)))) return;
    pending=true;refresh.disabled=true;
    try {
      const response=await fetch('/_admin_api/activity',{credentials:'include',cache:'no-store'});
      if (!response.ok) throw new Error('unavailable');
      const data=await response.json();if (!data.ok) throw new Error('unavailable');
      history=data.history;paintChart();
      rows.replaceChildren();
      const users=new Set([...data.pages.map(p=>p.user_id),...data.locks.map(l=>l.holder_user_id),...data.games.map(g=>g.user_id)].filter(Boolean));
      const riskGames=data.games.filter(g=>gameActivity(g).risk).length;
      const editLocks=data.locks.filter(l=>l.holder_context!=='control');
      summary.textContent=`Użytkownicy: ${users.size} · Gry w toku lub możliwe: ${riskGames} · Blokady edycji: ${editLocks.length}`+(data.truncated?' · Lista ograniczona do 500 wpisów w każdej kategorii':'');
      document.getElementById('statActivityValue').textContent=String(users.size);
      document.getElementById('maintenanceActivityValue').textContent=String(users.size);
      const counters=`Gry w toku lub możliwe: ${riskGames} | Edycje: ${editLocks.length}`;
      document.getElementById('statActivitySub').textContent=counters;
      document.getElementById('maintenanceActivitySummary').textContent=counters;
      document.getElementById('maintenanceActivityTime').textContent='Odświeżono: '+new Date(data.generated_at).toLocaleTimeString('pl-PL')+' · Uwzględnia wykluczenia';
      for (const game of data.games) {
        const activity=gameActivity(game);
        const devices=game.devices.map(d=>({display:'Wyświetlacz',host:'Prowadzący',buzzer:'Przycisk'})[d]||d).join(', ');
        const contacts=[game.session_seen_at,game.devices_seen_at,...data.pages.filter(page=>page.game_id===game.game_id).map(page=>page.last_seen_at),...data.locks.filter(lock=>lock.resource_id===game.game_id).map(lock=>lock.heartbeat_at)].filter(Boolean).map(Date.parse);
        row(game.username,activity.label+(stepName(game)?' · '+stepName(game):''),game.name,`Zestaw ${game.control_version}${devices?' · '+devices:''}`,contacts.length?Math.max(...contacts):null,activity.risk);
      }
      for (const lock of editLocks) {
        const context=String(lock.holder_context||'').split(':')[0];
        row(lock.username,'Aktywna edycja',`${RESOURCE_NAMES[lock.resource_type]||'Zasób'}${lock.resource_name?' — '+lock.resource_name:''}`,CONTEXT_NAMES[context]||'Edytor',lock.heartbeat_at);
      }
      for (const page of data.pages) {
        if (['control','control2'].includes(page.page) && data.games.some(g=>g.game_id===page.game_id)) continue;
        row(page.username,PAGE_NAMES[page.page]||'Otwarta strona',null,page.visible?'Karta widoczna':'Karta w tle',page.last_seen_at);
      }
      if (!rows.childElementCount) {
        const item=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=5;cell.className='activity-empty';cell.textContent='Nie wykryto aktywności.';item.append(cell);rows.append(item);
      }
      time.textContent='Ostatnie odświeżenie: '+new Date(data.generated_at).toLocaleTimeString('pl-PL');
    } catch {
      summary.textContent='Nie udało się sprawdzić aktywności. Widoczne dane mogą być nieaktualne.';
      document.getElementById('maintenanceActivitySummary').textContent='Nie udało się sprawdzić aktywności — poprzednie dane mogą być nieaktualne.';
      document.getElementById('statActivityValue').textContent='—';
      document.getElementById('maintenanceActivityValue').textContent='—';
      document.getElementById('statActivitySub').textContent='Brak aktualnego potwierdzenia';
      time.textContent='Brak aktualnego potwierdzenia — nie traktuj tego jako braku użytkowników.';
    } finally {pending=false;refresh.disabled=false;}
  }
  refresh.addEventListener('click',()=>void load(true));
  document.getElementById('btnStatsRefresh')?.addEventListener('click',()=>void load(true));
  const tile=document.getElementById('statActivityBox');
  const showDetails=()=>root.scrollIntoView({behavior:'smooth',block:'start'});
  tile?.addEventListener('click',showDetails);
  tile?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showDetails();}});
  const timer=setInterval(()=>void load(),15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  void load(true);
}
