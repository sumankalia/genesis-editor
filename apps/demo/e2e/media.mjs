import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

const response = await page.goto(`${BASE_URL}/docs/image-uploads`);
check("/docs/image-uploads renders", response?.status() === 200);
check("documents alt text, captions, and alignment", /Alt text, captions, and alignment/.test(await page.locator("article").innerText()));

const demo = page.locator("[data-example='image-by-url']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
const image = editor.locator("[data-content-type='image']");
check("example image renders its alt", (await image.locator("img.bn-visual-media").getAttribute("alt")) === "A soft gradient");
check("example image shows its caption", /Added by URL/.test(await image.innerText()));
check("example image is centered", (await image.getAttribute("data-text-alignment")) === "center");
const margin = await image.locator(".bn-file-block-content-wrapper").evaluate((el) => getComputedStyle(el).marginLeft);
check("centered image has auto side margin", margin === "auto" || Number.parseFloat(margin) > 0, margin);
await image.locator("img.bn-visual-media").click();
const toolbar = page.locator(".bn-formatting-toolbar");
await toolbar.waitFor({ timeout: 5000 });
check("image toolbar has Alt text", (await toolbar.locator('[data-test="altText"]').count()) === 1);
check("image toolbar has Edit caption", (await toolbar.getByRole("button", { name: "Edit caption" }).count()) === 1);
check("image toolbar has align center", (await toolbar.locator('[data-test="alignTextCenter"]').count()) === 1);
await demo.screenshot({ path: `${SHOTS}/media-image-toolbar.png` });

const embedsDocs = await page.goto(`${BASE_URL}/docs/embeds`);
check("/docs/embeds documents click-to-load", embedsDocs?.status() === 200 && /clickToLoad/.test(await page.locator("article").innerText()));

await page.goto(`${BASE_URL}/playground`);
await page.evaluate(() => localStorage.clear());
await page.reload();
const playground = page.locator(".playground-editor .bn-editor");
await playground.waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "Reset" }).click();
await page.waitForTimeout(300);
const last = playground.locator(".bn-block-content").last();
await last.click();
await page.keyboard.type("/embed");
const menu = page.locator(".bn-suggestion-menu");
await menu.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
await page.keyboard.press("Enter");
const input = playground.locator(".genesis-embed-input").last();
await input.waitFor({ timeout: 5000 });
await input.fill(YT);
await playground.locator(".genesis-embed-submit").last().click();
const iframe = playground.locator(".genesis-embed iframe").last();
await iframe.waitFor({ timeout: 8000 });
check("default has no Load button", (await playground.locator("[data-testid='embed-load']").count()) === 0);
check("iframe loads immediately", (await iframe.getAttribute("src").catch(() => "")) === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
check("resize handle is present", (await playground.locator("[data-testid='embed-resize']").count()) >= 1);
const embedCaption = playground.locator("[data-testid='embed-caption']").last();
await embedCaption.evaluate((el) => {
  el.focus();
  el.textContent = "Weekend watch";
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
});
await page.waitForTimeout(200);
check("embed caption is stored", /Weekend watch/.test(await embedCaption.innerText()));
await playground.locator(".genesis-embed").last().screenshot({ path: `${SHOTS}/media-embed-click-to-load.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} media checks passed`);
process.exit(failed.length ? 1 : 0);
