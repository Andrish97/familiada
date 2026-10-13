// Zrzuty prawdziwych stron aplikacji z lokalnymi danymi demonstracyjnymi.
// Uruchom: node scripts/agent-tools/capture-layout-screenshots.cjs
// Opcje: --pages=games,bases,logo --out=docs/img/e20-layout
// Strony i CSS pochodzą z web/. Supabase jest atrapą: żadne dane nie są
// pobierane z ani zapisywane do zewnętrznej bazy.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../../tests/node_modules/playwright');

const root = path.resolve(__dirname, '../../web');
const previewGameId = '00000000-0000-4000-8000-000000000002';
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...parts] = arg.replace(/^--/, '').split('=');
  return [key, parts.join('=')];
}));
const requestedPageNames = (args.pages || 'games,bases,logo').split(',').filter(Boolean);
const out = path.resolve(process.cwd(), args.out || 'docs/img/e20-layout');
const pages = {
  home: { url: '/?lang=pl', ready: 'body' },
  login: { url: '/login/?force_auth=1&lang=pl', ready: 'body' },
  loginConfirm: { url: '/login/confirm/?lang=pl', ready: 'body' },
  loginReset: { url: '/login/reset/?lang=pl', ready: 'body' },
  games: { url: '/games/?lang=pl', ready: '#grid .card' },
  bases: { url: '/bases/?lang=pl', ready: '#mineGrid > *' },
  logo: { url: '/logo/?lang=pl', ready: '.logoTile' },
  marketplace: { url: '/marketplace/?lang=pl', ready: 'body' },
  gameEditor: { url: `/games/editor/?id=g1&lang=pl`, ready: 'body' },
  baseExplorer: { url: '/bases/explorer/?id=b1&lang=pl', ready: 'body' },
  logoText: { url: '/logo/editor/text/?id=l1&lang=pl', ready: 'body' },
  logoDraw: { url: '/logo/editor/draw/?id=l1&lang=pl', ready: 'body' },
  logoImage: { url: '/logo/editor/image/?id=l1&lang=pl', ready: 'body' },
  gameSettings: { url: '/games/settings/?id=g1&lang=pl', ready: 'body' },
  settings: { url: '/settings/?lang=pl', ready: 'body' },
  settingsReports: { url: '/settings/?tab=reports&lang=pl', ready: 'body' },
  settingsMail: { url: '/settings/?tab=mail&lang=pl', ready: 'body' },
  account: { url: '/account/?lang=pl', ready: 'body' },
  polls: { url: '/polls/?id=g3&lang=pl', ready: 'body' },
  friends: { url: '/friends/?lang=pl', ready: '#contactsLoadMessage' },
  subscribers: { url: '/subscribers/?lang=pl', ready: '#contactsLoadMessage' },
  tasks: { url: '/tasks/?lang=pl', ready: 'body' },
  connect: { url: '/connect/?lang=pl', ready: 'body' },
  manual: { url: '/manual/?lang=pl', ready: 'body' },
  privacy: { url: '/privacy/?lang=pl', ready: 'body' },
  pollText: { url: `/polls/vote/text/?id=${previewGameId}&key=preview&lang=pl`, ready: '#qbox' },
  pollPoints: { url: `/polls/vote/points/?id=${previewGameId}&key=preview&lang=pl`, ready: '#qbox' },
  go: { url: '/go/?lang=pl', ready: '#title' },
  notfound: { url: '/404.html?lang=pl', ready: '#title' },
  maintenance: { url: '/maintenance/?lang=pl', ready: 'body' },
  mail: { url: '/mail/?lang=pl', ready: '#mailEntry' },
  control: { url: '/control/?lang=pl', ready: 'body' },
  display: { url: '/control/display/?id=g2&key=preview&lang=pl', ready: 'body' },
  host: { url: '/control/host/?id=g2&key=preview&lang=pl', ready: 'body' },
  buzzer: { url: '/control/buzzer/?id=g2&key=preview&lang=pl', ready: 'body' },
  pollQr: { url: `/polls/vote/qr/?url=${encodeURIComponent(`https://www.familiada.online/polls/vote/text/?id=${previewGameId}&key=preview`)}&lang=pl`, ready: '#qr' },
  connectTv: { url: '/connect/tv/?lang=pl', ready: 'body' },
};
const pageNames = requestedPageNames.includes('all') ? Object.keys(pages) : requestedPageNames;
const allPagesAudit = requestedPageNames.includes('all');
const auditMode = allPagesAudit || args.audit === 'true';
const auditRows = [];
const actionOrder = {
  games: ['btnDuplicate', 'btnExport', 'btnExportBase', 'btnImport', 'btnSendCopy'],
  bases: ['btnDuplicate', 'btnExport', 'btnImport'],
  logo: ['btnDuplicate', 'btnExport', 'btnImport', 'btnSendCopy'],
};
const devices = [
  { name: 'macbook', width: 1440, height: 900, screenWidth: 1440, screenHeight: 900, kind: 'desktop' },
  { name: 'ipad-portrait', width: 744, height: 1133, screenWidth: 744, screenHeight: 1133, kind: 'ipad', safe: [24, 0, 20, 0] },
  { name: 'ipad-landscape', width: 1133, height: 744, screenWidth: 1133, screenHeight: 744, kind: 'ipad', safe: [24, 0, 20, 0] },
  { name: 'iphone-portrait', width: 390, height: 844, screenWidth: 390, screenHeight: 844, kind: 'iphone', safe: [47, 0, 34, 0] },
  { name: 'iphone-landscape', width: 844, height: 390, screenWidth: 844, screenHeight: 390, kind: 'iphone', safe: [0, 47, 21, 47] },
  { name: 'desktop-phone-window', width: 390, height: 844, screenWidth: 1920, screenHeight: 1080, kind: 'desktop' },
  { name: 'ipad-split-landscape', width: 560, height: 820, screenWidth: 1180, screenHeight: 820, kind: 'ipad', safe: [24, 0, 20, 0] },
];
const selectedDevices = args.devices ? devices.filter(({ name }) => args.devices.split(',').includes(name)) : devices.slice(0, 5);
const layoutIssues = [];
const checkLayout = (condition, message) => {
  if (!condition) return;
  if (auditMode) layoutIssues.push(message);
  else throw new Error(message);
};

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'podglad@example.invalid',
  is_anonymous: false,
  user_metadata: { username: 'Podgląd' },
  app_metadata: {},
};
const now = new Date().toISOString();
const games = [
  ['g1', 'Wakacyjna Familiada', 'prepared', 'draft'],
  ['g2', 'Rodzinne spotkanie', 'prepared', 'ready'],
  ['g3', 'Integracja zespołu', 'poll_text', 'draft'],
  ['g4', 'Wieczór quizowy', 'poll_points', 'draft'],
].map(([id, name, type, status]) => ({ id, name, type, status, owner_id: user.id, created_at: now, updated_at: now, rules_state: null, received_from_label: null, received_from_identity: null, source_market_id: null }));
const logoRows = (text) => Array.from({ length: 10 }, (_, index) => index === 4 ? text.padStart(Math.floor((30 - text.length) / 2) + text.length).padEnd(30).slice(0, 30) : ' '.repeat(30));
const logos = [
  { id: 'l1', name: 'Familiada klasyczna', type: 'GLYPH_30x10', bits_b64: '', w: 30, h: 10, layers: [{ color: 'main', rows: logoRows('FAMILIADA') }], source_mode: 'TEXT' },
  { id: 'l2', name: 'Wakacje 2026', type: 'GLYPH_30x10', bits_b64: '', w: 30, h: 10, layers: [{ color: 'main', rows: logoRows('WAKACJE') }], source_mode: 'TEXT' },
  { id: 'l3', name: 'Rodzinny turniej', type: 'GLYPH_30x10', bits_b64: '', w: 30, h: 10, layers: [{ color: 'main', rows: logoRows('RODZINA') }], source_mode: 'TEXT' },
];
const bases = [
  { id: 'b1', name: 'Polska i okolice', owner_id: user.id, created_at: now, updated_at: now },
  { id: 'b2', name: 'Rodzinne wspomnienia', owner_id: user.id, created_at: now, updated_at: now },
  { id: 'b3', name: 'Podróże i wakacje', owner_id: user.id, created_at: now, updated_at: now },
];

