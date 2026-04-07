// supabase/functions/lead-finder/index.ts
// ============================================================
// Minimal – tylko zarządzanie kolejką i stats
// Właściwe wyszukiwanie robi Cloudflare Worker (15 min timeout)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ── GET STATS ──
    if (action === "stats") {
      const { data: cfg } = await supabase.from("lead_finder_config").select("*");
      const kv: Record<string, string> = {};
      for (const r of cfg || []) kv[r.key] = r.value;

      const today = new Date().toISOString().slice(0, 10);
      const dayCount = kv.brave_daily_date === today ? parseInt(kv.brave_daily_count || "0") : 0;
      const month = new Date().toISOString().slice(0, 7);
      const monthCount = kv.brave_monthly_date === month ? parseInt(kv.brave_monthly_count || "0") : 0;
      const totalLeads = await supabase.from("lead_finder").select("*", { count: "exact", head: true });
      const usedCount = await supabase.from("lead_finder").select("*", { count: "exact", head: true }).eq("used", true);
      const doneCount = parseInt(kv.cities_done || "0");
      let searchStatus = {};
      try { searchStatus = JSON.parse(kv.search_status || "{}"); } catch {}

      return new Response(JSON.stringify({
        daily_count: dayCount,
        daily_limit: 100,
        monthly_count: monthCount,
        monthly_limit: 1000,
        total_leads: totalLeads.count || 0,
        used_leads: usedCount.count || 0,
        cities_done: doneCount,
        cities_total: 350,
        last_log: kv.last_search_log || "",
        search: searchStatus,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── GET LOG ──
    if (action === "log") {
      const { data } = await supabase.from("lead_finder_config").select("value").eq("key", "last_search_log").single();
      return new Response(JSON.stringify({ log: data?.value || "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SAVE LOG (from runner) ──
    if (action === "save_log") {
      const body = await req.json();
      await supabase.from("lead_finder_config").upsert(
        { key: "last_search_log", value: (body.log || "").substring(0, 5000) },
        { onConflict: "key" }
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
