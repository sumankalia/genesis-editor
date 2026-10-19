import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

const response = await page.goto(`${BASE_URL}/docs/font-size`);
check("/docs/font-size renders", response?.status() === 200);
const demo = page.locator("[data-example='font-size']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
const mod = process.platform === "darwin" ? "Meta" : "Control";

const block = (text) => editor.locator(".bn-block-content", { hasText: text }).first();
/** Selects from `from` to the end of `to` inside the block containing `text`, across text nodes. */
async function select(text, from, to = from) {
  await block(text).evaluate(
    (el, [a, b]) => {
      const nodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
      const full = nodes.map((n) => n.textContent).join("");
      const start = full.indexOf(a);
      const end = full.indexOf(b, start) + b.length;
      const locate = (offset) => {
        for (const n of nodes) {
          if (offset <= n.textContent.length) return [n, offset];
          offset -= n.textContent.length;
        }
        return [nodes[nodes.length - 1], nodes[nodes.length - 1].textContent.length];
      };
      const range = document.createRange();
      range.setStart(...locate(start));
      range.setEnd(...locate(end));
      el.closest("[contenteditable]").focus();
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    },
    [from, to],
  );
  await page.waitForTimeout(300);
}
const toolbar = page.locator(".bn-formatting-toolbar");
const trigger = toolbar.locator('[data-test="fontSize"]');
const label = () => toolbar.getByTestId("font-size-label").innerText().then((t) => t.trim());
const sizeOf = (text) =>
  editor
    .locator("[data-style-type='fontSize']", { hasText: text })
    .first()
    .evaluate((el) => [el.getAttribute("data-value"), getComputedStyle(el).fontSize])
    .catch(() => [null, null]);
const plainSize = (text) => block(text).evaluate((el) => getComputedStyle(el.querySelector(".bn-inline-content")).fontSize);

// 1. Rendering of stored sizes.
check("20px run renders", (await sizeOf("Saturday, 8 pm"))[1] === "20px", String(await sizeOf("Saturday, 8 pm")));
check("12px run renders", (await sizeOf("Tickets are non-refundable."))[1] === "12px");
check("8px run renders", (await sizeOf("Small print"))[1] === "8px");
check("unsized text is 16px", (await plainSize("Doors open at 7.")) === "16px");

// 2. The dropdown.
await select("Doors open at 7.", "Doors");
check("dropdown shows Default for unsized text", (await label()) === "Default", await label());
await select("Saturday, 8 pm", "Saturday");
check("dropdown shows the stored size", (await label()) === "20", await label());
await select("Doors open at 7.", "Doors");
await trigger.click();
const menu = page.locator(".genesis-font-size-menu");
await menu.waitFor({ timeout: 3000 });
const items = await menu.locator("[data-size]").evaluateAll((els) => els.map((e) => e.getAttribute("data-size")));
check("menu lists 6–20", items.join(",") === "6,8,10,12,14,16,18,20", items.join(","));
const checked = await menu.locator("[data-selected]").evaluateAll((els) => els.map((e) => e.getAttribute("data-size")));
check("Default is checked", checked.join(",") === "16", checked.join(","));
await page.waitForTimeout(200);
await page.screenshot({ path: `${SHOTS}/fontsize-menu.png`, clip: await clipAround(toolbar, menu) });
await menu.locator("[data-size='14']").click();
await page.waitForTimeout(300);
check("choosing 14 applies it", (await sizeOf("Doors"))[0] === "14px" && (await sizeOf("Doors"))[1] === "14px");
check("menu closes after choosing", !(await menu.isVisible().catch(() => false)));
check("only the selection is sized", !(await editor.locator("[data-style-type='fontSize']", { hasText: "open at" }).count()));

// 3. Mixed selection.
await select("Doors open at 7.", "Doors", "refundable.");
check("mixed selection shows —", (await label()) === "—", await label());
await trigger.click();
await menu.waitFor({ timeout: 3000 });
check("no size is checked for a mixed selection", !(await menu.locator("[data-selected]").count()));
await page.waitForTimeout(200);
await page.screenshot({ path: `${SHOTS}/fontsize-mixed.png`, clip: await clipAround(toolbar, menu) });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// 4. Shortcuts.
await select("Doors open at 7.", "Doors");
await page.keyboard.press(`${mod}+Shift+Period`);
await page.waitForTimeout(150);
check("Mod+Shift+. steps 14 → 16 (Default, no mark)", (await sizeOf("Doors"))[0] === null && (await label()) === "Default", await label());
await page.keyboard.press(`${mod}+Shift+Period`);
await page.keyboard.press(`${mod}+Shift+Period`);
await page.keyboard.press(`${mod}+Shift+Period`);
await page.waitForTimeout(150);
check("stepping up from 16 reaches 24", (await sizeOf("Doors"))[0] === "24px", String((await sizeOf("Doors"))[0]));
await page.keyboard.press(`${mod}+Shift+Comma`);
await page.waitForTimeout(150);
check("Mod+Shift+, steps down to 18", (await sizeOf("Doors"))[0] === "18px");

// 5. Undo.
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(150);
check("undo restores 20", (await sizeOf("Doors"))[0] === "20px", String((await sizeOf("Doors"))[0]));

// 6. Headings keep a size; the menu still lists 6–20.
await select("Event poster", "Event");
check("dropdown shown in a heading", (await trigger.count()) > 0);
await page.keyboard.press(`${mod}+Shift+Period`);
await page.waitForTimeout(150);
check("shortcut sizes a heading", (await block("Event poster").locator("[data-style-type='fontSize']").count()) > 0);

// 7. Google Docs paste: 11 pt body stays Default; 9 pt → 12 × 16/14.67 ≈ 13.1 → 14; 14 pt → 18.67 × 16/14.67 ≈ 20.4 → 20.
await page.mouse.click(5, 5);
await demo.getByRole("button", { name: "Paste from Google Docs (11 pt)" }).click();
await page.waitForTimeout(500);
check("11 pt body pastes as Default", !(await editor.locator("[data-style-type='fontSize']", { hasText: "Pasted from Google Docs" }).count()));
check("9 pt run pastes as 14", (await sizeOf("This 9 pt run"))[0] === "14px", String((await sizeOf("This 9 pt run"))[0]));
check("14 pt run pastes as 20", (await sizeOf("this 14 pt run"))[0] === "20px", String((await sizeOf("this 14 pt run"))[0]));
const report = (await demo.getByTestId("font-size-report").innerText().catch(() => "")).trim();
check("report counts sized runs", report === "Last import: 2 sized, 0 clamped", report);
await page.screenshot({ path: `${SHOTS}/fontsize-paste.png`, clip: await clipAround(demo.locator(".bn-block-content", { hasText: "Pasted from Google Docs" }).first(), demo.getByTestId("font-size-report")) });

// 8. Export.
await demo.getByRole("button", { name: "Export HTML" }).click();
const html = await demo.getByTestId("font-size-html").innerText();
check("export writes font-size with data-font-size", /style="font-size:20px[^"]*" data-font-size="20px"[^>]*>Saturday/.test(html));
check("export writes pasted sizes", html.includes('data-font-size="14px"') && !/raw:/.test(html));
await page.screenshot({ path: `${SHOTS}/fontsize-overview.png`, fullPage: false, clip: await clipAround(demo) });

// 9. Mobile.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mobile.on("pageerror", (e) => errors.push(e.message));
await mobile.goto(`${BASE_URL}/docs/font-size`);
const mDemo = mobile.locator("[data-example='font-size']");
await mDemo.locator(".bn-editor").waitFor({ timeout: 15000 });
await mDemo.locator(".bn-block-content", { hasText: "Doors open" }).first().evaluate((el) => {
  const node = el.querySelector(".bn-inline-content").firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 5);
  el.closest("[contenteditable]").focus();
  getSelection().removeAllRanges();
  getSelection().addRange(range);
});
await mobile.waitForTimeout(500);
const mTrigger = mobile.locator('.bn-formatting-toolbar [data-test="fontSize"]');
await mTrigger.scrollIntoViewIfNeeded().catch(() => {});
await mTrigger.click();
const mMenu = mobile.locator(".genesis-font-size-menu");
await mMenu.waitFor({ timeout: 3000 });
await mobile.waitForTimeout(300);
const box = await mMenu.boundingBox();
check("menu fits a 390px screen", !!box && box.x >= 0 && box.x + box.width <= 390, box ? `${Math.round(box.x)}..${Math.round(box.x + box.width)}` : "");
await mobile.screenshot({ path: `${SHOTS}/fontsize-mobile.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} font size checks passed`);
process.exit(failed.length ? 1 : 0);

/** A screenshot clip covering the given elements, with a margin. */
async function clipAround(...locators) {
  const boxes = (await Promise.all(locators.map((l) => l.boundingBox()))).filter(Boolean);
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 24);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 64);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + 160;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + 24;
  return { x, y, width: Math.min(1280 - x, right - x), height: bottom - y };
}
