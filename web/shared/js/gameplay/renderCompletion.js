// A state revision has one completion, after all scene work has settled.
export async function renderAndConfirm(render, confirm, isCurrent = () => true) {
  await render();
  if (isCurrent()) await confirm();
}

export function createRenderCompletionGate(initialRevision = 0) {
  let requested = initialRevision;
  let completed = -1;
  return {
    request(revision) { requested = Math.max(requested, revision); },
    acknowledge(revision) { const before = completed; completed = Math.max(completed, revision); return completed !== before; },
    get pending() { return completed < requested; },
    get completedRevision() { return completed; },
  };
}
