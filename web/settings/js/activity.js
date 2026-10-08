const PAGE_NAMES = {home:'Strona główna',games:'Moje gry',control:'Panel sterowania',editor:'Edytor gry','game-settings':'Ustawienia rozgrywki',bases:'Bazy pytań','base-explorer':'Edytor bazy',logo:'Logo',polls:'Ankieta','polls-hub':'Ankiety',subscriptions:'Subskrypcje',account:'Konto',marketplace:'Gry społeczności',manual:'Instrukcja','connect-device':'Podłącz urządzenie'};
const CONTEXT_NAMES = {control:'Panel sterowania',editor:'Edytor gry','game-settings':'Ustawienia rozgrywki','logo-editor':'Edytor logo','base-explorer':'Edytor bazy'};
const RESOURCE_NAMES = {game:'Gra',logo:'Logo',base:'Baza',base_question:'Pytanie bazy',base_folder:'Folder bazy',base_tag:'Tag bazy'};
import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-08T07150";

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
export function activityDetailRows(data) {
  const result=[];
  const editLocks=data.locks.filter(lock=>lock.holder_context!=='control');
  function add(user,activity,resource,context,stamp) {
    result.push({user,activity,resource:resource||'—',context,last_seen_at:stamp?new Date(stamp).toISOString():null});
  }
  for (const game of data.games) {
    const activity=gameActivity(game);
    const devices=game.devices.map(d=>({display:'Wyświetlacz',host:'Prowadzący',buzzer:'Przycisk'})[d]||d).join(', ');
    const contacts=[game.session_seen_at,game.devices_seen_at,...data.pages.filter(page=>page.game_id===game.game_id).map(page=>page.last_seen_at),...data.locks.filter(lock=>lock.resource_id===game.game_id).map(lock=>lock.heartbeat_at)].filter(Boolean).map(Date.parse);
    add(game.username,activity.label+(stepName(game)?' · '+stepName(game):''),game.name,`Zestaw ${game.control_version}${devices?' · '+devices:''}`,contacts.length?Math.max(...contacts):null,activity.risk);
  }
  for (const lock of editLocks) {
    const context=String(lock.holder_context||'').split(':')[0];
    add(lock.username,'Aktywna edycja',`${RESOURCE_NAMES[lock.resource_type]||'Zasób'}${lock.resource_name?' — '+lock.resource_name:''}`,CONTEXT_NAMES[context]||'Edytor',lock.heartbeat_at);
  }
  for (const page of data.pages) {
    if (['control'].includes(page.page) && data.games.some(g=>g.game_id===page.game_id)) continue;
    add(page.username,PAGE_NAMES[page.page]||'Otwarta strona',null,page.visible?'Karta widoczna':'Karta w tle',page.last_seen_at);
  }
  return result;
}

