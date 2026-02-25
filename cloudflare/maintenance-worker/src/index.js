export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ADMIN ENDPOINTS
    if (url.pathname.startsWith("/_maint")) {
      return handleAdmin(request, env);
    }

    // PUBLIC STATE ENDPOINT
    if (url.pathname === "/maintenance-state.json") {
      const state = await getState(env);
      return json(state);
    }

    if (url.pathname === "/__worker_ping") {
      return new Response("worker-ok", { headers: { "Cache-Control": "no-store" } });
    }

    // GLOBAL GATE
    const state = await getState(env);

    if (!state.enabled) {
      return fetch(request); // brak prac
    }

    // allow access to the maintenance page itself
    if (url.pathname === "/maintenance.html") {
      return fetch(request);
    }

    // block everything else
    return serveMaintenance(request);
  }
};

async function getState(env) {
  const raw = await env.MAINT_KV.get("state");
  if (!raw) return { enabled: false, mode: "off", returnAt: null };
  try {
    const s = JSON.parse(raw);
    // minimal sanity
    if (typeof s.enabled !== "boolean") throw new Error("bad enabled");
    return {
      enabled: s.enabled,
      mode: s.mode || "off",
      returnAt: s.returnAt ?? null
    };
  } catch {
    return { enabled: false, mode: "off", returnAt: null };
  }
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function serveMaintenance(request) {
  const url = new URL(request.url);
  const maintUrl = new URL("/maintenance.html", url.origin);
  const res = await fetch(maintUrl);

  return new Response(res.body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "300"
    }
  });
}

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (token !== env.ADMIN_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  if (url.pathname === "/_maint/off") {
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: false,
      mode: "off",
      returnAt: null
    }));
    return new Response("Maintenance OFF");
  }

  if (url.pathname === "/_maint/message") {
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: true,
      mode: "message",
      returnAt: null
    }));
    return new Response("Maintenance MESSAGE");
  }

  if (url.pathname === "/_maint/returnAt") {
    const t = url.searchParams.get("t");
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: true,
      mode: "returnAt",
      returnAt: t || null
    }));
    return new Response("Maintenance RETURN_AT");
  }

  if (url.pathname === "/_maint/countdown") {
    const t = url.searchParams.get("t");
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: true,
      mode: "countdown",
      returnAt: t || null
    }));
    return new Response("Maintenance COUNTDOWN");
  }

  return new Response("Unknown command", { status: 400 });
}
