# Cloudflare – Familiada

## Behavior (Worker)

### 1) settings.familiada.online
- `/` and `/index.html` internally serve `/settings/index.html` from Pages.
- Panel assets are in `/settings/js/`, `/settings/css/`, `/settings/data/`; tools are in `/settings/tools/`. Shared assets retain their public paths.
- Everything else is 404.
- Admin API lives here: `/_admin_api/*` (Cloudflare Access).
- Not affected by maintenance gate.

### 2) familiada.online + www.familiada.online
- Normal app behavior.
- `/settings` and its subpaths are blocked on public hosts. The panel is served on its own subdomain.
- If origin returns 404 for HTML, worker serves `/404.html` (custom 404).
- Maintenance gate blocks everything (503 + `/maintenance`), unless bypass cookie.

### 3) Other subdomains (*.familiada.online)
- Known service hosts (`api`, `panel`, `supabase`) are passed through.
- `panel` and `supabase` can point to external origins; keep DNS proxied in Cloudflare.
- Unknown hosts:
  - Maintenance OFF → custom `/404.html`
  - Maintenance ON → `/maintenance` (503)

### Public endpoint
- `GET /maintenance-state.json` → `{ enabled:boolean, mode:"off|message|returnAt|countdown", returnAt:string|null }`

### Pretty URLs (bez .html)
Każda strona ma `<nazwa>/index.html` w artefakcie Pages. Worker pobiera ten
plik wewnętrznie dla tras `/nazwa` oraz `/nazwa/`, zachowując parametry.
Nie wymaga to przekierowania przeglądarki. Linki aplikacji używają `/nazwa/`.

**Aktualne mapowania w workerze:**
- `settings.familiada.online/` → Pages `/settings/index.html`.
- `/games/` → Pages `/games/index.html`; analogicznie dla pozostałych znanych stron.
- Brak fallbacków zasobów pod dawnymi ścieżkami oraz brak przekierowania `/builder`.
- Frontend jest publikowany z `web/`; ta nazwa nie jest częścią adresów URL.

### Admin API (settings host)
- `GET  /_admin_api/me` → 200 if authorized by Cloudflare Access
- `GET  /_admin_api/state` → current state
- `POST /_admin_api/state` → update state
- `POST /_admin_api/off` → shortcut to disable maintenance
- `POST /_admin_api/bypass` → set bypass cookie (ADMIN_BYPASS_TOKEN)
- `POST /_admin_api/bypass_off` → clear bypass cookie
- `GET  /_admin_api/mail/settings` → mail settings + cron status
- `POST /_admin_api/mail/settings` → update mail settings (+ optional cron update)
- `GET  /_admin_api/mail/queue` → mail queue rows (pending/sending/failed)
- `POST /_admin_api/mail/queue/run` → optional requeue + invoke mail worker
- `GET  /_admin_api/mail/logs` → function logs (`send-email`, `send-mail`, `mail-worker`)

### Cloudflare Access
Recommended setup:
- Protect `settings.familiada.online` with Cloudflare Access policy.
- Restrict access in Access policy (for example: only your account).
- Worker authorizes by Cloudflare Access headers (`Cf-Access-Authenticated-User-Email` or `CF-Access-Jwt-Assertion`).

### Worker vars/secrets
- `SUPABASE_URL` (var) → base URL to Supabase (`https://api.familiada.online`)
- `SUPABASE_SERVICE_ROLE_KEY` (secret) → required for `/_admin_api/mail/*`
- `ADMIN_BYPASS_TOKEN` (secret) → bypass cookie token

Example:
- `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
- `wrangler secret put ADMIN_BYPASS_TOKEN`

---

## Checklist (quick test)

### Basic routing
1. `https://familiada.online/` → main site
2. `https://www.familiada.online/` → main site
3. `https://www.familiada.online/settings/` → **404**
4. `https://settings.familiada.online/` → settings panel
5. `https://settings.familiada.online/settings.html` → **404**

### Maintenance
1. Turn maintenance ON in settings panel.
2. `https://familiada.online/` → maintenance page (503)
3. `https://www.familiada.online/` → maintenance page (503)
4. Unknown subdomain (e.g. `https://x.familiada.online/`) → maintenance page (503)
5. `https://settings.familiada.online/` → still works

### Bypass
1. In settings panel click **Bypass ON**
2. `https://familiada.online/` should open normally for this browser
3. Click **Bypass OFF** → maintenance applies again

### Custom 404
1. `https://familiada.online/this-does-not-exist` → custom 404 page
2. `https://x.familiada.online/` (unknown host) → custom 404 (when maintenance OFF)

---

## DNS (recap)
- `@` (apex): A records for GitHub Pages
- `www`: CNAME → `andrish97.github.io` (Proxy ON)
- `settings`: CNAME → `andrish97.github.io` (Proxy ON)
- `*`: CNAME → `andrish97.github.io` (Proxy ON)
- `panel`: CNAME → your panel origin (Proxy ON if routed through worker)
- `supabase`: CNAME → your supabase origin (Proxy ON if routed through worker)
- `api`: CNAME → your API origin (Proxy ON if routed through worker)
