/**
 * Puts the caret `offset` characters into `target`'s text (`"end"` for its end) and waits until it's
 * there. Clicking and then pressing Home/End/arrows depends on where the click lands and on focus
 * settling, which differs on slower CI machines. This sets the DOM selection, which ProseMirror reads
 * on `selectionchange`, and waits two frames so the editor state has it too.
 */
export async function placeCaret(target, offset = "end") {
  await target.click();
  const element = await target.elementHandle();
  const page = target.page();
  await element.evaluate((el, offset) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
    if (!texts.length) throw new Error("placeCaret: no text in the target");
    let node = texts[texts.length - 1];
    let at = node.length;
    if (offset !== "end") {
      let left = offset;
      for (const text of texts) {
        if (left <= text.length) {
          node = text;
          at = left;
          break;
        }
        left -= text.length;
      }
    }
    const selection = getSelection();
    selection.removeAllRanges();
    selection.collapse(node, at);
  }, offset);
  await page.waitForFunction(
    ([el, offset]) => {
      const selection = getSelection();
      if (!selection.isCollapsed || !el.contains(selection.anchorNode)) return false;
      const before = document.createRange();
      before.selectNodeContents(el);
      before.setEnd(selection.anchorNode, selection.anchorOffset);
      return before.toString().length === (offset === "end" ? el.textContent.length : offset);
    },
    [element, offset],
    { timeout: 5000 },
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await element.dispose();
}
