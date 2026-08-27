-- One-time backfill: decode RFC 2047 MIME encoded-word subjects that were
-- saved raw (e.g. "=?utf-8?B?...?=", "=?ISO-8859-2?Q?...?=") by the
-- Cloudflare Email Routing inbound handler before it started decoding
-- Subject headers (see cloudflare/maintenance-worker/src/index.js).
--
-- Adds two helper functions, backfills public.messages.subject, then drops
-- the helpers again — this migration is not meant to leave anything behind.

CREATE OR REPLACE FUNCTION "public"."_tmp_decode_mime_word"("p_charset" "text", "p_enc" "text", "p_text" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_bytes bytea;
  v_hexless text;
  v_out bytea;
  i int;
  c text;
BEGIN
  IF lower(p_enc) = 'b' THEN
    BEGIN
      v_bytes := decode(regexp_replace(p_text, '\s+', '', 'g'), 'base64');
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  ELSE
    -- Q-encoding: '_' is a space, '=XX' is a hex-escaped raw byte
    v_hexless := replace(p_text, '_', ' ');
    v_out := ''::bytea;
    i := 1;
    WHILE i <= length(v_hexless) LOOP
      c := substr(v_hexless, i, 1);
      IF c = '=' AND i + 2 <= length(v_hexless) AND substr(v_hexless, i + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN
        v_out := v_out || decode(substr(v_hexless, i + 1, 2), 'hex');
        i := i + 3;
      ELSE
        v_out := v_out || convert_to(c, 'UTF8');
        i := i + 1;
      END IF;
    END LOOP;
    v_bytes := v_out;
  END IF;

  BEGIN
    RETURN convert_from(v_bytes, p_charset);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      RETURN convert_from(v_bytes, 'UTF8');
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."_tmp_decode_mime_subject"("p_subject" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_result text := p_subject;
  v_match text[];
  v_full text;
  v_decoded text;
  v_iterations int := 0;
BEGIN
  IF v_result IS NULL THEN
    RETURN v_result;
  END IF;

  -- Whitespace strictly between two adjacent encoded-words is part of the
  -- encoding, not content (RFC 2047 section 6.2)
  v_result := regexp_replace(v_result, '(\?=)[ \t]+(=\?)', '\1\2', 'g');

  LOOP
    v_iterations := v_iterations + 1;
    EXIT WHEN v_iterations > 50; -- safety cap against pathological input
    SELECT regexp_matches(v_result, '=\?([^?]+)\?([BQbq])\?([^?]*)\?=') INTO v_match;
    EXIT WHEN v_match IS NULL;
    v_full := '=?' || v_match[1] || '?' || v_match[2] || '?' || v_match[3] || '?=';
    v_decoded := "public"."_tmp_decode_mime_word"(v_match[1], v_match[2], v_match[3]);
    EXIT WHEN v_decoded IS NULL; -- leave undecodable token as-is rather than loop forever
    v_result := replace(v_result, v_full, v_decoded);
  END LOOP;

  RETURN v_result;
END;
$$;

UPDATE "public"."messages"
SET "subject" = "public"."_tmp_decode_mime_subject"("subject")
WHERE "subject" ~ '=\?[^?]+\?[BbQq]\?[^?]*\?=';

DROP FUNCTION IF EXISTS "public"."_tmp_decode_mime_subject"("text");
DROP FUNCTION IF EXISTS "public"."_tmp_decode_mime_word"("text", "text", "text");
