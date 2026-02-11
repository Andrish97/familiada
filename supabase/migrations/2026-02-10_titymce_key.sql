create table if not exists public.public_kv (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.public_kv enable row level security;

-- pozwól czytać tylko zalogowanym (polecam tak)
drop policy if exists "public_kv_read_auth" on public.public_kv;
create policy "public_kv_read_auth"
on public.public_kv
for select
to authenticated
using (true);

-- wstaw/ustaw klucz TinyMCE:
insert into public.public_kv (key, value)
values ('tinymce_api_key', 'rvwao9ib8mj0j8bfxbp4dml22na1rnlbgwu4wvfkitbd7dr3')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
