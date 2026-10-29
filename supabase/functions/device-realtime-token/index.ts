import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// This must be the signing secret configured for the Supabase project's JWTs.
// Never fall back to the anon/service key: tokens must be accepted by Realtime.
const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") || Deno.env.get("JWT_SECRET") || "";
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signToken(claims: Record<string, unknown>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: "supabase",
    aud: "authenticated",
    sub: "realtime-device",
    role: "anon",
    iat: now,
    nbf: now - 2,
    exp: now + 300,
    ...claims,
  })));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)));
  return `${input}.${base64url(signature)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!serviceKey || !url) return json({ ok: false, error: "service_unavailable" }, 503);
  if (!jwtSecret) return json({ ok: false, error: "realtime_token_unavailable" }, 503);

  try {
    const body = await req.json();
    const gameId = String(body?.game_id || "");
    const deviceType = String(body?.device_type || "");
    const key = String(body?.key || "");
    const connectionId = String(body?.connection_id || "");
    const epoch = Number(body?.epoch);
    if (!gameId || !["display", "host", "buzzer"].includes(deviceType)
      || !key || !connectionId || !Number.isSafeInteger(epoch) || epoch < 1) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    const { data, error } = await admin.rpc("control_device_realtime_authorize", {
      p_game_id: gameId,
      p_device_type: deviceType,
      p_key: key,
      p_connection_id: connectionId,
      p_epoch: epoch,
    });
    if (error || !data) return json({ ok: false, error: "forbidden" }, 403);
    const token = await signToken(data as Record<string, unknown>);
    return json({ ok: true, token, expires_in: 300 });
  } catch (error) {
    console.error("device-realtime-token failed", String((error as Error)?.message || error));
    return json({ ok: false, error: "token_issue_failed" }, 500);
  }
});