export function startActivityPanel() {
  const root=document.getElementById('statsPanel');
  if (!root) return;
  const refresh=document.getElementById('btnStatsRefresh');
  let pending=false;
  let history=null;
  let period='hour';
  const periods=[{value:'hour',label:'Godzinowo — 48 godzin'},{value:'day',label:'Dziennie — 30 dni'},{value:'week',label:'Tygodniowo — 90 dni'}];
  const chart=document.querySelector("[data-activity-chart]");
  function paintChart() {
    chart.replaceChildren();
    const items=history?.[period]||[];
    if (!items.length) {
      const empty=document.createElement('div');empty.className='activity-chart-empty';
      const title=document.createElement('strong');title.textContent='Brak danych';
      const hint=document.createElement('span');hint.textContent='W tym przedziale nie zarejestrowano aktywności.';
      empty.append(title,hint);chart.append(empty);return;
    }
    const ns='http://www.w3.org/2000/svg';
    function shape(tag,attrs,text) {
      const node=document.createElementNS(ns,tag);
      for (const [key,value] of Object.entries(attrs||{})) node.setAttribute(key,String(value));
      if (text!=null) node.textContent=text;
      return node;
    }
    const maximum=Math.max(4,Math.ceil(Math.max(...items.map(item=>Number(item.users)))/4)*4);
    const left=48,right=878,top=22,bottom=210;
    const svg=shape('svg',{viewBox:'0 0 920 260',role:'group','aria-label':'Aktywni użytkownicy — '+periods.find(item=>item.value===period).label});
    const defs=shape('defs');const gradient=shape('linearGradient',{id:'activity-line-fill',x1:0,y1:0,x2:0,y2:1});
    gradient.append(shape('stop',{offset:'0%','stop-color':'#ffeaa6','stop-opacity':'.2'}),shape('stop',{offset:'100%','stop-color':'#ffeaa6','stop-opacity':'.01'}));defs.append(gradient);svg.append(defs);
    for (let tick=0;tick<=4;tick++) {
      const y=bottom-(bottom-top)*tick/4;
      svg.append(shape('line',{x1:left,x2:right,y1:y,y2:y,stroke:'rgba(255,255,255,.09)','stroke-dasharray':'3 5'}));
      svg.append(shape('text',{x:left-12,y:y+4,fill:'rgba(255,255,255,.5)','font-size':11,'text-anchor':'end'},maximum*tick/4));
    }
    const points=items.map((item,i)=>({item,x:items.length===1?(left+right)/2:left+(right-left)*i/(items.length-1),y:bottom-(bottom-top)*Number(item.users)/maximum}));
    const path=points.map((point,i)=>(i?'L':'M')+point.x+','+point.y).join(' ');
    if (points.length>1) {
      svg.append(shape('path',{d:path+' L'+points.at(-1).x+','+bottom+' L'+points[0].x+','+bottom+' Z',fill:'url(#activity-line-fill)'}));
      svg.append(shape('path',{d:path,fill:'none',stroke:'#ffeaa6','stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round','vector-effect':'non-scaling-stroke'}));
    }
    const tooltip=document.createElement('div');tooltip.className='stat-sub activity-chart-tooltip';
    function label(item) {return new Date(item.bucket).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw',day:'2-digit',month:'2-digit',...(period==='hour'?{hour:'2-digit',minute:'2-digit'}:{})});}
    function describe(item) {tooltip.textContent=label(item)+' · Użytkownicy: '+item.users;}
    describe(items.at(-1));
    const stride=Math.max(1,Math.ceil((points.length-1)/4));
    for (const [i,point] of points.entries()) {
      const description=label(point.item)+': '+point.item.users+' użytkowników';
      const dot=shape('circle',{cx:point.x,cy:point.y,r:4,fill:'#10172a',stroke:'#ffeaa6','stroke-width':2,tabindex:0,'aria-label':description});
      dot.append(shape('title',{},description));
      for (const event of ['pointerenter','focus','click']) dot.addEventListener(event,()=>describe(point.item));
      svg.append(dot);
      if (i===0||i===points.length-1||i%stride===0) svg.append(shape('text',{x:point.x,y:240,fill:'rgba(255,255,255,.5)','font-size':11,'text-anchor':points.length===1?'middle':i===0?'start':i===points.length-1?'end':'middle'},label(point.item)));
    }
    chart.append(tooltip,svg);
  }
  initUiSelect(document.getElementById('activityChartPeriod'),{options:periods,value:period,onChange(value){period=value;paintChart();}});
  async function load(force=false) {
    if (pending || (!force && (document.hidden || (root.closest('[hidden]') && document.getElementById('panelScreen')?.hidden)))) return;
    pending=true;refresh.disabled=true;
    try {
      const response=await fetch('/_admin_api/activity',{credentials:'include',cache:'no-store'});
      if (!response.ok) throw new Error('unavailable');
      const data=await response.json();if (!data.ok) throw new Error('unavailable');
      history=data.history;paintChart();
      const users=new Set([...data.pages.map(p=>p.user_id),...data.locks.map(l=>l.holder_user_id),...data.games.map(g=>g.user_id)].filter(Boolean));
      const riskGames=data.games.filter(g=>gameActivity(g).risk).length;
      const editLocks=data.locks.filter(l=>l.holder_context!=='control');
      document.getElementById('statActivityValue').textContent=String(users.size);
      document.getElementById('maintenanceActivityValue').textContent=String(users.size);
      const counters=`Gry w toku lub możliwe: ${riskGames} | Edycje: ${editLocks.length}`;
      document.getElementById('statActivitySub').textContent=counters;
      document.getElementById('maintenanceActivitySummary').textContent=counters;
      document.getElementById('maintenanceActivityTime').textContent='Odświeżono: '+new Date(data.generated_at).toLocaleTimeString('pl-PL')+' · Uwzględnia wykluczenia';
    } catch {
      document.getElementById('maintenanceActivitySummary').textContent='Nie udało się sprawdzić aktywności — poprzednie dane mogą być nieaktualne.';
      document.getElementById('statActivityValue').textContent='—';
      document.getElementById('maintenanceActivityValue').textContent='—';
      document.getElementById('statActivitySub').textContent='Brak aktualnego potwierdzenia';
    } finally {pending=false;refresh.disabled=false;}
  }
  refresh.addEventListener('click',()=>void load(true));
  const timer=setInterval(()=>void load(),15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  void load(true);
}
