import { sb } from "./supabase.js";

export function startSnapshotPoll({
  gameId,
  key,
  kind, // 'display' | 'remote'
  intervalMs = 500,
  onData,
  onError,
}) {
  let timer = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const { data, error } = await sb().rpc("get_public_snapshot", {
        p_game_id: gameId,
        p_kind: kind,
        p_key: key,
      });
      if (error) throw error;
      onData?.(data);
    } catch (e) {
      onError?.(e);
    }
  }

  tick();
  timer = setInterval(tick, intervalMs);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