const supabaseStub = `(() => {
  const user = ${JSON.stringify(user)};
  const session = { access_token: 'local-preview-token', refresh_token: 'local-preview-refresh', token_type: 'bearer', expires_at: 4102444800, user };
  const tables = { games: ${JSON.stringify(games)}, question_bases: ${JSON.stringify(bases)}, user_logos: ${JSON.stringify(logos)}, question_base_shares: [], qb_categories: [], qb_questions: [], qb_tags: [] };
  function chain(value) {
    const result = { data: value, error: null, count: Array.isArray(value) ? value.length : 0 };
    let proxy;
    const fn = () => proxy;
    proxy = new Proxy(fn, { get(_t, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      if (key === 'single' || key === 'maybeSingle') return () => Promise.resolve({ data: Array.isArray(value) ? value[0] || null : value, error: null });
      return () => proxy;
    }, apply() { return proxy; } });
    return proxy;
  }
  const rpcData = {
    reserved_username_prefixes_list: [], list_shared_bases_ext: [], base_declines_list_mine: [],
    resource_copy_inbox_list: [], resource_copy_badges: [], site_activity_ping: null,
    acquire_edit_lock_mode: { ok: true }, game_validate: { poll_entry: { ok: true }, edit: { ok: true }, play: { ok: true } },
    release_edit_lock: { ok: true },
    poll_state: { ok: true, state: 'open', type: 'poll_text' },
    poll_get_payload: { game: { id: '${previewGameId}', name: 'Rodzinne spotkanie', type: 'poll_text', status: 'poll_open' }, questions: [{ id: '00000000-0000-4000-8000-000000000003', ord: 1, text: 'Co zabierzesz na rodzinny piknik?', answers: [{ id: 'a1', ord: 1, text: 'Koc' }, { id: 'a2', ord: 2, text: 'Kosz' }, { id: 'a3', ord: 3, text: 'Piłkę' }] }] },
    get_poll_game: { game: { id: '${previewGameId}', name: 'Rodzinne spotkanie', type: 'poll_text', status: 'poll_open' } },
  };
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }), getUser: async () => ({ data: { user }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }), refreshSession: async () => ({ data: { session }, error: null }) },
    from: (table) => chain(tables[table] || []),
    rpc: (name) => {
      let data = Object.prototype.hasOwnProperty.call(rpcData, name) ? rpcData[name] : [];
      if (['poll_get_payload', 'get_poll_game', 'poll_state'].includes(name)) {
        data = JSON.parse(JSON.stringify(data));
        const type = location.pathname.includes('/points/') ? 'poll_points' : 'poll_text';
        if (data.game) data.game.type = type;
        if (name === 'poll_state') data.type = type;
      }
      return Promise.resolve({ data, error: null });
    },
    channel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe() {} }; return c; }, removeChannel() {},
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), list: async () => ({ data: [], error: null }), download: async () => ({ data: null, error: null }) }) },
    functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
  };
  window.supabase = { createClient: () => client };
})();`;

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  res.on('error', () => {});
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(`${root}${path.sep}`)) return !res.headersSent && !res.destroyed ? res.writeHead(403).end('Forbidden') : undefined;
  try { res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file)); }
  catch { if (!res.headersSent && !res.destroyed) res.writeHead(404).end('Not found'); }
});

