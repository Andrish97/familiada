// One browser identity per game/run; a separate identity for this full answer.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const memory = new Map();
export function createAnonymousSubmitter({ gameId, key, client, storage, idFactory = () => crypto.randomUUID() }) {
  const scope = `fam_anon_browser_${gameId}_${key}`;
  let browser;
  try {
    storage ??= globalThis.localStorage;
    browser = storage?.getItem(scope);
    if (!UUID.test(browser || '')) { browser = memory.get(scope) || idFactory(); storage?.setItem(scope, browser); }
  } catch { browser = memory.get(scope) || idFactory(); }
  memory.set(scope, browser);
  const voter = idFactory();
  return async items => {
    const { data, error } = await client.rpc('poll_anonymous_submit', {
      p_game_id: gameId, p_key: key, p_browser_token: browser, p_voter_token: voter, p_items: items,
    });
    if (error) throw error;
    if (!data?.ok) throw Object.assign(new Error('anonymous_submit_failed'), { code: data?.error, retryAfter: Math.max(0, Number(data?.retry_after) || 0) });
    return data;
  };
}
