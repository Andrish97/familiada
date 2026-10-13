// Nagłówek list Gier/Baz/Logo: akcje pozostają przy prawej krawędzi,
// dopóki tekst po ich lewej nie staje się zbyt ciasny. Wtedy cała grupa
// akcji przechodzi do następnego wiersza i zaczyna od lewej.
export function initListHeaderLayout(selector = ".bar") {
  const bars = [...document.querySelectorAll(selector)].filter((bar) => bar.querySelector(":scope > .actions"));
  for (const bar of bars) {
    let queued = false;
    const update = () => {
      queued = false;
      const actions = bar.querySelector(":scope > .actions");
      const heading = [...bar.children].find((child) => child !== actions);
      const hint = heading?.querySelector(".hint");
      if (!actions || !heading) return;
      bar.classList.remove("has-actions-below");
      const available = bar.clientWidth;
      const actionWidth = Math.min(actions.scrollWidth, available);
      const headWidth = Math.max(0, available - actionWidth - 12);
      const hintHeight = hint?.getBoundingClientRect().height || 0;
      const lineHeight = hint ? parseFloat(getComputedStyle(hint).lineHeight) || 16 : 16;
      const hintLines = hintHeight / lineHeight;
      const actionRows = new Set([...actions.children].map((child) => Math.round(child.getBoundingClientRect().top))).size;
      if (headWidth < 132 || hintLines > 2.2 || actionRows > 1 || actions.scrollWidth > available) {
        bar.classList.add("has-actions-below");
      }
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    new ResizeObserver(schedule).observe(bar);
    new MutationObserver(schedule).observe(bar, { childList: true, subtree: true, characterData: true });
    window.addEventListener("i18n:lang", schedule);
    schedule();
  }
}
