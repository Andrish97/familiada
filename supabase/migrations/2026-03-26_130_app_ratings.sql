CREATE TABLE IF NOT EXISTS "public"."app_ratings" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stars" integer NOT NULL CHECK ("stars" >= 1 AND "stars" <= 5),
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("id"),
    UNIQUE ("user_id")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_ratings_user_id_fkey') THEN
        ALTER TABLE "public"."app_ratings" ADD CONSTRAINT "app_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- RLS
ALTER TABLE "public"."app_ratings" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view ratings') THEN
        CREATE POLICY "Anyone can view ratings" ON "public"."app_ratings" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own rating') THEN
        CREATE POLICY "Users can insert their own rating" ON "public"."app_ratings" FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own rating') THEN
        CREATE POLICY "Users can update their own rating" ON "public"."app_ratings" FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Function to get average rating
CREATE OR REPLACE FUNCTION "public"."get_app_rating_stats"()
RETURNS TABLE("avg_stars" numeric, "total_count" bigint)
LANGUAGE "sql" STABLE
AS $$
    SELECT 
        COALESCE(ROUND(AVG(stars), 1), 0.0) as avg_stars,
        COUNT(*) as total_count
    FROM public.app_ratings;
$$ ;