function deviceCss(device) {
  const [top, right, bottom, left] = device.safe || [0, 0, 0, 0];
  const radius = device.kind === 'iphone' ? 42 : device.kind === 'ipad' ? 28 : 0;
  const notch = device.kind === 'iphone'
    ? (device.width > device.height
      ? '<div id="preview-notch" class="landscape"></div>'
      : '<div id="preview-notch" class="portrait"></div>')
    : '';
  return { css: `:root{--safe-area-top:${top}px!important;--safe-area-right:${right}px!important;--safe-area-bottom:${bottom}px!important;--safe-area-left:${left}px!important}body:has(.topbar){--topbar-h:calc(max(12px,${top}px) + 56px)!important;padding-top:var(--topbar-h)!important}.topbar{min-height:var(--topbar-h)!important}html{background:#000;border-radius:${radius}px;overflow:hidden}body{border-radius:${radius}px;overflow:hidden}#preview-device-frame{position:fixed;inset:0;z-index:2147483646;pointer-events:none;border:1px solid rgba(255,255,255,.2);border-radius:${radius}px}#preview-notch{position:fixed;z-index:2147483647;background:#000;border:1px solid rgba(255,255,255,.24);box-shadow:0 0 0 2px rgba(0,0,0,.7);box-sizing:border-box;pointer-events:none}#preview-notch.portrait{top:5px;left:50%;transform:translateX(-50%);width:126px;height:34px;border-radius:22px}#preview-notch.landscape{left:5px;top:50%;transform:translateY(-50%);width:34px;height:126px;border-radius:22px}`, markup: `${notch}<div id="preview-device-frame" aria-hidden="true"></div>` };
}

