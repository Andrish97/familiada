begin;

-- 1) Flaga: czy ukryć prompt iOS webapp (nie pokazuj więcej)
alter table public.user_flags
  add column if not exists ios_webapp_prompt_dismissed boolean not null default false;

comment on column public.user_flags.ios_webapp_prompt_dismissed is
  'If true, user will not see the iOS webapp prompt in builder.';

commit;
