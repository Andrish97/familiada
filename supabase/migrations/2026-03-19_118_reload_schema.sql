-- 118: Wymuś reload schematu PostgREST po zmianach w shared_devices
-- PostgREST odświeża schemat przy NOTIFY
NOTIFY pgrst, 'reload schema';