(async () => {
  for (const pageName of pageNames) if (!pages[pageName]) throw new Error(`Nieznana strona: ${pageName}`);
  fs.mkdirSync(out, { recursive: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const device of selectedDevices) {
      for (const pageName of pageNames) {
        const pageSpec = pages[pageName];
        const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, screen: { width: device.screenWidth, height: device.screenHeight }, locale: 'pl-PL', deviceScaleFactor: device.kind === 'iphone' ? 3 : device.kind === 'ipad' ? 2 : 1, isMobile: device.kind !== 'desktop', hasTouch: device.kind !== 'desktop' });
        await context.addInitScript(({ stub, safe }) => {
          try { localStorage.setItem('sb-api-auth-token', 'preview'); localStorage.setItem('fam:app_rating_suppressed', 'true'); localStorage.setItem('uiLang', 'pl'); } catch {}
          if (document.documentElement && safe) ['top', 'right', 'bottom', 'left'].forEach((side, index) => document.documentElement.style.setProperty(`--safe-area-${side}`, `${safe[index]}px`));
          (0, eval)(stub);
        }, { stub: supabaseStub, safe: device.safe || [0, 0, 0, 0] });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') console.error(`[${pageName}/${device.name}] ${message.text()}`); });
        await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2**', (route) => route.fulfill({ contentType: 'text/javascript', body: '/* app preview injects its own local Supabase client */' }));
        await page.route('**/cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm', (route) => route.fulfill({ contentType: 'text/javascript', body: "export default { toDataURL: async () => 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' };" }));
        await page.route('**/_api/mail/session', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, email: 'podglad@example.invalid', notifications_enabled: true, subscriptions: [], items: [] }) }));
        if (pageName.startsWith('settings')) {
          await page.route('**/_admin_api/**', async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            const body = pathname.endsWith('/me')
              ? { ok: true, email: 'admin-preview@example.invalid' }
              : pathname.endsWith('/activity')
                ? { ok: true, history: { hour: [], day: [], week: [] }, games: [], pages: [], locks: [] }
              : pathname.endsWith('/state')
                ? { enabled: false, mode: 'message', message: 'Podgląd lokalny' }
                : {};
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
          });
          await page.route('**/cdn-cgi/access/**', (route) => route.fulfill({ status: 204, body: '' }));
        }
        await page.route('**/fonts.googleapis.com/**', (route) => route.abort());
        await page.goto(`${origin}${pageSpec.url}`, { waitUntil: 'domcontentloaded' });
        try {
          if (pageName === 'pollQr') {
            await page.waitForFunction(() => {
              const qr = document.querySelector('#qr');
              const guard = document.querySelector('#pageGuard');
              return (!!qr && getComputedStyle(qr).display !== 'none') || (!!guard && getComputedStyle(guard).display !== 'none');
              }, { timeout: auditMode ? 2500 : 20000 });
          } else await page.waitForSelector(pageSpec.ready, { timeout: auditMode ? 2500 : 20000 });
        }
        catch (error) {
          console.error(`[${pageName}/${device.name}] selector wait failed: ${error.message}`);
          console.error('Preview state:', await page.evaluate(() => ({ url: location.href, title: document.title, keys: Object.keys(localStorage), body: document.body?.innerText?.slice(0, 700), errors: [...document.querySelectorAll('[role=alert]')].map((el) => el.textContent) })), errors);
          if (!auditMode) throw error;
        }
        await page.waitForTimeout(500);
        if (pageName === 'games' && device.name === 'iphone-portrait') {
          await page.locator('.slot-prepared').evaluate((tab) => {
            tab.setAttribute('data-copy-count', '9');
            for (const label of [tab.querySelector('.tab-label'), tab.querySelector('.tab-active')].filter(Boolean)) {
              const badge = document.createElement('span');
              badge.className = 'tab-copy-count';
              badge.setAttribute('aria-hidden', 'true');
              badge.textContent = '9';
              label.append(badge);
            }
          });
        }
        const frame = deviceCss(device);
        await page.addStyleTag({ content: frame.css });
        await page.evaluate((markup) => document.documentElement.insertAdjacentHTML('beforeend', markup), frame.markup);
        await page.evaluate(() => {
          const bar = document.querySelector('.topbar');
          bar?.classList.remove('is-hidden-mobile');
          bar?.classList.add('topbar-ready');
          bar?.style.setProperty('transform', 'none', 'important');
          bar?.style.setProperty('opacity', '1', 'important');
          bar?.style.setProperty('visibility', 'visible', 'important');
          window.scrollTo(0, 0);
        });
        const metrics = await page.evaluate(() => {
          const main = document.querySelector('main.wrap, main.maintenance-main');
          const content = main?.querySelector('.bar, .tabs-card, .logoShell') || main;
          const box = content?.getBoundingClientRect();
          const titleBox = main?.querySelector('.bar .title')?.getBoundingClientRect();
          const bottom = main?.querySelector('.games-bottom');
          const searchButton = main?.querySelector('.list-search-open');
          const searchField = main?.querySelector('.list-search-field');
          const left = main?.querySelector('.games-bottom-left');
          const right = main?.querySelector('.games-bottom-right');
          const footer = document.querySelector('.footer');
          const topbarNav = document.querySelector('.topbar-section-2');
          const topbarNavVisible = !!topbarNav && getComputedStyle(topbarNav).display !== 'none';
          const topbarNavOverflow = topbarNavVisible ? Math.max(0, topbarNav.scrollWidth - topbarNav.clientWidth) : 0;
          const safe = ['top', 'right', 'bottom', 'left'].map((side) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--safe-area-${side}`)) || 0);
          const footerChildren = footer ? [...footer.children].map((el) => el.getBoundingClientRect().bottom) : [];
          const footerContentBottom = footerChildren.length ? Math.max(...footerChildren) : null;
          return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, topbarNavOverflow, mainTop: main?.getBoundingClientRect().top, bodyPaddingTop: parseFloat(getComputedStyle(document.body).paddingTop) || 0, topbarH: getComputedStyle(document.body).getPropertyValue('--topbar-h'), titleTop: titleBox?.top, topbarTop: document.querySelector('.topbar')?.getBoundingClientRect().top, topbarBottom: document.querySelector('.topbar')?.getBoundingClientRect().bottom, footerContentBottomGap: footerContentBottom != null ? innerHeight - footerContentBottom : null, footerWrap: bottom ? getComputedStyle(bottom).flexWrap : null, separatorWidth: bottom ? parseFloat(getComputedStyle(bottom).borderTopWidth) : 0, searchButtonH: searchButton?.getBoundingClientRect().height || 0, searchFieldH: searchField?.getBoundingClientRect().height || 0, leftRight: left?.getBoundingClientRect().right, rightLeft: right?.getBoundingClientRect().left, leftWrap: left ? getComputedStyle(left).flexWrap : null, rightWrap: right ? getComputedStyle(right).flexWrap : null, contentLeft: box?.left || 0, contentRight: box?.right || innerWidth, mainPaddingBottom: main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0, safe, cards: document.querySelectorAll('#grid .card, #mineGrid > *, .logoTile').length, actions: [...document.querySelectorAll('.games-bottom-right button')].map((button) => button.id), tabs: [...document.querySelectorAll('.tabs-strip .tab-label')].map((el) => ({ label: el.textContent.trim().replace(/\s+/g, ' '), fontSize: getComputedStyle(el).fontSize, textWidth: el.scrollWidth, availableWidth: el.clientWidth })) };
        });
        const footerSafeMetrics = await page.evaluate(async () => {
          const footer = document.querySelector('.footer');
          if (!footer) return null;
          window.scrollTo(0, document.documentElement.scrollHeight);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const children = [...footer.children].map((el) => el.getBoundingClientRect().bottom);
          const contentBottom = children.length ? Math.max(...children) : footer.getBoundingClientRect().bottom;
          return { gap: innerHeight - contentBottom, footerTop: footer.getBoundingClientRect().top, footerBottom: footer.getBoundingClientRect().bottom, height: innerHeight };
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        const auditState = await page.evaluate(() => {
          const guard = document.querySelector('#pageGuard');
          const visible = !!guard && getComputedStyle(guard).display !== 'none';
          return {
            title: document.title,
            guard: visible ? { kind: guard.dataset.kind || null, state: guard.dataset.state || null, message: document.querySelector('#pageGuardMsg')?.textContent?.trim() || '' } : null,
            globalPhoneLandscape: document.documentElement.dataset.globalPhoneLandscape === 'true',
            formFactor: document.documentElement.dataset.formFactor || null,
            screenOrientation: document.documentElement.dataset.screenOrientation || null,
            viewportOrientation: document.documentElement.dataset.viewportOrientation || null,
            viewport: `${innerWidth}x${innerHeight}`,
            bodyVisibility: getComputedStyle(document.body).visibility,
            pageLoading: document.documentElement.classList.contains('page-loading'),
            guardBackground: visible ? getComputedStyle(guard).backgroundColor : null,
            guardBackdrop: visible ? getComputedStyle(guard).backdropFilter : null,
            safeArea: ['top', 'right', 'bottom', 'left'].map((side) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--safe-area-${side}`)) || 0),
            scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
            errors: [...document.querySelectorAll('[role=alert]')].map((el) => el.textContent.trim()).filter(Boolean),
          };
        });
        auditRows.push({ page: pageName, device: device.name, ...auditState, metrics, footerSafeMetrics, pageErrors: errors });
        checkLayout(device.name === 'iphone-landscape' && (!auditState.globalPhoneLandscape || auditState.bodyVisibility !== 'hidden' || auditState.guardBackground !== 'rgb(5, 9, 20)'), `${pageName}/${device.name}: treść nie jest całkowicie zasłonięta przez wczesną blokadę orientacji (${JSON.stringify({ blocked: auditState.globalPhoneLandscape, visibility: auditState.bodyVisibility, background: auditState.guardBackground })})`);
        checkLayout(actionOrder[pageName] && JSON.stringify(metrics.actions) !== JSON.stringify(actionOrder[pageName]), `${pageName}/${device.name}: zła kolejność akcji ${JSON.stringify(metrics.actions)}`);
        checkLayout(metrics.titleTop != null && metrics.titleTop < metrics.topbarBottom - 1, `${pageName}/${device.name}: nagłówek pod topbarem ${JSON.stringify({ mainTop: metrics.mainTop, bodyPaddingTop: metrics.bodyPaddingTop, titleTop: metrics.titleTop, topbarBottom: metrics.topbarBottom })}`);
        checkLayout([metrics.footerWrap, metrics.leftWrap, metrics.rightWrap].some((wrap) => wrap && wrap !== 'nowrap'), `${pageName}/${device.name}: dolny pasek zawija do drugiego rzędu`);
        checkLayout(metrics.leftRight != null && metrics.rightLeft != null && metrics.leftRight > metrics.rightLeft + 1, `${pageName}/${device.name}: lewa i prawa grupa dolnego paska nachodzą na siebie (${metrics.leftRight} > ${metrics.rightLeft})`);
        checkLayout(['games', 'bases', 'logo'].includes(pageName) && metrics.separatorWidth < 1, `${pageName}/${device.name}: brak separatora nad dolnym paskiem`);
        checkLayout(device.width > 1200 && Math.abs(metrics.searchButtonH - metrics.searchFieldH) > 1, `${pageName}/${device.name}: lupa i pole wyszukiwania mają różne wysokości (${metrics.searchButtonH}/${metrics.searchFieldH})`);
        checkLayout(metrics.scrollWidth > metrics.width, `${pageName}/${device.name}: poziomy overflow ${metrics.scrollWidth} > ${metrics.width}`);
        checkLayout(pageName.startsWith('settings') && metrics.topbarNavOverflow > 1, `${pageName}/${device.name}: nawigacja panelu admina jest obcinana w topbarze (${metrics.topbarNavOverflow}px)`);
        checkLayout(footerSafeMetrics && footerSafeMetrics.footerTop < footerSafeMetrics.height && footerSafeMetrics.footerBottom <= footerSafeMetrics.height + 1 && footerSafeMetrics.gap < metrics.safe[2] - 1, `${pageName}/${device.name}: treść stopki wchodzi w dolne safe area (${footerSafeMetrics?.gap}px < ${metrics.safe[2]}px)`);
        checkLayout(['games', 'bases', 'logo'].includes(pageName) && (metrics.contentLeft < metrics.safe[3] - 1 || metrics.contentRight > metrics.width - metrics.safe[1] + 1), `${pageName}/${device.name}: treść wchodzi w boczne safe area`);
        checkLayout(['games', 'bases', 'logo'].includes(pageName) && metrics.mainPaddingBottom < metrics.safe[2], `${pageName}/${device.name}: dół treści wchodzi w safe area`);
        await page.screenshot({ path: path.join(out, `${pageName}-${device.name}.png`), animations: 'disabled' });
        if (pageName === 'games' && !auditState.globalPhoneLandscape && ['ipad-portrait', 'ipad-landscape', 'iphone-portrait'].includes(device.name)) {
          await page.locator('.list-search-open').click();
          const modal = page.locator('.overlay > .uni-modal');
          await modal.waitFor({ state: 'visible' });
          await page.waitForTimeout(100);
          const modalBox = await modal.boundingBox();
          const safe = metrics.safe;
          if (!modalBox || modalBox.x < safe[3] - 1 || modalBox.x + modalBox.width > metrics.width - safe[1] + 1
            || modalBox.y < safe[0] - 1 || modalBox.y + modalBox.height > metrics.height - safe[2] + 1) {
            checkLayout(true, `games/${device.name}: okno wyszukiwania poza safe area: ${JSON.stringify(modalBox)}`);
          }
          await page.screenshot({ path: path.join(out, `games-${device.name}-search-open.png`), animations: 'disabled' });
        }
        if (pageName.startsWith('settings') && !auditState.globalPhoneLandscape && device.width <= 1800) {
          const menu = page.locator('.topbar-menu-toggle');
          await menu.waitFor({ state: 'visible' });
          await menu.click();
          const overlay = page.locator('.topbar-mobile-overlay.is-open');
          await overlay.waitFor({ state: 'visible' });
          await page.waitForTimeout(100);
          await page.screenshot({ path: path.join(out, `${pageName}-${device.name}-menu-open.png`), animations: 'disabled' });
        }
        if (errors.length && !auditMode) throw new Error(`${pageName}/${device.name}: ${errors.join('; ')}`);
        console.log(`${pageName}/${device.name}: ${metrics.cards} kafli, viewport ${metrics.width}, topbar y=${metrics.topbarTop}..${metrics.topbarBottom}${metrics.tabs.length ? `, wypustki ${JSON.stringify(metrics.tabs)}` : ''}`);
        await context.close();
      }
    }
    if (auditMode) {
      let reportRows = auditRows;
      if (!allPagesAudit && fs.existsSync(path.join(out, 'audit.json'))) {
        const prior = JSON.parse(fs.readFileSync(path.join(out, 'audit.json'), 'utf8'));
        const captures = Array.isArray(prior) ? prior : (prior.captures || []);
        const updatedKeys = new Set(auditRows.map((row) => `${row.page}/${row.device}`));
        reportRows = [...captures.filter((row) => !updatedKeys.has(`${row.page}/${row.device}`)), ...auditRows];
      }
      fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify({ captures: reportRows, layoutIssues }, null, 2));
      const cards = reportRows.map((row) => {
        const filename = `${row.page}-${row.device}.png`;
        const guard = row.guard ? `${row.guard.state}: ${row.guard.message}` : 'widok strony';
        const errors = row.pageErrors.length ? `<p class="error">Błędy JS: ${row.pageErrors.join('; ')}</p>` : '';
        const extras = [`${row.page}-${row.device}-search-open.png`, `${row.page}-${row.device}-menu-open.png`]
          .filter((extra) => fs.existsSync(path.join(out, extra)))
          .map((extra) => `<a href="${extra}"><img loading="lazy" src="${extra}" alt="${row.page} ${row.device} — dodatkowy stan"></a>`)
          .join('');
        return `<article><h2>${row.page} · ${row.device}</h2><p>${row.viewport} · ${guard}</p>${errors}<a href="${filename}"><img loading="lazy" src="${filename}" alt="${row.page} ${row.device}"></a>${extras}</article>`;
      }).join('\n');
      fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Audyt E20 — zrzuty</title><style>body{font:14px system-ui;background:#111827;color:#f8fafc;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}article{background:#1f2937;border-radius:12px;padding:12px;min-width:0}h2{font-size:15px;margin:0 0 6px}p{font-size:12px;color:#cbd5e1}img{display:block;width:100%;height:auto;border:1px solid #475569}.error{color:#fca5a5}</style><h1>Audyt stron E20</h1><p>${reportRows.length} zrzutów stron z lokalnymi danymi demonstracyjnymi. Wykryte problemy układu: ${layoutIssues.length}.</p><details><summary>Problemy układu</summary><ul>${layoutIssues.map((issue) => `<li>${issue}</li>`).join('')}</ul></details><main>${cards}</main></html>`);
      console.log(`Audit artifacts: ${path.join(out, 'index.html')} (${reportRows.length} captures)`);
    }
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error.stack || error); server.close(); process.exitCode = 1; });
