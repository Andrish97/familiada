# Familiada.online — Email System Description

## Application Overview

**Familiada.online** is a web application for creating and running quiz and survey games (inspired by the "Family Feud" TV format). Users create games, share polls with other users or external audiences via a link or email invitation, collect responses, and play interactive quiz sessions. The application is built on Supabase (PostgreSQL + Edge Functions) with a Cloudflare Worker proxy.

**Target audience:** Polish, English, and Ukrainian-speaking users. Primary use cases: education, team integration, entertainment.

---

## Architecture

### Infrastructure

- **Frontend:** Static HTML/JS pages hosted on Cloudflare Pages
- **Backend:** Supabase (PostgreSQL + Row Level Security + Edge Functions running on Deno)
- **Proxy:** Cloudflare Worker handling routing and admin API endpoints
- **Email providers:** Multi-provider chain — SendGrid → Brevo → Mailgun → AWS SES (with automatic fallback)

### Email Sending Flow

All application emails (except auth emails) are processed through a `mail_queue` PostgreSQL table:

1. Business logic inserts a row into `mail_queue` (status: `pending`)
2. The `mail-worker` Edge Function runs every minute via pg_cron (or is triggered by the Cloudflare Worker)
3. `mail-worker` fetches up to N pending messages using `FOR UPDATE SKIP LOCKED` (safe for parallel execution)
4. Each message is sent through the provider chain; on success the row is marked `sent`, on failure `failed` with the error text
5. Results are logged to `mail_function_logs`

Auth emails (signup confirmation, password reset, email change, guest migration) bypass the queue and are sent immediately via the `send-email` Edge Function, which is triggered directly by Supabase Auth hooks.

### Provider Fallback Chain

The active provider order is stored in `mail_settings.provider_order` (comma-separated string, e.g. `"sendgrid,brevo,ses"`). On each send attempt, providers are tried in order until one succeeds. The `send-email` function also reads this setting from the database.

Supported providers: `sendgrid`, `brevo`, `mailgun`, `ses`

