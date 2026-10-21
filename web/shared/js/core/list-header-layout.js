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
// Gdy napisy się nie mieszczą, przyciski przechodzą na same ikony. Gdy nie
// mieszczą się nawet ikony, pasek zostaje jednym rzędem i przewija się w bok;
// na starcie w pełni widać grupę z mniejszą liczbą przycisków, a wystaje ta
// z większą (decyzja użytkownika 2026-10-21, zamiast zawijania w rzędy).
function initListBottomToolbarLayout() {
  for (const bar of document.querySelectorAll(".games-bottom")) {
    let queued = false;
    let lastLayout = "";
    let lastAvailableWidth = null;
    let lastTextMeasures = null;
    const measureBox = document.createElement("div");
    // Daj klonom tę samą bazową kaskadę .games-bottom co prawdziwemu paskowi;
    // bez tego mobilne .only-desktop i reguły kompaktowe nie są mierzone tak,
    // jak potem renderują się na stronie.
    measureBox.className = "games-bottom toolbar-measure-box";
    Object.assign(measureBox.style, {
      position: "fixed", left: "-100000px", top: "0", width: "max-content",
      maxWidth: "none", visibility: "hidden", pointerEvents: "none",
      display: "block", flex: "none",
    });
    bar.append(measureBox);
    const measureGroup = (group, mode = "text") => {
      if (!group) return { width: 0, items: [] };
      if (mode === "text") {
        const items = [...group.children]
          .filter((item) => item.getClientRects().length)
          .map((item) => Math.max(item.getBoundingClientRect().width, item.scrollWidth));
        const style = getComputedStyle(group);
        const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 0;
        return {
          width: items.reduce((total, itemWidth) => total + itemWidth, 0)
            + Math.max(0, items.length - 1) * gap,
          items,
        };
      }
      measureBox.classList.toggle("is-compact-icons", mode === "icons");
      const clone = group.cloneNode(true);
      Object.assign(clone.style, {
        display: "flex", width: "max-content", minWidth: "max-content", maxWidth: "none",
        flex: "0 0 auto", flexWrap: "nowrap", margin: "0", position: "static",
      });
      for (const label of clone.querySelectorAll(".only-desktop")) {
        label.style.setProperty("display", mode === "icons" ? "none" : "inline", "important");
      }
      if (mode === "icons") {
        // Pomiar odbywa się poza .games-bottom, więc nie dziedziczy reguł
        // .is-compact-icons. Odtwórz w klonie faktyczne wymiary kompaktowego
        // wariantu, w tym selecty, które normalnie mają szerokość 150 px.
        for (const label of clone.querySelectorAll(".ui-select-label, .ui-select-caret")) {
          label.style.setProperty("display", "none", "important");
        }
        for (const control of clone.querySelectorAll(".games-bottom-right .btn, .list-filter .ui-select-btn, .list-sort .ui-select-btn, #btnReceivedFilter, .list-search-open")) {
          Object.assign(control.style, {
            width: "36px", minWidth: "36px", maxWidth: "36px",
            height: "36px", minHeight: "36px", padding: "0",
            display: "grid", placeItems: "center", boxSizing: "border-box",
          });
        }
        for (const select of clone.querySelectorAll(".list-filter, .list-sort")) {
          Object.assign(select.style, {
            width: "36px", minWidth: "36px", maxWidth: "36px", flex: "0 0 36px",
          });
        }
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
    const updateEdges = () => {
      const max = bar.scrollWidth - bar.clientWidth;
      const scrolling = bar.classList.contains("is-scroll") && max > 1;
      bar.classList.toggle("has-more-start", scrolling && bar.scrollLeft > 1);
      bar.classList.toggle("has-more-end", scrolling && bar.scrollLeft < max - 1);
    };
    bar.addEventListener("scroll", updateEdges, { passive: true });
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
      const compact = bar.classList.contains("is-compact-icons") && lastTextMeasures;
      const textLeft = compact ? lastTextMeasures.left : measureGroup(left, "text");
      const textRight = compact ? lastTextMeasures.right : measureGroup(right, "text");
      if (!compact) lastTextMeasures = { left: textLeft, right: textRight };
      const barStyle = getComputedStyle(bar);
      const groupGap = parseFloat(barStyle.columnGap) || parseFloat(barStyle.gap) || 0;
      const hasTextLabels = [...bar.querySelectorAll(".games-bottom-right .only-desktop")]
        .some((label) => label.textContent.trim());
      const textNeeded = textLeft.width + textRight.width + groupGap;
      const useIcons = hasTextLabels && textNeeded > available + 1;
      bar.classList.toggle("is-compact-icons", useIcons);
      let needed = textNeeded;
      if (useIcons) {
        needed = measureGroup(left, "icons").width + measureGroup(right, "icons").width + groupGap;
      }
      const scroll = needed > available + 1;
      const leftCount = [...left.children].filter((item) => item.getClientRects().length).length;
      const rightCount = [...right.children].filter((item) => item.getClientRects().length).length;
      const startAtEnd = scroll && leftCount > rightCount;
      const layoutKey = `${scroll}:${useIcons}:${startAtEnd}:${available}`;
      if (layoutKey !== lastLayout) {
        lastLayout = layoutKey;
        bar.classList.add("is-single-row");
        bar.classList.toggle("is-scroll", scroll);
        if (scroll) bar.scrollLeft = startAtEnd ? bar.scrollWidth : 0;
      }
      updateEdges();
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
