-- Kontrola: ten odczyt MA się nie udać (brak dostępu do auth).
SELECT count(*) AS n FROM auth.users
