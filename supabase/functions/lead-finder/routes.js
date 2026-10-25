// Lista dozwolonych akcji usługi Lead Findera (wspólna dla funkcji Edge
// i testów unit). Akcja -> { method, path } w usłudze; nieznana akcja albo
// zły identyfikator przebiegu -> null.
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ACTIONS = new Set(["pause", "resume", "cancel"]);

export function serviceRoute(body) {
  const action = String(body?.action || "");
  if (action === "status") return { method: "GET", path: "/api/search-runs/status" };
  if (action === "start") {
    const raw = Number(body?.target_count);
    const count = Number.isFinite(raw) ? Math.max(1, Math.min(1000, Math.round(raw))) : 50;
    return { method: "POST", path: `/api/search-runs?target_count=${count}` };
  }
  const runId = String(body?.run_id || "");
  if (RUN_ACTIONS.has(action) && RUN_ID_RE.test(runId)) {
    return { method: "POST", path: `/api/search-runs/${runId.toLowerCase()}/${action}` };
  }
  return null;
}
