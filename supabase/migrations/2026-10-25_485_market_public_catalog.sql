-- 485: publiczna lista do HTML katalogu i sitemap, bez pól administracyjnych
-- i limitu 100 z market_browse. Nie zmienia kontraktu istniejących RPC.
create function public.market_public_catalog()
returns table (
  id uuid, slug text, title text, description text, lang text,
  origin text, author_username text, library_count integer,
  avg_rating numeric, rating_count integer, created_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select mg.id, mg.slug, mg.title, mg.description, mg.lang,
    mg.origin::text, coalesce(public._public_username(mg.author_user_id), ''),
    mg.library_count, mg.avg_rating, mg.rating_count, mg.created_at
  from public.market_games mg
  where mg.status = 'published' and mg.slug is not null
  order by mg.created_at desc, mg.id;
$$;
revoke all on function public.market_public_catalog() from public;
grant execute on function public.market_public_catalog() to anon, authenticated, service_role;
