/**
 * Caret and selection placement for the editors under test. Clicking and then pressing
 * Home/End/arrows depends on where the click lands and on focus settling, which differs on slower CI
 * machines. These set the DOM selection, which ProseMirror reads on `selectionchange`, wait until it
 * holds, and then wait two frames so the editor state has it too.
 */

/** Puts the caret `offset` characters into `target`'s text (`"end"` for its end). */
export function placeCaret(target, offset = "end") {
  return select(target, offset, offset);
}

/** Selects `target`'s text from character `from` to `to` (`"end"` for its end). */
export function selectText(target, from = 0, to = "end") {
  return select(target, from, to);
}

async function select(target, from, to) {
  await target.click();
  const element = await target.elementHandle();
  const page = target.page();
  await element.evaluate((el, [from, to]) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
    if (!texts.length) throw new Error("caret.mjs: no text in the target");
    const point = (offset) => {
      const last = texts[texts.length - 1];
      if (offset === "end") return [last, last.length];
      let left = offset;
      for (const text of texts) {
        if (left <= text.length) return [text, left];
        left -= text.length;
      }
      return [last, last.length];
    };
    const selection = getSelection();
    selection.removeAllRanges();
    selection.setBaseAndExtent(...point(from), ...point(to));
  }, [from, to]);
  await page.waitForFunction(
    ([el, from, to]) => {
      const selection = getSelection();
      if (!selection.rangeCount || !el.contains(selection.anchorNode) || !el.contains(selection.focusNode)) return false;
      const offsetOf = (node, offset) => {
        const before = document.createRange();
        before.selectNodeContents(el);
        before.setEnd(node, offset);
        return before.toString().length;
      };
      const length = el.textContent.length;
      return (
        offsetOf(selection.anchorNode, selection.anchorOffset) === (from === "end" ? length : from) &&
        offsetOf(selection.focusNode, selection.focusOffset) === (to === "end" ? length : to)
      );
    },
    [element, from, to],
    { timeout: 5000 },
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await element.dispose();
}
