-- One-time backfill: some very early inbound messages (e.g. TICKET-2026-0001)
-- were stored with their body still in raw quoted-printable form
-- (e.g. "wiadomo=C5=9B=C4=87" instead of "wiadomość") - never decoded at
-- ingestion time, predating the mail-worker's MIME parsing. Detected via a
-- tight signature (two adjacent "=XX" hex escapes, as every multi-byte
-- UTF-8 diacritic produces in QP) to avoid false positives on ordinary
-- text/HTML. Only applied when the decode succeeds and actually changes
-- the value, so untouched rows are never rewritten.

CREATE OR REPLACE FUNCTION "public"."_tmp_decode_raw_qp"("p_text" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_folded text;
  v_out bytea;
  i int;
  v_len int;
  c text;
BEGIN
  IF p_text IS NULL THEN
    RETURN p_text;
  END IF;

  v_folded := regexp_replace(p_text, '=\r?\n', '', 'g'); -- QP soft line breaks
  v_len := length(v_folded);
  v_out := ''::bytea;
  i := 1;
  WHILE i <= v_len LOOP
    c := substr(v_folded, i, 1);
    IF c = '=' AND i + 2 <= v_len AND substr(v_folded, i + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN
      v_out := v_out || decode(substr(v_folded, i + 1, 2), 'hex');
      i := i + 3;
    ELSE
      v_out := v_out || convert_to(c, 'UTF8');
      i := i + 1;
    END IF;
  END LOOP;

  BEGIN
    RETURN convert_from(v_out, 'UTF8');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL; -- not valid UTF-8 once decoded - leave the original alone
  END;
END;
$$;

UPDATE "public"."messages" AS m
SET "body" = d.new_body
FROM (
  SELECT id, "public"."_tmp_decode_raw_qp"(body) AS new_body
  FROM "public"."messages"
  WHERE body ~ '=[0-9A-Fa-f]{2}=[0-9A-Fa-f]{2}'
) d
WHERE m.id = d.id AND d.new_body IS NOT NULL AND d.new_body IS DISTINCT FROM m.body;

UPDATE "public"."messages" AS m
SET "body_html" = d.new_body_html
FROM (
  SELECT id, "public"."_tmp_decode_raw_qp"(body_html) AS new_body_html
  FROM "public"."messages"
  WHERE body_html ~ '=[0-9A-Fa-f]{2}=[0-9A-Fa-f]{2}'
) d
WHERE m.id = d.id AND d.new_body_html IS NOT NULL AND d.new_body_html IS DISTINCT FROM m.body_html;

DROP FUNCTION IF EXISTS "public"."_tmp_decode_raw_qp"("text");
