-- Atrapa schematu realtime (Supabase Realtime v2) dla lokalnej bazy testowej.
-- Na produkcji tworzy go serwer Realtime; tu tylko to, czego używają migracje:
-- realtime.messages, realtime.topic() i realtime.send().
create schema if not exists realtime;
create table if not exists realtime.messages (
  id uuid not null default gen_random_uuid(),
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable
  as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$
begin
  insert into realtime.messages (payload, event, topic, private, extension)
  values (payload, event, topic, private, 'broadcast');
end $$;
