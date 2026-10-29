-- 484: koszt _norm_email = 1 (planner odsiewa po adresie przed sprawdzeniem tożsamości).
do $$
begin
  if (select procost from pg_proc where oid = 'public._norm_email(text)'::regprocedure) <> 1 then
    raise exception '_norm_email: oczekiwany koszt 1';
  end if;
  if public._norm_email('  A@B.pl ') <> 'a@b.pl' then
    raise exception '_norm_email: zmieniony wynik';
  end if;
end $$;
select 'ok 484' as result;
