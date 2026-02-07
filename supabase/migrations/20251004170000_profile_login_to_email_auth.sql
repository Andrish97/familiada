CREATE OR REPLACE FUNCTION public.profile_login_to_email(p_login text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v text;
begin
  v := trim(coalesce(p_login, ''));
  if v = '' then
    return null;
  end if;

  if position('@' in v) > 0 then
    return lower(v);
  end if;

  select lower(u.email)
  into v
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(v)
  limit 1;

  if v is null then
    select lower(email)
    into v
    from public.profiles
    where lower(username) = lower(p_login)
    limit 1;
  end if;

  return v;
end;
$function$;
