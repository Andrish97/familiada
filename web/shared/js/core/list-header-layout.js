// Nagłówek list Gier/Baz/Logo: najpierw pozwól podpowiedzi naturalnie i
// czytelnie zawinąć się obok akcji. Przenieś całą grupę dopiero, gdy nawet
// po tym brakuje miejsca na tytuł lub same akcje nie mieszczą się w jednym rzędzie.
export function initListHeaderLayout(selector = ".bar") {
  const bars = [...document.querySelectorAll(selector)].filter((bar) => bar.querySelector(":scope > .actions"));
  for (const bar of bars) {
    let queued = false;
    const update = () => {
      queued = false;
      const actions = bar.querySelector(":scope > .actions");
      const heading = [...bar.children].find((child) => child !== actions);
      if (!actions || !heading) return;
      bar.classList.remove("has-actions-below");
      const available = bar.clientWidth;
      const actionStyle = getComputedStyle(actions);
      const actionGap = parseFloat(actionStyle.columnGap) || parseFloat(actionStyle.gap) || 0;
      const visibleActions = [...actions.children].filter((child) => child.getClientRects().length);
      const actionWidth = visibleActions.reduce((width, child) => width + child.getBoundingClientRect().width, 0)
        + Math.max(0, visibleActions.length - 1) * actionGap;
      const title = heading.querySelector(".title, h1, [data-list-title]");
      const titleStyle = title ? getComputedStyle(title) : null;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context && titleStyle) context.font = titleStyle.font;
      const titleWidth = title ? Math.ceil(context?.measureText(title.textContent.trim()).width || title.scrollWidth) : 0;
      const hint = heading.querySelector(".hint");
      const hintStyle = hint ? getComputedStyle(hint) : null;
      if (context && hintStyle) context.font = hintStyle.font;
      const hintWidth = hint ? Math.ceil(context?.measureText(hint.textContent.trim()).width || hint.scrollWidth) : 0;
      const hintRoom = available - titleWidth - actionWidth - 12;
      const actionRows = new Set(visibleActions.map((child) => Math.round(child.getBoundingClientRect().top))).size;
      const hintWouldBeHardToRead = hint && hintWidth > hintRoom && hintRoom < 148;
      if (titleWidth + actionWidth + 12 > available || actionRows > 1 || actionWidth > available || hintWouldBeHardToRead) {
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
