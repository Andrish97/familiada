-- Lista kontaktów z ostatnią korespondencją. Widok czyta wyłącznie prywatne
-- API panelu (service_role); daty kalendarzowe filtrujemy w czasie polskim.
CREATE INDEX IF NOT EXISTS messages_contact_inbound_date_idx
  ON public.messages (lower(btrim(from_email)), created_at DESC)
  WHERE direction = 'inbound' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_contact_outbound_date_idx
  ON public.messages (lower(btrim(to_email)), created_at DESC)
  WHERE direction = 'outbound' AND deleted_at IS NULL;

CREATE VIEW public.marketing_contacts_view WITH (security_invoker = true) AS
SELECT contact.*,
       latest.last_message_at,
       (contact.added_at AT TIME ZONE 'Europe/Warsaw')::date AS added_date,
       (latest.last_message_at AT TIME ZONE 'Europe/Warsaw')::date AS last_message_date
FROM public.marketing_verified_contacts AS contact
LEFT JOIN LATERAL (
  SELECT greatest(
    contact.last_sent_at,
    (SELECT msg.created_at FROM public.messages AS msg
      WHERE msg.direction = 'inbound' AND msg.deleted_at IS NULL
        AND lower(btrim(msg.from_email)) = lower(btrim(contact.email))
      ORDER BY msg.created_at DESC LIMIT 1),
    (SELECT msg.created_at FROM public.messages AS msg
      WHERE msg.direction = 'outbound' AND msg.deleted_at IS NULL
        AND lower(btrim(msg.to_email)) = lower(btrim(contact.email))
      ORDER BY msg.created_at DESC LIMIT 1)
  ) AS last_message_at
) AS latest ON true;

REVOKE ALL ON public.marketing_contacts_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketing_contacts_view TO service_role;
COMMENT ON VIEW public.marketing_contacts_view IS
  'Prywatny odczyt kontaktów: dodanie i ostatnia korespondencja w obu kierunkach; daty Europe/Warsaw.';
NOTIFY pgrst, 'reload schema';
