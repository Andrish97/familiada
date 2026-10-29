-- 515: nazwa tagu i folderu bazy pytań -- te same zasady co okno i RPC
-- (qb_save_tag: litery, cyfry, _ , najwyżej 40; folder najwyżej 80), także
-- przy zapisie wprost do tabeli przez edytora bazy (polityki qb_*_write).
-- Znalezione testem bases-actions.spec.js; dane produkcji zgodne
-- (scripts/db-read/qb-names-data.sql, 2026-10-29: 0 naruszeń).
CREATE OR REPLACE FUNCTION public.guard_qb_names()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then
    return new;
  end if;
  if tg_table_name = 'qb_tags'
     and (char_length(coalesce(new.name, '')) > 40 or coalesce(new.name, '') !~ '^[a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$') then
    raise exception 'qb:invalid' using errcode = 'P0001';
  end if;
  if tg_table_name = 'qb_categories' and char_length(coalesce(new.name, '')) > 80 then
    raise exception 'name_too_long' using errcode = '22001';
  end if;
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS a_guard_qb_names ON public.qb_tags;
CREATE TRIGGER a_guard_qb_names BEFORE INSERT OR UPDATE OF name ON public.qb_tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_qb_names();
DROP TRIGGER IF EXISTS a_guard_qb_names ON public.qb_categories;
CREATE TRIGGER a_guard_qb_names BEFORE INSERT OR UPDATE OF name ON public.qb_categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_qb_names();
