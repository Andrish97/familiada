-- E19 pkt7: zadanie udostępnienia jest fizycznym dzieckiem bazy.
-- Guards338 chronią operacje; FK domyka również usuwanie bezpośrednie/konta.
BEGIN;
LOCK TABLE public.question_bases IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.base_share_tasks IN SHARE ROW EXCLUSIVE MODE;

-- Istniejące taski bez rodzica były już niedostępne przez guards338.
DELETE FROM public.base_share_tasks t
WHERE NOT EXISTS (SELECT 1 FROM public.question_bases b WHERE b.id=t.base_id);

CREATE INDEX IF NOT EXISTS base_share_tasks_base_id_idx ON public.base_share_tasks(base_id);
ALTER TABLE public.base_share_tasks
  ADD CONSTRAINT base_share_tasks_base_id_fkey
  FOREIGN KEY (base_id) REFERENCES public.question_bases(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT base_share_tasks_base_id_fkey ON public.base_share_tasks IS
  'E19: usunięcie bazy lub jej właściciela usuwa wszystkie zadania i tokeny akceptacji/odmowy tej bazy.';
COMMIT;
NOTIFY pgrst, 'reload schema';
