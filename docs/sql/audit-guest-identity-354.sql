-- Aggregate-only audit: never print identities, addresses or metadata.
BEGIN TRANSACTION READ ONLY;
SELECT count(*) FILTER (WHERE u.is_anonymous AND
 (u.email_confirmed_at IS NULL OR nullif(trim(u.email),'') IS NULL)) AS actual_guests,
 count(*) FILTER (WHERE u.is_anonymous AND
 (u.email_confirmed_at IS NULL OR nullif(trim(u.email),'') IS NULL)
 AND p.is_guest IS FALSE) AS guests_with_regular_profile,
 count(*) FILTER (WHERE u.is_anonymous AND
 (u.email_confirmed_at IS NULL OR nullif(trim(u.email),'') IS NULL)
 AND p.guest_expires_at IS NULL) AS guests_without_expiry,
 count(*) FILTER (WHERE u.is_anonymous AND u.email_confirmed_at IS NOT NULL
 AND nullif(trim(u.email),'') IS NOT NULL AND p.is_guest IS FALSE) AS confirmed_converted_guests,
 count(*) FILTER (WHERE u.is_anonymous AND p.id IS NULL) AS anonymous_missing_profile
FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id;
ROLLBACK;
