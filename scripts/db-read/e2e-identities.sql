-- E25: stan puli tożsamości testowych (liczby): role, przypięte konta,
-- kwarantanna, aktywne wypożyczenia. docs/konta-testowe-plan.md.
SELECT count(*) FILTER (WHERE role = 'standard') AS standard,
       count(*) FILTER (WHERE role = 'noaccount') AS noaccount,
       count(*) FILTER (WHERE role = 'disposable') AS disposable,
       count(*) FILTER (WHERE role = 'dedicated') AS dedicated,
       count(*) FILTER (WHERE role = 'dedicated' AND purpose IS NULL) AS dedicated_wolne,
       count(*) FILTER (WHERE role = 'resource') AS zasoby,
       count(user_id) AS konta_przypiete,
       count(*) FILTER (WHERE quarantined_at IS NOT NULL) AS kwarantanna,
       (SELECT count(*) FROM public.e2e_leases WHERE expires_at >= now()) AS wypozyczone,
       (SELECT count(DISTINCT run_id) FROM public.e2e_leases WHERE expires_at >= now()) AS przebiegi
FROM public.e2e_identities
