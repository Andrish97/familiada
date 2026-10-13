-- Private demo provenance survives renaming, public flag changes and cloning.
-- Local prototype only. No live source-parent FK in a copy's provenance.
BEGIN;
CREATE TABLE public.resource_demo_origins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 game_id uuid UNIQUE REFERENCES public.games(id) ON DELETE CASCADE,
 base_id uuid UNIQUE REFERENCES public.question_bases(id) ON DELETE CASCADE,
 logo_id uuid UNIQUE REFERENCES public.user_logos(id) ON DELETE CASCADE,
 CHECK(num_nonnulls(game_id,base_id,logo_id)=1)
);
ALTER TABLE public.resource_demo_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_demo_origins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_demo_origins FROM PUBLIC,anon,authenticated;
INSERT INTO public.resource_demo_origins(owner_id,game_id) SELECT owner_id,id FROM public.games WHERE is_demo;
INSERT INTO public.resource_demo_origins(owner_id,base_id) SELECT owner_id,id FROM public.question_bases WHERE is_demo;
INSERT INTO public.resource_demo_origins(owner_id,logo_id) SELECT user_id,id FROM public.user_logos WHERE is_demo;
CREATE FUNCTION public._resource_demo_origin_mark() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.is_demo THEN
  IF TG_TABLE_NAME='games' THEN INSERT INTO public.resource_demo_origins(owner_id,game_id) VALUES(NEW.owner_id,NEW.id) ON CONFLICT(game_id) DO NOTHING;
  ELSIF TG_TABLE_NAME='question_bases' THEN INSERT INTO public.resource_demo_origins(owner_id,base_id) VALUES(NEW.owner_id,NEW.id) ON CONFLICT(base_id) DO NOTHING;
  ELSE INSERT INTO public.resource_demo_origins(owner_id,logo_id) VALUES(NEW.user_id,NEW.id) ON CONFLICT(logo_id) DO NOTHING; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._resource_demo_origin_mark() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER clone_demo_origin AFTER INSERT OR UPDATE OF is_demo ON public.games FOR EACH ROW EXECUTE FUNCTION public._resource_demo_origin_mark();
CREATE TRIGGER clone_demo_origin AFTER INSERT OR UPDATE OF is_demo ON public.question_bases FOR EACH ROW EXECUTE FUNCTION public._resource_demo_origin_mark();
CREATE TRIGGER clone_demo_origin AFTER INSERT OR UPDATE OF is_demo ON public.user_logos FOR EACH ROW EXECUTE FUNCTION public._resource_demo_origin_mark();
COMMIT;
