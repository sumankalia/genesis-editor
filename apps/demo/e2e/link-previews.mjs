import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const SAMPLE = `${new URL(BASE_URL).origin.replace("//localhost", "//127.0.0.1")}/examples/link-preview-sample.html`;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// The failure scenario makes the mock server answer 500 on purpose.
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
const lookups = [];
page.on("request", (r) => r.url().includes("/api/mock-link-preview") && lookups.push(r.url()));
const mod = process.platform === "darwin" ? "Meta" : "Control";

const response = await page.goto(`${BASE_URL}/docs/link-previews`);
check("/docs/link-previews renders", response?.status() === 200);
check("docs explain the endpoint and SSRF", /\bSSRF\b/.test(await page.locator("article").innerText()));
const demo = page.locator("[data-example='link-previews']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();

const cards = () => editor.locator(".genesis-link-preview");
const lastBlock = () => editor.locator(".bn-block-outer").last();

// 1. A saved card draws from its stored metadata without a lookup; a linked image shows its badge.
await cards().first().waitFor({ timeout: 10000 });
check("saved card is drawn", (await cards().first().getAttribute("data-state")) === "ready" && (await cards().first().locator(".genesis-link-preview-title").innerText()) === "genesis-editor");
check("saved card isn't fetched again", lookups.length === 0, `${lookups.length}`);
const badge = editor.locator("[data-testid='image-link-badge']");
check("linked image shows where it points", (await badge.innerText()) === "Link · example.com ↗");

// 2. A URL pasted on its own line becomes a card: loading first, then the page's metadata.
await demo.getByRole("button", { name: "Paste a link" }).click();
await page.waitForTimeout(150);
check("pasted URL becomes a loading card", (await cards().count()) === 2 && (await cards().last().getAttribute("data-state")) === "loading");
await cards().last().and(page.locator("[data-state='ready']")).waitFor({ timeout: 10000 });
check("card fills in title, description and site", (await cards().last().locator(".genesis-link-preview-title").innerText()) === "Field notes from the lake" && /Three days of hiking/.test(await cards().last().innerText()) && /Genesis Journal · 127\.0\.0\.1/.test(await cards().last().innerText()));
check("card shows the og:image", (await cards().last().locator("img.genesis-link-preview-image").getAttribute("src")) === SAMPLE.replace("link-preview-sample.html", "lake.png"));
check("the lookup asked the endpoint with ?url=", lookups.some((url) => url.includes(`url=${encodeURIComponent(SAMPLE)}`)));
await page.waitForTimeout(300);
await cards().last().screenshot({ path: `${SHOTS}/link-preview-card.png` });

// 3. One undo turns the card back into the link.
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(300);
check("one undo gives the link back", (await cards().count()) === 1 && (await lastBlock().locator(`a[href='${SAMPLE}']`).count()) === 1);
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(200);

// 4. Convert to link, and the toolbar's card button turns a bare link back into a card.
await demo.getByRole("button", { name: "Paste a link" }).click();
await cards().last().and(page.locator("[data-state='ready']")).waitFor({ timeout: 10000 });
await cards().last().locator(".genesis-embed-to-link").click();
await page.waitForTimeout(300);
check("Convert to link swaps the card for a link", (await cards().count()) === 1 && (await lastBlock().locator(`a[href='${SAMPLE}']`).count()) === 1);
// The formatting toolbar needs a selection: select the line from its start (hovering the link opens BlockNote's link popup).
const linkBox = await lastBlock().locator(".bn-inline-content a").boundingBox();
await page.mouse.move(linkBox.x + 2, linkBox.y + linkBox.height / 2);
await page.mouse.down();
await page.mouse.move(linkBox.x + linkBox.width - 2, linkBox.y + linkBox.height / 2, { steps: 8 });
await page.mouse.up();
const toCard = page.getByRole("button", { name: "Show as preview card" });
const toCardShown = await toCard.waitFor({ timeout: 10000 }).then(() => true, () => false);
check("a bare-link line offers Show as preview card", toCardShown);
if (toCardShown) {
  await toCard.click();
  await cards().nth(1).and(page.locator("[data-state='ready']")).waitFor({ timeout: 10000 }).catch(() => {});
  check("the button turns it into a card", (await cards().count()) === 2 && (await cards().nth(1).getAttribute("data-state")) === "ready");
}

// 5. When the lookup fails, the card falls back to a plain link.
await demo.getByTestId("link-preview-fail").check();
const before = await cards().count();
await demo.getByRole("button", { name: "Paste a link" }).click();
await page.waitForTimeout(150);
check("failing lookup shows the loading state first", (await cards().count()) === before + 1);
await page.waitForFunction((n) => document.querySelectorAll("[data-example='link-previews'] .genesis-link-preview").length === n, before, { timeout: 10000 });
check("failed card falls back to a link", (await lastBlock().locator(`a[href='${SAMPLE}']`).count()) === 1);
await demo.getByTestId("link-preview-fail").uncheck();

// 6. /Link preview: the box takes a link.
const line = lastBlock().locator(".bn-inline-content");
const box = await line.boundingBox();
await line.click({ position: { x: box.width - 4, y: box.height / 2 } });
await page.keyboard.press("Enter");
await page.keyboard.type("/link preview");
await page.waitForTimeout(300);
await page.keyboard.press("Enter");
const input = editor.locator(".genesis-link-preview-input").last();
await input.waitFor({ timeout: 5000 });
await page.waitForTimeout(150);
check("/Link preview focuses its input", await input.evaluate((el) => el === document.activeElement));
await page.keyboard.type("javascript:alert(1)");
await page.keyboard.press("Enter");
check("a non-http link is refused", /http or https/.test(await editor.locator(".genesis-link-preview-error").last().innerText()));
await input.fill(SAMPLE);
await page.keyboard.press("Enter");
await cards().last().and(page.locator("[data-state='ready']")).waitFor({ timeout: 10000 });
check("/Link preview makes a card", (await cards().last().locator(".genesis-link-preview-title").innerText()) === "Field notes from the lake");

// 7. Image links: edit, refuse javascript:, remove.
await editor.locator("img.bn-visual-media").first().click();
const edit = page.getByRole("button", { name: "Edit image link" });
await edit.waitFor({ timeout: 5000 });
await edit.click();
const dialog = page.getByTestId("image-link-dialog");
await dialog.waitFor({ timeout: 5000 });
const url = dialog.getByLabel("Image link URL");
check("dialog shows the current link and new-tab setting", (await url.inputValue()) === "https://example.com/" && (await dialog.getByLabel("Open in a new tab").isChecked()));
await url.fill("javascript:alert(1)");
await dialog.getByRole("button", { name: "Apply" }).click();
check("javascript: is refused", /http, https, mailto or tel/.test(await dialog.getByRole("alert").innerText()));
await url.fill("example.org/photos");
await dialog.getByLabel("Open in a new tab").uncheck();
await dialog.screenshot({ path: `${SHOTS}/image-link-dialog.png` });
await dialog.getByRole("button", { name: "Apply" }).click();
await page.waitForTimeout(300);
check("the link is applied", (await badge.innerText()) === "Link · example.org" && (await badge.getAttribute("href")) === "https://example.org/photos");

await demo.getByRole("button", { name: "Export HTML" }).click();
let html = await demo.getByTestId("link-preview-html").innerText();
check("export writes the cards as <a data-genesis-link-preview>", (html.match(/data-genesis-link-preview/g) ?? []).length === 3, `${(html.match(/data-genesis-link-preview/g) ?? []).length}`);
check("export keeps the fetched metadata", html.includes('data-title="Field notes from the lake"') && html.includes('data-site-name="Genesis Journal"'));
check("export wraps the image in its link", /<a href="https:\/\/example\.org\/photos"><img src="\/examples\/lake\.png"/.test(html));

await editor.locator("img.bn-visual-media").first().click();
await edit.click();
await dialog.getByRole("button", { name: "Remove link" }).click();
await page.waitForTimeout(300);
check("Remove link takes the badge away", (await badge.count()) === 0);
const link = page.getByRole("button", { name: "Link image" });
await editor.locator("img.bn-visual-media").first().click();
await link.click();
await dialog.getByLabel("Image link URL").fill("https://example.net/");
await dialog.getByLabel("Open in a new tab").check();
await dialog.getByRole("button", { name: "Apply" }).click();
await page.waitForTimeout(300);
await demo.getByRole("button", { name: "Export HTML" }).click();
html = await demo.getByTestId("link-preview-html").innerText();
check("a new-tab link exports target and rel", html.includes('<a href="https://example.net/" target="_blank" rel="noopener noreferrer"><img'));
await page.mouse.click(5, 5);
await page.waitForTimeout(300);
await demo.screenshot({ path: `${SHOTS}/link-previews.png` });

// 8. The playground passes the mock endpoint, and the tools list has the new tool.
await page.goto(`${BASE_URL}/playground`);
await page.locator(".bn-editor").waitFor({ timeout: 15000 });
check("playground has a link preview switch, on", (await page.locator("#option-link-previews").getAttribute("data-state")) === "checked");
check("playground code shows linkPreview", /linkPreview=\{\{ endpoint/.test(await page.getByTestId("output-code").innerText()));

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} link preview checks passed`);
process.exit(failed.length ? 1 : 0);
