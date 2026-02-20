# auth-email-status

Checks whether a given email is in one of three states used by auth UI.

Response payload:
- status: "none" | "pending" | "confirmed"
- intent: "signup" | "guest_migrate"

Behavior:
- `confirmed`: email already belongs to a confirmed account
- `pending`: confirmation flow is active (signup or guest migration)
- `none`: no active/confirmed flow found

Data sources (in order):
1. `public.email_intents` (if present)
2. `auth.users` (confirmed/pending metadata)
3. pending email-change columns/metadata in `auth.users`

This function uses the service role to query auth tables.