Provider credentials and the AWS SES region are read exclusively from environment variables — never stored in the database:
- `SENDGRID_API_KEY`
- `BREVO_API_KEY`
- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION`
- `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_REGION`

---

## Email Types

### Type 1 — Account Confirmation (signup)

**Trigger:** User registers a new account (email + password).

**Edge Function:** `send-email` — invoked via Supabase Auth webhook (`email_action_type: "signup"`).

**Content:** Single-use confirmation link. The user must click it to activate the account. Without confirmation the account exists but the user cannot log in.

**Confirmation link format:**
```
https://familiada.online/confirm.html?token_hash=<HASH>&type=signup&lang=<pl|en|uk>
```

**Language:** Determined by `lang` param in `redirect_to` URL, or by `user_metadata.language`. Falls back to Polish.

**Volume:** ~10–50/day (depends on registration rate). Each registration = exactly 1 email.

**Suppressions:** None — user explicitly requested the account. Sending this email is a prerequisite for account access.

---

### Type 2 — Password Reset (recovery)

**Trigger:** User clicks "Forgot password" on the login form.

**Edge Function:** `send-email` — invoked via Supabase Auth webhook (`email_action_type: "recovery"`).

**Content:** Single-use link redirecting to `reset.html` where the user sets a new password. The link expires after 1 hour (Supabase default).

**Link format:**
```
https://familiada.online/reset.html?token_hash=<HASH>&type=recovery&lang=<pl|en|uk>
```

**Volume:** ~5–20/day. One email per reset request. Users may request multiple resets; each generates a new email.

**Suppressions:** None — user explicitly initiated. Blocking this email would lock users out of their accounts.

---

### Type 3 — Email Change Confirmation (email_change)

**Trigger:** Authenticated user submits a new email address in account settings.

**Edge Function:** `send-email` — invoked via Supabase Auth webhook. Supabase may fire `email_change`, `email_change_current`, or `email_change_new` depending on whether "Secure email change" is enabled.

**Content:** Confirmation link sent to **both** the old address (to confirm the owner initiated the change) and the new address (to verify ownership of the new mailbox). The change is applied only after both links are clicked (when secure email change is on).

**Confirmation link format:**
```
https://familiada.online/confirm.html?token_hash=<HASH>&type=email_change&lang=<pl|en|uk>
```

**Volume:** ~2–10/day. Low-frequency, user-initiated. Each change = up to 2 emails (old + new address).

**Suppressions:** None — security-critical flow. Suppressing this could leave accounts with unverified emails.

---

### Type 4 — Guest Account Migration (guest_migrate)

**Trigger:** A guest user (anonymous account) submits an email address to convert their account to a full registered account.

**Edge Function:** `send-email` — triggered via Supabase Auth email_change hook with `user_metadata.familiada_email_change_intent = "guest_migrate"`.

**Content:** Confirmation link to verify the email address and complete the migration. Template is visually identical to signup but with "migration" copy. The guest's data (created games, poll responses) is preserved after migration.

**Link format:**
```
https://familiada.online/confirm.html?token_hash=<HASH>&type=email_change&lang=<pl|en|uk>
```

**Volume:** ~5–30/day depending on guest-to-registered conversion rate.

**Suppressions:** None — user-initiated identity verification.

---

### Type 5 — Poll Subscription Invitation

**Trigger:** A registered user shares a poll and invites email recipients (registered users or external email addresses) to subscribe and receive updates.

**Delivery path:** `polls-hub.js` (frontend) → `polls_hub_subscription_invite_a` RPC → inserts into `mail_queue` → `mail-worker` Edge Function.

**Content:**
- Subscription confirmation button (accept / decline)
- Poll title and description
- Owner name
- Footer for unregistered recipients: per-owner unsubscribe link + global unsubscribe link
- Footer for registered recipients: link to account notification settings

**Cooldowns:**
- After declining: 5-day cooldown before another invite can be sent to the same address for the same poll
- After accepting + later cancelling subscription: 5-day cooldown
- If an invite is resent (subscriber lost): 24-hour cooldown

**Volume:** Variable. When a user shares a poll, they can invite from 1 to ~50 email recipients. Typical burst: 5–20 emails per share action. A user may share the same poll multiple times with different audiences.

**Anti-spam:**
- All cooldowns enforced at the database level (`poll_subscriptions.email_sent_at`, `email_send_count`)
- `email_unsub_tokens.suppressed_at IS NOT NULL` → recipient globally blocked → email skipped silently
- `user_flags.email_notifications = false` → registered recipient opted out → email skipped

---

### Type 6 — Poll Task / Share Notification

**Trigger:** A registered user sends a poll task (a request to fill out a specific poll) to one or more email recipients.

**Delivery path:** `polls-hub.js` → `poll_tasks` insert + `mail_queue` insert → `mail-worker`.

**Content:**
- Task description (which poll to fill, deadline if set)
- "Go to poll" button
- Footer for unregistered: per-owner unsub link + global unsub link
- Footer for registered: account settings link

**Cooldowns:**
- After the recipient declines a task: 24-hour cooldown before re-sending the same task
- Base share without subscription: 24-hour cooldown for repeat sends

**Volume:** Similar to subscription invites. Up to ~50 recipients per task send. Users may send multiple tasks for different polls.

**Anti-spam:** Same suppression checks as subscription invitations.

---

### Type 7 — Base Share (Data Export Share)

**Trigger:** A registered user shares their poll response data (export) with specific email recipients.

**Delivery path:** Frontend → `mail_queue` insert (via RPC) → `mail-worker`.

**Content:**
- Link to download/view the shared data
- Short message from the sender
- Unsubscribe footer (same logic as Types 5/6)

**Cooldowns:** 24-hour cooldown per recipient per base.

**Volume:** Low frequency, ~1–10 emails per share event.

---

### Type 8 — Contact Form Message

**Trigger:** Any visitor (registered or not) submits the contact form on the website.

**Delivery path:** Cloudflare Worker → direct `mail_queue` insert (using Supabase service_role key) → `mail-worker`.

**Content:** Message text, sender's email (for reply), timestamp.

**Rate limiting:** 10 messages per IP per 10 hours (enforced in Cloudflare Worker). This prevents abuse before the message even reaches the queue.

**Volume:** ~0–20/day. Occasional spikes possible (e.g. after a feature launch or outage).

---

## Unsubscribe System

### Registered Users

Registered users have a global opt-out toggle: `user_flags.email_notifications`. When set to `false`:
- All marketing/notification emails are skipped (Types 5, 6, 7)
- Auth emails (Types 1–4) are **always** delivered regardless of this flag

The setting is managed in account settings. Email footers for registered users contain a link: *"To stop receiving email notifications, go to account settings."*

### Unregistered (email-only) Recipients

Unregistered recipients have two unsubscribe options, both accessible via links in every email footer:

**Option A — Per-owner unsubscribe** (`?s=SUB_TOKEN&action=unsub` on poll-go.html):
- Cancels the subscription to that specific poll owner's invitations
- Marks all active tasks from that owner as declined
- Activates a 5-day cooldown (same as manual subscription cancellation)
- Does **not** block emails from other poll owners

**Option B — Global unsubscribe** (`?u=UNSUB_TOKEN` on poll-go.html):
- Sets `email_unsub_tokens.suppressed_at` to the current timestamp
- Cancels **all** active subscriptions (all owners)
- Marks **all** active tasks as declined
- Permanently blocks all future emails to that address from Familiada.online
- If the user later registers, the `suppressed_at` state is transferred to `user_flags.email_notifications = false`

**Token storage:** `email_unsub_tokens` table (PK: email address). The token is a UUID generated at the time of the first subscription invitation and never changes. The same token is included in all future emails to that address.

### Suppression Check in `send-email` / `mail-worker`

Before sending any Type 5–7 email, the function checks:
1. If recipient is a registered user: `user_flags.email_notifications = false` → skip
2. If recipient is unregistered: `email_unsub_tokens.suppressed_at IS NOT NULL` → skip

Suppressed recipients are skipped silently (no bounce, no retry).

---

## Mail Queue

### Table: `mail_queue`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `to_email` | text | Recipient address |
| `subject` | text | Email subject |
| `html_body` | text | Full HTML content |
| `status` | text | `pending` / `sent` / `failed` |
| `provider` | text | Which provider delivered it |
| `error` | text | Error message on failure |
| `created_at` | timestamptz | Insertion time |
| `sent_at` | timestamptz | Delivery timestamp |
| `attempts` | int | Send attempt count |

### Processing (`mail-worker`)

- Runs every 60 seconds via pg_cron
- Fetches `worker_limit` rows with `status = 'pending'` using `FOR UPDATE SKIP LOCKED` (prevents duplicate sends in concurrent invocations)
- Respects `delay_ms` between messages to avoid hitting provider rate limits
- After each batch: updates `sent_at` and `status` in the DB
- `mail_settings` table controls: `provider_order`, `delay_ms`, `worker_limit`

---

## Logging

All send operations are logged to `mail_function_logs`:

| Column | Description |
|--------|-------------|
| `function_name` | `send-mail`, `mail-worker`, or `send-email` |
| `event` | `provider_success`, `provider_failed`, `all_providers_failed`, `request_start`, `request_done`, etc. |
| `level` | `debug` / `info` / `warn` / `error` |
| `request_id` | UUID per invocation for correlation |
| `actor_user_id` | Supabase user ID of the sender (if applicable) |
| `recipient_email` | Scrubbed to `fi***@example.com` for privacy |
| `provider` | Which provider was used |
| `status` | `sent` / `failed` / `ok` / `started` |
| `error` | Error message (capped at 2000 chars) |
| `meta` | JSON with additional context |

---

## Volume Estimates

| Email Type | Frequency | Estimated Daily Volume |
|------------|-----------|----------------------|
| Account confirmation | On registration | 10–100 |
| Password reset | On user request | 5–30 |
| Email change | On user request | 2–10 |
| Guest migration | On guest conversion | 5–30 |
| Poll subscription invite | On poll share | 10–500 |
| Poll task notification | On task send | 10–500 |
| Base share | On data share | 1–50 |
| Contact form | Visitor-initiated | 0–20 |

**Burst scenario:** A user with 100 poll subscribers shares a poll — generates up to 100 emails within minutes. Multiple users sharing simultaneously could create short spikes of 500–2000 emails/hour. The `mail-worker` queue smooths these bursts.

**Monthly estimate:** 1,000–30,000 emails/month depending on active user count and engagement.

---

## DNS Configuration

The sending domain `familiada.online` has the following DNS records configured:

- **SPF:** `v=spf1 include:sendgrid.net include:spf.brevo.com include:mailgun.org include:amazonses.com ~all`
- **DKIM:** Records published for SendGrid, Brevo, Mailgun, and AWS SES (each provider requires its own DKIM selector)
- **DMARC:** `v=DMARC1; p=quarantine; rua=mailto:dmarc@familiada.online`
- **Custom tracking domain** (where supported by the provider)

---

## Rationale for AWS SES

The application uses a multi-provider fallback chain. AWS SES is added as an additional fallback (and optionally as the primary provider) because:

1. **No daily sending limits** — unlike free tiers of other providers (e.g. Brevo: 300/day, Mailgun: 100/day sandbox). SES charges per message, so burst traffic from poll sharing is handled without hitting hard limits.
2. **Pay-per-use pricing** — at $0.10/1000 emails, costs are proportional to actual usage. At 10,000 emails/month the cost is $1.00.
3. **Reliability** — SES has a proven track record for transactional email at scale.
4. **Existing AWS infrastructure** — the application already runs on infrastructure adjacent to AWS (Supabase is hosted on AWS), minimizing latency.

**Integration note:** SES is implemented via the SES v2 REST API with manual AWS Signature V4 signing (HMAC-SHA256 using Deno's `crypto.subtle`). No AWS SDK is used, keeping the Edge Function dependency-free.

---

## Summary of Use Cases

Familiada.online sends email for the following **legitimate transactional purposes**:

1. **Identity verification** — confirming that a user owns the email address they registered with
2. **Security** — password reset, email change confirmation
3. **Account migration** — converting a guest session to a full account
4. **User-initiated sharing** — delivering poll invitations and task notifications that the sender explicitly requested
5. **Support** — forwarding contact form messages to the site administrator

All emails are triggered by explicit user actions. There are no scheduled newsletters, no purchased lists, and no unsolicited marketing campaigns. Unsubscribe mechanisms are present in all notification emails and are enforced at the database level before sending.
