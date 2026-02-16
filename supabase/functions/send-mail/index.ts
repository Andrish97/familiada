import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(supabaseUrl, supabaseAnonKey);

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY");

// Provider switch + fallback
const USE_AWS_SES = (Deno.env.get("USE_AWS_SES") || "").toLowerCase() === "true";
const SG_DISABLE_CLICK_TRACKING = (Deno.env.get("SENDGRID_DISABLE_CLICK_TRACKING") || "true").toLowerCase() === "true";

// AWS SES (SigV4)
const AWS_REGION = Deno.env.get("AWS_REGION") || Deno.env.get("AWS_DEFAULT_REGION") || "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";



async function sendEmail(to: string, subject: string, html: string) {
  if (USE_AWS_SES) {
    try {
      await sendViaSes(to, subject, html);
      return;
    } catch (e1) {
      console.error("SES primary failed:", String(e1));
      await sendViaSendGrid(to, subject, html);
      return;
    }
  } else {
    try {
      await sendViaSendGrid(to, subject, html);
      return;
    } catch (e1) {
      console.error("SendGrid primary failed:", String(e1));
      await sendViaSes(to, subject, html);
      return;
    }
  }
}

async function sendViaSendGrid(to: string, subject: string, html: string) {
  if (!SENDGRID_KEY) throw new Error("Missing SENDGRID_API_KEY env");

  const body: Record<string, unknown> = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: "no-reply@familiada.online", name: "Familiada" },
    subject,
    content: [{ type: "text/html", value: html }],
  };

  if (SG_DISABLE_CLICK_TRACKING) {
    body["tracking_settings"] = {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
    };
  }

  const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!sgRes.ok) {
    const errTxt = await sgRes.text();
    throw new Error(`SendGrid failed (${to}): ${errTxt}`);
  }
}

async function sendViaSes(to: string, subject: string, html: string) {
  if (!AWS_REGION) throw new Error("Missing AWS_REGION env");
  if (!AWS_ACCESS_KEY_ID) throw new Error("Missing AWS_ACCESS_KEY_ID env");
  if (!AWS_SECRET_ACCESS_KEY) throw new Error("Missing AWS_SECRET_ACCESS_KEY env");

  const host = `email.${AWS_REGION}.amazonaws.com`;
  const url = `https://${host}/v2/email/outbound-emails`;

  const payload = {
    FromEmailAddress: "no-reply@familiada.online",
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" } },
      },
    },
  };

  const body = JSON.stringify(payload);

  const headers = new Headers({
    "content-type": "application/json",
    host,
  });

  const signed = await signAwsRequest({
    method: "POST",
    url,
    headers,
    body,
    service: "ses",
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  });

  const res = await fetch(url, { method: "POST", headers: signed, body });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SES failed (${to}): ${txt}`);
  }
}

// ---- SigV4 ----

type SignAwsRequestArgs = {
  method: string;
  url: string;
  headers: Headers;
  body: string;
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

async function signAwsRequest(args: SignAwsRequestArgs): Promise<Headers> {
  const url = new URL(args.url);

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(args.body);

  const headers = new Headers(args.headers);
  headers.set("x-amz-date", amzDate);
  headers.set("x-amz-content-sha256", payloadHash);

  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers);

  const canonicalRequest = [
    args.method.toUpperCase(),
    encodePath(url.pathname),
    url.searchParams.toString(),
    canonicalHeaders + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${args.region}/${args.service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(args.secretAccessKey, dateStamp, args.region, args.service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `${algorithm} Credential=${args.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers.set("Authorization", authorization);

  return headers;
}

function toAmzDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function encodePath(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

function canonicalizeHeaders(headers: Headers): { canonicalHeaders: string; signedHeaders: string } {
  const pairs: Array<[string, string]> = [];
  headers.forEach((v, k) => {
    const key = k.toLowerCase().trim();
    const val = String(v).replace(/\s+/g, " ").trim();
    pairs.push([key, val]);
  });
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const canonicalHeaders = pairs.map(([k, v]) => `${k}:${v}`).join("\n");
  const signedHeaders = pairs.map(([k]) => k).join(";");
  return { canonicalHeaders, signedHeaders };
}

async function sha256Hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmacRaw(key, data);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  const kSigning = await hmacRaw(kService, "aws4_request");
  return kSigning;
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    // ---- AUTH ----
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const { data: userData, error: authError } = await sb.auth.getUser(token);
    if (authError || !userData?.user) {
      return json({ ok: false, error: "Invalid JWT" }, 401);
    }

    // ---- BODY (robust) ----
    const raw = await req.text();
    if (!raw.trim()) {
      return json({ ok: false, error: "Empty body" }, 400);
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return json(
        {
          ok: false,
          error: "Invalid JSON body",
          hint: "Send JSON with Content-Type: application/json",
          body_preview: raw.slice(0, 200),
        },
        400
      );
    }

    const to = String(body?.to || "").trim();
    const subject = String(body?.subject || "").trim();
    const html = String(body?.html || "").trim();

    if (!to || !subject || !html) {
      return json({ ok: false, error: "Missing fields (to, subject, html)" }, 400);
    }

    // Validate primary provider env
    if (USE_AWS_SES) {
      if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        return json({ ok: false, error: "Missing AWS SES env (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)" }, 500);
      }
    } else {
      if (!SENDGRID_KEY) {
        return json({ ok: false, error: "Missing SENDGRID_API_KEY env" }, 500);
      }
    }

    await sendEmail(to, subject, html);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
