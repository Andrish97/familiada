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
    const measureGroup = (group, mode = "text") => {
      if (!group) return { width: 0, items: [] };
      const clone = group.cloneNode(true);
      Object.assign(clone.style, {
        display: "flex", width: "max-content", minWidth: "max-content", maxWidth: "none",
        flex: "0 0 auto", flexWrap: "nowrap", margin: "0", position: "static",
      });
      for (const label of clone.querySelectorAll(".only-desktop")) {
        label.style.setProperty("display", mode === "icons" ? "none" : "inline", "important");
      }
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
      const textLeft = measureGroup(left, "text");
      const textRight = measureGroup(right, "text");
      const iconLeft = measureGroup(left, "icons");
      const iconRight = measureGroup(right, "icons");
      const barStyle = getComputedStyle(bar);
      const groupGap = parseFloat(barStyle.columnGap) || parseFloat(barStyle.gap) || 0;
      const room = Math.max(0, available - groupGap);
      const leftGap = parseFloat(getComputedStyle(left).columnGap) || parseFloat(getComputedStyle(left).gap) || 0;
      const rightGap = parseFloat(getComputedStyle(right).columnGap) || parseFloat(getComputedStyle(right).gap) || 0;
      const packRows = (items, width, gap) => {
        const rows = [];
        let rowWidth = 0;
        for (const itemWidth of items) {
          const nextWidth = rowWidth ? rowWidth + gap + itemWidth : itemWidth;
          if (rowWidth && nextWidth > width + 1) {
            rows.push(rowWidth);
            rowWidth = itemWidth;
          } else rowWidth = nextWidth;
        }
        if (rowWidth || !items.length) rows.push(rowWidth);
        return rows;
      };
      const candidateWidths = (items, gap) => {
        if (!items.length) return [0];
        const widths = new Set();
        for (let end = 1; end <= items.length; end++) {
          widths.add(items.slice(0, end).reduce((total, width) => total + width, 0) + (end - 1) * gap);
        }
        return [...widths].sort((a, b) => a - b);
      };
      const compareScore = (a, b) => {
        for (let index = 0; index < a.length; index++) {
          if (Math.abs(a[index] - b[index]) > 0.01) return a[index] < b[index] ? -1 : 1;
        }
        return 0;
      };
      const chooseLayout = (leftMeasure, rightMeasure) => {
        let best = null;
        for (const leftWidth of candidateWidths(leftMeasure.items, leftGap)) {
          for (const rightWidth of candidateWidths(rightMeasure.items, rightGap)) {
            if (leftWidth + rightWidth + groupGap > available + 1) continue;
            const leftRows = packRows(leftMeasure.items, leftWidth, leftGap);
            const rightRows = packRows(rightMeasure.items, rightWidth, rightGap);
            const rowCount = Math.max(leftRows.length, rightRows.length);
            let sideBalance = 0;
            let rowVariation = 0;
            for (let row = 0; row < rowCount; row++) {
              const leftRow = leftRows[row] || 0;
              const rightRow = rightRows[row] || 0;
              sideBalance += Math.abs(leftRow - rightRow);
              if (row) {
                rowVariation += Math.abs(leftRow - (leftRows[row - 1] || 0));
                rowVariation += Math.abs(rightRow - (rightRows[row - 1] || 0));
              }
            }
            // Najpierw jak najmniej rzędów; potem wyrównujemy szerokość
            // lewego i prawego bloku w każdym rzędzie, a na końcu szerokość
            // samych rzędów i obu elastycznych "kolumn".
            const firstRowFill = (leftRows[0] || 0) + (rightRows[0] || 0);
            const score = [rowCount, sideBalance, -firstRowFill, rowVariation, Math.abs(leftWidth - rightWidth)];
            if (!best || compareScore(score, best.score) < 0) {
              best = { leftWidth, rightWidth, leftRows, rightRows, score };
            }
          }
        }
        return best;
      };
      const hasVisibleTextLabels = [...bar.querySelectorAll(".games-bottom-right .only-desktop")]
        .some((label) => label.getClientRects().length);
      const textLayout = chooseLayout(textLeft, textRight);
      const iconLayout = chooseLayout(iconLeft, iconRight);
      const useIcons = hasVisibleTextLabels && textLayout && iconLayout
        && textLayout.score[0] - iconLayout.score[0] >= 2;
      bar.classList.toggle("is-compact-icons", Boolean(useIcons));
      const leftMeasure = useIcons ? iconLeft : textLeft;
      const rightMeasure = useIcons ? iconRight : textRight;
      const chosen = useIcons ? iconLayout : textLayout;
      const needed = leftMeasure.width + rightMeasure.width + groupGap;
      if (needed <= available + 1) {
        const layoutKey = `single:${useIcons}`;
        if (layoutKey === lastLayout) return;
        lastLayout = layoutKey;
        bar.classList.remove("is-balanced-wrap");
        bar.classList.add("is-single-row");
        left.style.removeProperty("width");
        right.style.removeProperty("width");
        return;
      }
      const layout = `${available}:${leftMeasure.items.length}:${rightMeasure.items.length}:${useIcons}`;
      bar.classList.remove("is-single-row");
      bar.classList.add("is-balanced-wrap");
      chosen ||= { leftWidth: Math.min(room / 2, available), rightWidth: Math.min(room / 2, available) };
      const layoutKey = `${layout}:${chosen.leftWidth}:${chosen.rightWidth}`;
      if (layoutKey === lastLayout) return;
      lastLayout = layoutKey;
      left.style.width = `${chosen.leftWidth}px`;
      right.style.width = `${chosen.rightWidth}px`;
      left.style.removeProperty("--toolbar-columns");
      right.style.removeProperty("--toolbar-columns");
      for (const item of [...left.children, ...right.children]) item.style.flex = "0 0 auto";
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
