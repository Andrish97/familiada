# Cloudflare – Familiada

## Behavior (Worker)

### 1) settings.familiada.online
- Only `/`, `/index.html`, `/settings`, `/settings.html`, `/settings-tools/*` and assets are allowed.
- Root (`/`) serves `/settings.html` from `https://familiada.online` (pretty URL `/settings`).
- Everything else is 404.
- Admin API lives here: `/_admin_api/*` (Access header or cookie).
- Not affected by maintenance gate.

### 2) familiada.online + www.familiada.online
- Normal app behavior.
- `/settings`, `/settings/`, `/settings.html` redirect to `/settings`.
- If origin returns 404 for HTML, worker serves `/404.html` (custom 404).
- Maintenance gate blocks everything (503 + `/maintenance`), unless bypass cookie.

### 3) Other subdomains (*.familiada.online)
- Known service hosts (`api`, `panel`, `supabase`) are passed through.
- Unknown hosts:
  - Maintenance OFF → custom `/404.html`
  - Maintenance ON → `/maintenance` (503)

### Public endpoint
- `GET /maintenance-state.json` → `{ enabled:boolean, mode:"off|message|returnAt|countdown", returnAt:string|null }`

### Pretty URLs (bez .html)
Root (np. `/builder`) obsługuje GitHub Pages – bez dodatkowych rewrite’ów.
Foldery mają teraz `index.html`, więc `/control`, `/display`, `/logo-editor`, `/base-explorer` działają natywnie.

**Aktualne mapowania w workerze:**
- `/settings` → `/settings.html` (specjalny przypadek dla panelu)

### Admin API (settings host)
- `GET  /_admin_api/me` → 200 if Access header or session cookie
- `POST /_admin_api/login` → `{ username, password }` sets session cookie
- `POST /_admin_api/logout` → clears session
- `GET  /_admin_api/state` → current state
- `POST /_admin_api/state` → update state
- `POST /_admin_api/off` → shortcut to disable maintenance
- `POST /_admin_api/bypass` → set bypass cookie (ADMIN_BYPASS_TOKEN)
- `POST /_admin_api/bypass_off` → clear bypass cookie

### Legacy admin (URL token; keep or remove later)
- `/_maint/*` (token in URL)

### Cloudflare Access (optional)
If Access is enabled on `settings.familiada.online`, any request with
`CF-Access-Jwt-Assertion` header is treated as authorized.
(No JWT validation inside the worker.)

---

## Checklist (quick test)

### Basic routing
1. `https://familiada.online/` → main site
2. `https://www.familiada.online/` → main site
3. `https://familiada.online/settings.html` → **redirect to** `https://familiada.online/settings`
4. `https://settings.familiada.online/` → settings panel
5. `https://settings.familiada.online/settings.html` → **redirect to** `https://settings.familiada.online/settings`

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
