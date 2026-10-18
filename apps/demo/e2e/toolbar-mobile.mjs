import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const errors = [];

for (const width of [320, 390, 430]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => errors.push(e.message));
  // The font size page enables the widest toolbar: block type, marks, alignment, size, colours, nesting, link.
  await page.goto(`${BASE_URL}/docs/font-size`);
  const demo = page.locator("[data-example='font-size']");
  await demo.locator(".bn-editor").waitFor({ timeout: 15000 });
  await demo
    .locator(".bn-inline-content", { hasText: "Doors open" })
    .first()
    .evaluate((el) => {
      const node = el.firstChild;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 5);
      el.closest("[contenteditable]").focus();
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
  const toolbar = page.locator(".bn-formatting-toolbar");
  await toolbar.waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);

  const layout = await toolbar.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const items = [...el.querySelectorAll(":scope > *")].filter((c) => c.getBoundingClientRect().width > 1);
    const outside = items
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.left < 0 || r.right > innerWidth;
      })
      .map((c) => c.getAttribute("data-test") || c.textContent.trim() || c.tagName);
    return { left: box.left, right: box.right, scrolls: el.scrollWidth > el.clientWidth + 1, items: items.length, outside };
  });
  check(
    `${width}px: toolbar is on screen`,
    layout.left >= 0 && layout.right <= width,
    `${Math.round(layout.left)}..${Math.round(layout.right)}`,
  );
  check(`${width}px: no buttons are scrolled or cut off`, !layout.scrolls && layout.outside.length === 0, layout.outside.join(", "));
  if (width === 390) await page.screenshot({ path: `${SHOTS}/toolbar-mobile.png` });

  const colors = toolbar.locator('[data-test="colors"]');
  await colors.click();
  const picker = page.getByTestId("color-picker");
  const opened = await picker.waitFor({ timeout: 3000 }).then(() => true, () => false);
  check(`${width}px: the last-row buttons work (colour picker opens)`, opened);
  await page.close();
}

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} mobile toolbar checks passed`);
process.exit(failed.length ? 1 : 0);
