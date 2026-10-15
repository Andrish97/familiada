// Nagłówek list Gier/Baz/Logo: pozwól tytułowi i podpowiedzi zawinąć się
// przed przeniesieniem akcji. Akcje schodzą niżej, gdy nie mieszczą się nawet
// obok minimalnej szerokości nagłówka.
export function initListHeaderLayout(selector = ".bar") {
  const bars = [...document.querySelectorAll(selector)].filter((bar) => bar.querySelector(":scope > .actions"));
  for (const bar of bars) {
    let queued = false;
    const update = () => {
      queued = false;
      const actions = bar.querySelector(":scope > .actions");
      const heading = [...bar.children].find((child) => child !== actions);
      if (!actions || !heading) return;
      const hint = heading.querySelector(".hint");
      if (hint) {
        const hintText = hint.textContent.trim().replace(/\s+/g, " ");
        if (hint.dataset.listHintWrapSource !== hintText) {
          hint.dataset.listHintWrapSource = hintText;
          const phrases = hintText.split(/(?<=[,.])\s+/u).filter(Boolean);
          hint.replaceChildren(...phrases.flatMap((phrase, index) => {
            const nodes = [];
            if (index) nodes.push(document.createTextNode(" "));
            const part = document.createElement("span");
            part.className = "list-hint-phrase";
            part.textContent = phrase;
            nodes.push(part);
            return nodes;
          }));
        }
      }
      bar.classList.remove("has-actions-below");
      const available = bar.clientWidth;
      const barStyle = getComputedStyle(bar);
      const barGap = parseFloat(barStyle.columnGap) || parseFloat(barStyle.gap) || 0;
      const actionStyle = getComputedStyle(actions);
      const actionGap = parseFloat(actionStyle.columnGap) || parseFloat(actionStyle.gap) || 0;
      const visibleActions = [...actions.children].filter((child) => child.getClientRects().length);
      const actionWidth = visibleActions.reduce((width, child) => width + Math.max(child.getBoundingClientRect().width, child.scrollWidth), 0)
        + Math.max(0, visibleActions.length - 1) * actionGap;
      const title = heading.querySelector(".title, h1, [data-list-title]");
      const titleStyle = title ? getComputedStyle(title) : null;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context && titleStyle) context.font = titleStyle.font;
      let titleText = title?.textContent?.trim() || "";
      if (titleStyle?.textTransform === "uppercase") titleText = titleText.toLocaleUpperCase();
      if (titleStyle?.textTransform === "lowercase") titleText = titleText.toLocaleLowerCase();
      const spacingValue = titleStyle ? Number.parseFloat(titleStyle.letterSpacing) || 0 : 0;
      const letterSpacing = titleStyle?.letterSpacing.endsWith("em")
        ? spacingValue * (Number.parseFloat(titleStyle.fontSize) || 16)
        : spacingValue;
      const words = titleText.split(/\s+/).filter(Boolean);
      const titleMinimumWidth = title ? Math.ceil(Math.max(0, ...words.map((word) =>
        (context?.measureText(word).width || 0) + Math.max(0, word.length - 1) * letterSpacing,
      ))) : 0;
      // Podpowiedź nie uczestniczy w decyzji o przeniesieniu przycisków.
      // Ma zawijać się tekstem (text-wrap: pretty), pozostając przy akcjach,
      // dopóki sam tytuł i cała grupa przycisków mieszczą się w jednym rzędzie.
      if (titleMinimumWidth + actionWidth + barGap > available || actionWidth > available) {
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

  initListBottomToolbarLayout();
}

// Dolny pasek list: najpierw sprawdza naturalną szerokość wszystkich kontrolek.
// Jeśli mieszczą się razem, blokuje zawijanie. Gdy nie mieszczą się, dzieli
// dostępną szerokość proporcjonalnie między lewą i prawą grupę, a kontrolki
// każdej grupy układa w najmniejszą liczbę możliwie równych wierszy.
function initListBottomToolbarLayout() {
  for (const bar of document.querySelectorAll(".games-bottom")) {
    let queued = false;
    let lastLayout = "";
    let lastAvailableWidth = null;
    const measureBox = document.createElement("div");
    measureBox.className = "toolbar-measure-box";
    Object.assign(measureBox.style, {
      position: "fixed", left: "-100000px", top: "0", width: "max-content",
      maxWidth: "none", visibility: "hidden", pointerEvents: "none",
      display: "block", flex: "none",
    });
    bar.append(measureBox);
    const measureGroup = (group) => {
      if (!group) return { width: 0, items: [] };
      const clone = group.cloneNode(true);
      Object.assign(clone.style, {
        display: "flex", width: "max-content", minWidth: "max-content", maxWidth: "none",
        flex: "0 0 auto", flexWrap: "nowrap", margin: "0", position: "static",
      });
      for (const child of clone.children) child.style.flex = "0 0 auto";
      measureBox.replaceChildren(clone);
      const items = [...clone.children].map((item) => item.getBoundingClientRect().width);
      const cloneStyle = getComputedStyle(clone);
      const gap = parseFloat(cloneStyle.columnGap) || parseFloat(cloneStyle.gap) || 0;
      // Szerokość samego flexa może być zaniżona przez zawijanie lub zawyżona
      // przez wewnętrzną szerokość kontrolki (np. menu selecta). Pasek ma
      // podejmować decyzję na podstawie faktycznych kontrolek i ich odstępów.
      const width = items.reduce((total, itemWidth) => total + itemWidth, 0)
        + Math.max(0, items.length - 1) * gap;
      measureBox.replaceChildren();
      return { width, items };
    };
    const update = () => {
      queued = false;
      const left = bar.querySelector(":scope > .games-bottom-left");
      const right = bar.querySelector(":scope > .games-bottom-right");
      if (!left || !right) return;
      const available = bar.clientWidth;
      if (lastAvailableWidth !== null && Math.abs(lastAvailableWidth - available) > 1) {
        bar.classList.remove("is-compact-icons");
      }
      lastAvailableWidth = available;
      const leftMeasure = measureGroup(left);
      const rightMeasure = measureGroup(right);
      const barStyle = getComputedStyle(bar);
      const groupGap = parseFloat(barStyle.columnGap) || parseFloat(barStyle.gap) || 0;
      const needed = leftMeasure.width + rightMeasure.width + groupGap;
      if (needed <= available + 1) {
        const layout = "single";
        if (layout === lastLayout) return;
        lastLayout = layout;
        bar.classList.remove("is-balanced-wrap");
        bar.classList.add("is-single-row");
        left.style.removeProperty("--toolbar-columns");
        right.style.removeProperty("--toolbar-columns");
        return;
      }

      const room = Math.max(0, available - groupGap);
      const leftGap = parseFloat(getComputedStyle(left).columnGap) || parseFloat(getComputedStyle(left).gap) || 0;
      const rightGap = parseFloat(getComputedStyle(right).columnGap) || parseFloat(getComputedStyle(right).gap) || 0;
      const groupColumns = (items, columns, gap) => {
        const widths = Array.from({ length: columns }, (_, column) =>
          Math.max(0, ...items.filter((_, index) => index % columns === column)));
        return widths.reduce((total, width) => total + width, 0) + Math.max(0, columns - 1) * gap;
      };
      const chooseLayout = (leftItems, rightItems) => {
        let best = null;
        for (let leftColumns = 1; leftColumns <= Math.max(1, leftItems.length); leftColumns++) {
          for (let rightColumns = 1; rightColumns <= Math.max(1, rightItems.length); rightColumns++) {
            const leftWidth = groupColumns(leftItems, leftColumns, leftGap);
            const rightWidth = groupColumns(rightItems, rightColumns, rightGap);
            if (leftWidth + rightWidth + groupGap > room + 1) continue;
            const leftRows = Math.ceil(leftItems.length / leftColumns) || 1;
            const rightRows = Math.ceil(rightItems.length / rightColumns) || 1;
            const score = [Math.max(leftRows, rightRows), leftRows + rightRows, Math.abs(leftRows - rightRows), -(leftColumns + rightColumns)];
            if (!best || score.some((value, index) => value < best.score[index]
              && score.slice(0, index).every((earlier, prior) => earlier === best.score[prior]))) {
              best = { leftColumns, rightColumns, score };
            }
          }
        }
        return best;
      };
      let chosen = chooseLayout(leftMeasure.items, rightMeasure.items);
      // Na tabletach tekstowe etykiety nie mają tworzyć trzeciego rzędu.
      // Gdy nie da się ułożyć przycisków tekstowych w maksymalnie dwóch,
      // wybieramy wariant ikonowy i ponownie liczymy jego rzeczywistą szerokość.
      const hasVisibleTextLabels = [...bar.querySelectorAll(".games-bottom-right .only-desktop")]
        .some((label) => label.getClientRects().length);
      if (chosen?.score[0] > 2 && hasVisibleTextLabels && !bar.classList.contains("is-compact-icons")) {
        bar.classList.add("is-compact-icons");
        queued = true;
        requestAnimationFrame(() => { queued = false; schedule(); });
        return;
      }
      const layout = `${available}:${leftMeasure.items.length}:${rightMeasure.items.length}`;
      bar.classList.remove("is-single-row");
      bar.classList.add("is-balanced-wrap");
      // Gdy mimo tego żaden układ się nie mieści, po równo ogranicz liczbę
      // kolumn. To pozostawia kontrolki w możliwie najmniejszej liczbie rzędów.
      chosen ||= { leftColumns: 1, rightColumns: 1 };
      const leftColumns = chosen.leftColumns;
      const rightColumns = chosen.rightColumns;
      const layoutKey = `${layout}:${leftColumns}:${rightColumns}:${bar.classList.contains("is-compact-icons")}`;
      if (layoutKey === lastLayout) return;
      lastLayout = layoutKey;
      left.style.setProperty("--toolbar-columns", String(leftColumns));
      right.style.setProperty("--toolbar-columns", String(rightColumns));
      for (const item of right.children) item.style.removeProperty("grid-column");
      const lastRowItems = right.children.length % rightColumns;
      if (lastRowItems) {
        const firstLastRow = right.children.length - lastRowItems;
        const offset = rightColumns - lastRowItems;
        [...right.children].slice(firstLastRow).forEach((item, index) => {
          item.style.gridColumn = String(offset + index + 1);
        });
      }
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(bar);
    const mutation = new MutationObserver((records) => {
      if (records.some((record) => !record.target.closest?.(".toolbar-measure-box"))) schedule();
    });
    mutation.observe(bar, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("i18n:lang", () => {
      bar.classList.remove("is-compact-icons");
      schedule();
    });
    schedule();
  }
}
