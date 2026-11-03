// A code block or text diagram that is wider than the column. One that is only a little too wide is shrunk to fit, so a diagram drawn
// for a slightly narrower page is whole on screen; one that is still wider scrolls sideways, and says so: a fade at the edge that has
// more beyond it, and a way to scroll it from the keyboard. Run after the content is in the page (enhanceContent has wrapped the blocks);
// it returns the function that stops watching.

const SHRINK_UP_TO = 0.18; // a block up to this much too wide is shrunk rather than scrolled
const SMALLEST_FONT = 11; // px: never smaller than this, however wide the block

/** The classes and font size a block should have, from its measurements. Pure, for the tests. */
export function fitFor({ clientWidth, scrollWidth, scrollLeft, fontSize }) {
  const over = scrollWidth - clientWidth;
  if (clientWidth <= 0 || over <= 0) return { fontSize: null, scrollable: false, moreLeft: false, moreRight: false };
  if (over / clientWidth <= SHRINK_UP_TO) {
    // Aim a little under the width: a pixel too wide would still show a scrollbar.
    const shrunk = Math.max(SMALLEST_FONT, Math.floor((fontSize * (clientWidth - 2)) / scrollWidth * 10) / 10);
    if (shrunk < fontSize) return { fontSize: shrunk, scrollable: false, moreLeft: false, moreRight: false, retry: true };
  }
  return { fontSize: null, scrollable: true, moreLeft: scrollLeft > 1, moreRight: scrollLeft + clientWidth < scrollWidth - 1 };
}

function measure(pre, fontSize, allowShrink) {
  return fitFor({ clientWidth: pre.clientWidth, scrollWidth: pre.scrollWidth, scrollLeft: pre.scrollLeft, fontSize: allowShrink ? fontSize : 0 });
}

function update(pre) {
  const wrap = pre.parentElement;
  pre.style.fontSize = '';
  let size = parseFloat(getComputedStyle(pre).fontSize);
  let fit = measure(pre, size, true);
  // The padding does not shrink with the text, so one step can leave a little over: look again at the new size (a few times at most).
  for (let step = 0; fit.fontSize && step < 3; step++) {
    size = fit.fontSize;
    pre.style.fontSize = `${size}px`;
    fit = measure(pre, size, true);
  }
  if (fit.fontSize) fit = measure(pre, size, false); // still too wide at the smallest size: it scrolls
  wrap.classList.toggle('is-scrollable', fit.scrollable);
  wrap.classList.toggle('more-left', fit.moreLeft);
  wrap.classList.toggle('more-right', fit.moreRight);
  if (fit.scrollable) {
    pre.tabIndex = 0;
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-label', 'Code, scrolls sideways');
  } else {
    pre.removeAttribute('tabindex');
    pre.removeAttribute('role');
    pre.removeAttribute('aria-label');
  }
}

/** Watches every block under `root`. @returns {() => void} */
export function watchCodeOverflow(root) {
  const blocks = [...root.querySelectorAll('.codeblock > pre')];
  if (!blocks.length) return () => {};
  const widths = new WeakMap();
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = Math.round(entry.contentRect.width);
      if (widths.get(entry.target) === width) continue; // a change of height alone (our own font size) is not a reason to measure again
      widths.set(entry.target, width);
      update(entry.target);
    }
  });
  const scrolls = blocks.map((pre) => {
    const onScroll = () => {
      const wrap = pre.parentElement;
      wrap.classList.toggle('more-left', pre.scrollLeft > 1);
      wrap.classList.toggle('more-right', pre.scrollLeft + pre.clientWidth < pre.scrollWidth - 1);
    };
    pre.addEventListener('scroll', onScroll, { passive: true });
    resize.observe(pre);
    return [pre, onScroll];
  });
  // Highlighting fills the block in a moment after it is drawn, and can make a line longer: look again then.
  const later = setTimeout(() => blocks.forEach(update), 400);
  return () => {
    clearTimeout(later);
    resize.disconnect();
    scrolls.forEach(([pre, onScroll]) => pre.removeEventListener('scroll', onScroll));
  };
}
