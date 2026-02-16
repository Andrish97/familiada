-- Rename public invite page path from poll_go.html to poll-go.html in DB-generated links.
do $$
declare
  r record;
  def text;
  new_def text;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    def := pg_get_functiondef(r.signature::regprocedure);
    if position('poll_go.html' in def) > 0 then
      new_def := replace(def, 'poll_go.html', 'poll-go.html');
      execute new_def;
    end if;
  end loop;
end $$;
