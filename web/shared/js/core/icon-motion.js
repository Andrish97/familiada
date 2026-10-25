// Ruch wewnętrznych części SVG: bez pętli JS. SMIL zmienia krzywe pary;
// wspólny obserwator uruchamia je tylko w widocznym obszarze aktywnej karty.
const selector = 'svg[data-icon-animation="steam"]';
const tracked = new Map();
let observer, preference;

function synchronize(svg, state) {
  const running = state.visible && svg.isConnected && !document.hidden && !preference.matches;
  if (running === state.running) return;
  state.running = running;
  for (const animation of svg.querySelectorAll('animate')) {
    if (running) animation.beginElement?.();
    else animation.endElement?.();
  }
  svg.toggleAttribute('data-icon-running', running);
}

function initialize() {
  if (observer) return true;
  if (typeof IntersectionObserver !== 'function' || typeof window.matchMedia !== 'function') return false;
  preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = tracked.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting;
      synchronize(entry.target, state);
    }
  });
  const refresh = () => { for (const [svg, state] of tracked) synchronize(svg, state); };
  preference.addEventListener?.('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  return true;
}

function elements(root) {
  const list = root.matches?.(selector) ? [root] : [];
  list.push(...(root.querySelectorAll?.(selector) || []));
  return list;
}

export function observeIconMotion(root) {
  const list = elements(root);
  if (!list.length || !initialize()) return;
  for (const svg of list) {
    if (tracked.has(svg)) continue;
    tracked.set(svg, { visible: false, running: false });
    observer.observe(svg);
  }
}

export function forgetIconMotion(root) {
  for (const svg of elements(root)) {
    if (svg.isConnected || !tracked.has(svg)) continue;
    const state = tracked.get(svg);
    state.visible = false;
    synchronize(svg, state);
    observer.unobserve(svg);
    tracked.delete(svg);
  }
}
