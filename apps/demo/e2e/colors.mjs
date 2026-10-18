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

const response = await page.goto(`${BASE_URL}/docs/colors`);
check("/docs/colors renders", response?.status() === 200);
await page.evaluate(() => localStorage.removeItem("genesis-editor:recent-colors"));
let demo = page.locator("[data-example='colors']");
let editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();

const block = (text) => editor.locator(".bn-block-content", { hasText: text }).first();
/** Selects `word` inside the block containing `text`, across text nodes. */
async function select(text, word) {
  const target = block(text);
  await target.evaluate((el, w) => {
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    const full = nodes.map((n) => n.textContent).join("");
    const start = full.indexOf(w);
    const locate = (offset) => {
      for (const n of nodes) {
        if (offset <= n.textContent.length) return [n, offset];
        offset -= n.textContent.length;
      }
      return [nodes[nodes.length - 1], nodes[nodes.length - 1].textContent.length];
    };
    const range = document.createRange();
    range.setStart(...locate(start));
    range.setEnd(...locate(start + w.length));
    el.closest("[contenteditable]").focus();
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, word);
  await page.waitForTimeout(250);
  return target;
}
const toolbar = page.locator(".bn-formatting-toolbar");
const picker = page.getByTestId("color-picker");
async function openPicker() {
  await toolbar.locator('[data-test="colors"]').click();
  await picker.waitFor({ timeout: 3000 });
  await page.waitForTimeout(250);
}
const styleOf = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
const spanWith = (target, text) => target.locator("[data-style-type]", { hasText: text }).first();

// 1. Rendering: palette names through the stylesheet, hex inline, swatches by name, block hex.
const red = spanWith(block("Palette red"), "Palette red");
check("palette colour is stored by name", (await red.getAttribute("data-value")) === "red" && !(await red.getAttribute("style")));
check("palette colour is drawn", (await styleOf(red, "color")) === "rgb(224, 62, 62)", await styleOf(red, "color"));
const hex = spanWith(block("Exact #1f6feb"), "Exact #1f6feb");
check("hex text is drawn inline", (await styleOf(hex, "color")) === "rgb(31, 111, 235)", await styleOf(hex, "color"));
const highlight = spanWith(block("Exact #1f6feb"), "#d1fae5 behind it");
check("hex background is drawn inline", (await styleOf(highlight, "backgroundColor")) === "rgb(209, 250, 229)");
const brand = spanWith(block("Brand orange"), "Brand orange");
check("brand swatch is stored by name and drawn", (await brand.getAttribute("data-value")) === "brand" && (await styleOf(brand, "color")) === "rgb(255, 90, 31)");
const tinted = editor.locator(".bn-block-outer", { hasText: "A whole paragraph" }).first();
check("block hex background is drawn", (await styleOf(tinted, "backgroundColor")) === "rgb(254, 243, 199)", await styleOf(tinted, "backgroundColor"));

// 2. The picker.
await select("Palette red", "follow the theme");
await openPicker();
const text = picker.locator("[data-section=text]");
const background = picker.locator("[data-section=background]");
check("picker has Text and Background", (await text.count()) === 1 && (await background.count()) === 1);
check("Default plus 9 palette colours", (await text.locator(".genesis-swatch").count()) >= 12 && (await text.locator('[data-color="purple"]').count()) === 1);
check("brand swatches are offered", (await text.getByTitle("Brand #ff5a1f").count()) === 1);
const docText = await text.locator("text=Document colors").locator("xpath=..").locator(".genesis-swatch").evaluateAll((els) => els.map((e) => e.dataset.color));
check("document colours list the hex in use", docText.includes("#1f6feb") && docText.includes("#3b0764"), docText.join(","));
const docBg = await background.locator("text=Document colors").locator("xpath=..").locator(".genesis-swatch").evaluateAll((els) => els.map((e) => e.dataset.color));
check("background document colours include block colours", docBg.includes("#fef3c7") && docBg.includes("#d1fae5"), docBg.join(","));
check("hex swatches show their value", (await text.locator('[data-color="#1f6feb"]').getAttribute("title")) === "#1f6feb");
await page.screenshot({ path: `${SHOTS}/colors-picker.png`, clip: await clipAround(picker, toolbar) });

await text.locator('[data-color="blue"]').click();
await page.waitForTimeout(200);
const blue = spanWith(block("Palette red"), "follow the theme");
check("palette swatch applies", (await blue.getAttribute("data-value")) === "blue");
check("picker closes after picking", !(await picker.isVisible()));

// 3. Custom colours.
await select("Palette red", "follow the theme");
await openPicker();
await text.getByRole("button", { name: "Custom…" }).click();
const form = page.getByTestId("custom-color-form");
const field = form.locator("input:not([type=color])");
await field.fill("nope");
await field.press("Enter");
check("invalid colours are explained", await form.getByText("Enter a color like").isVisible());
await field.fill("#0f766e");
check("typing clears the error", !(await form.getByText("Enter a color like").isVisible()));
check("the native picker follows the field", (await form.locator("input[type=color]").inputValue()) === "#0f766e");
await page.screenshot({ path: `${SHOTS}/colors-custom.png`, clip: await clipAround(picker, toolbar) });
await field.press("Enter");
await page.waitForTimeout(200);
const custom = spanWith(block("Palette red"), "follow the theme");
check("custom hex applies", (await custom.getAttribute("data-value")) === "#0f766e" && (await styleOf(custom, "color")) === "rgb(15, 118, 110)");
await select("Palette red", "follow the theme");
await openPicker();
const recent = await text.locator("text=Recent").locator("xpath=..").locator(".genesis-swatch").evaluateAll((els) => els.map((e) => e.dataset.color));
check("custom colours are remembered", recent[0] === "#0f766e", recent.join(","));
await text.locator('[data-color="default"]').click();
await page.waitForTimeout(200);
check("Default removes the colour", (await block("Palette red").locator('[data-style-type="textColor"]', { hasText: "follow the theme" }).count()) === 0);
await select("Palette red", "Palette red");
await openPicker();
await text.locator("text=Custom…").click();
await form.locator("input:not([type=color])").fill("rgb(124, 58, 237)");
await form.locator("input:not([type=color])").press("Enter");
await page.waitForTimeout(200);
check("Custom… accepts any CSS colour", (await spanWith(block("Palette red"), "Palette red").getAttribute("data-value")) === "#7c3aed");

// 4. Paste.
await demo.getByRole("button", { name: "Paste colored HTML" }).click();
await page.waitForTimeout(400);
const pasted = block("From a web page");
const values = await pasted.locator('[data-style-type]').evaluateAll((els) => els.map((e) => `${e.textContent}=${e.dataset.value}`));
check("a near-palette colour snaps to the palette", values.includes("almost palette red=red"), values.join(" | "));
check("other colours stay hex", values.includes("hot pink=#e60073"), values.join(" | "));
check("translucent backgrounds keep alpha", values.includes("a translucent green=#10b98140"), values.join(" | "));
check("near-black text is the default", !values.some((v) => v.startsWith("near-black")));

// 5. Export.
await demo.getByRole("button", { name: "Export HTML" }).click();
const html = await demo.getByTestId("colors-html").innerText();
check("export writes swatch names with their hex", html.includes('<span style="color:#ff5a1f" data-text-color="brand">Brand orange</span>'));
check("export writes palette names with their light hex", html.includes('style="color:#e03e3e" data-text-color="red"'));
check("export writes hex inline", html.includes('style="color:#1f6feb"') && html.includes('style="background-color:#fef3c7"'));
await demo.screenshot({ path: `${SHOTS}/colors-overview.png` });

// 6. Dark theme and colorContrast="auto".
await page.emulateMedia({ colorScheme: "dark" });
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.waitForTimeout(400);
const purple = () => spanWith(block("Exact #1f6feb"), "a dark purple");
check("hex is fixed across themes", (await styleOf(purple(), "color")) === "rgb(59, 7, 100)");
check("palette colours adapt to dark", (await styleOf(spanWith(block("From a web page"), "almost palette red"), "color")) !== "rgb(224, 62, 62)");
await demo.getByTestId("contrast-toggle").check();
await page.waitForTimeout(300);
const adjusted = await styleOf(purple(), "color");
check("colorContrast=auto lightens unreadable hex text", adjusted !== "rgb(59, 7, 100)", adjusted);
check("the stored colour is unchanged", (await purple().getAttribute("data-value")) === "#3b0764");
await demo.screenshot({ path: `${SHOTS}/colors-dark.png` });
await page.evaluate(() => document.documentElement.classList.remove("dark"));
await page.emulateMedia({ colorScheme: "light" });
await demo.getByTestId("contrast-toggle").uncheck();

// 7. custom: false.
await demo.getByTestId("custom-toggle").uncheck();
await page.waitForTimeout(800);
demo = page.locator("[data-example='colors']");
editor = demo.locator(".bn-editor");
await editor.waitFor();
await select("Palette red", "follow the theme");
await openPicker();
check("custom: false hides Custom… and document colours", (await picker.getByText("Custom…").count()) === 0 && (await picker.getByText("Document colors").count()) === 0);
await page.keyboard.press("Escape");
await demo.getByRole("button", { name: "Paste colored HTML" }).click();
await page.waitForTimeout(400);
const snapped = await block("From a web page").locator("[data-style-type]").evaluateAll((els) => els.map((e) => `${e.textContent}=${e.dataset.value}`));
check("custom: false snaps pasted hex by hue", snapped.includes("hot pink=pink"), snapped.join(" | "));
await demo.getByTestId("custom-toggle").check();

// 8. Mobile.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mobile.on("pageerror", (e) => errors.push(e.message));
await mobile.goto(`${BASE_URL}/docs/colors`);
const mDemo = mobile.locator("[data-example='colors']");
await mDemo.locator(".bn-editor").waitFor({ timeout: 15000 });
await mDemo.locator(".bn-block-content", { hasText: "Palette red" }).first().evaluate((el) => {
  const node = el.querySelector("[data-style-type]").firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 7);
  el.closest("[contenteditable]").focus();
  getSelection().removeAllRanges();
  getSelection().addRange(range);
});
await mobile.waitForTimeout(500);
const mColors = mobile.locator('.bn-formatting-toolbar [data-test="colors"]');
await mColors.scrollIntoViewIfNeeded().catch(() => {});
await mColors.click();
const mPicker = mobile.getByTestId("color-picker");
await mPicker.waitFor({ timeout: 3000 });
await mobile.waitForTimeout(300);
const box = await mPicker.boundingBox();
check("picker fits a 390px screen", !!box && box.x >= 0 && box.x + box.width <= 390, box ? `${Math.round(box.x)}..${Math.round(box.x + box.width)}` : "");
await mobile.screenshot({ path: `${SHOTS}/colors-mobile.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} color checks passed`);
process.exit(failed.length ? 1 : 0);

/** A screenshot clip covering the toolbar and the picker under it, with a margin. */
async function clipAround(...locators) {
  const boxes = (await Promise.all(locators.map((l) => l.boundingBox()))).filter(Boolean);
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 24);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 64);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + 160;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + 24;
  return { x, y, width: right - x, height: bottom - y };
}
