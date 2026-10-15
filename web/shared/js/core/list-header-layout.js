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
      const width = clone.getBoundingClientRect().width;
      const items = [...clone.children].map((item) => item.getBoundingClientRect().width);
      measureBox.replaceChildren();
      return { width, items };
    };
    const update = () => {
      queued = false;
      const left = bar.querySelector(":scope > .games-bottom-left");
      const right = bar.querySelector(":scope > .games-bottom-right");
      if (!left || !right) return;
      const available = bar.clientWidth;
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

      const layout = `${available}:${leftMeasure.items.length}:${rightMeasure.items.length}`;
      bar.classList.remove("is-single-row");
      bar.classList.add("is-balanced-wrap");
      const room = Math.max(0, available - groupGap);
      const naturalTotal = leftMeasure.width + rightMeasure.width || 1;
      const leftRoom = room * leftMeasure.width / naturalTotal;
      const rightRoom = room - leftRoom;
      const columnsFor = (items, width, gap) => {
        if (!items.length) return 1;
        for (let columns = items.length; columns >= 1; columns--) {
          let rowWidth = 0;
          for (let column = 0; column < columns; column++) {
            const columnWidth = Math.max(0, ...items.filter((_, index) => index % columns === column));
            rowWidth += columnWidth;
          }
          rowWidth += Math.max(0, columns - 1) * gap;
          if (rowWidth <= width + 1) return columns;
        }
        return 1;
      };
      const leftGap = parseFloat(getComputedStyle(left).columnGap) || parseFloat(getComputedStyle(left).gap) || 0;
      const rightGap = parseFloat(getComputedStyle(right).columnGap) || parseFloat(getComputedStyle(right).gap) || 0;
      const leftColumns = columnsFor(leftMeasure.items, leftRoom, leftGap);
      const rightColumns = columnsFor(rightMeasure.items, rightRoom, rightGap);
      const layoutKey = `${layout}:${leftColumns}:${rightColumns}`;
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
    window.addEventListener("i18n:lang", schedule);
    schedule();
  }
}
