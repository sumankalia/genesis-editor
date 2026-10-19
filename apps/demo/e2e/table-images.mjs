import { readFileSync } from "node:fs";

import { chromium } from "playwright-core";

import { placeCaret } from "./caret.mjs";
import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

// A dev.to article as browsers copy it (StartFragment, meta charset, inline styles, picture/srcset, data-src),
// with its images on the "remote" host the docs example serves from 127.0.0.1.
const PAGE_ORIGIN = new URL(BASE_URL).origin;
const REMOTE_ORIGIN = PAGE_ORIGIN.replace("//localhost", "//127.0.0.1");
const FIXTURE = readFileSync(new URL("../../../packages/editor/test/fixtures/devto-clipboard.html", import.meta.url), "utf8");
const clipboardHtml = FIXTURE.replaceAll("{{ORIGIN}}", REMOTE_ORIGIN);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: PAGE_ORIGIN });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
const copies = [];
page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/mock-upload-from-url") && copies.push(r.url()));
const mod = process.platform === "darwin" ? "Meta" : "Control";

const openExample = async () => {
  await page.goto(`${BASE_URL}/docs/image-uploads`);
  const demo = page.locator("[data-example='image-rehost']");
  const editor = demo.locator(".bn-editor");
  await editor.waitFor({ timeout: 15000 });
  await demo.scrollIntoViewIfNeeded();
  return { demo, editor };
};

const cellImages = (editor) => editor.locator("table td .genesis-inline-image img");
const srcs = (editor) => cellImages(editor).evaluateAll((els) => els.map((el) => el.getAttribute("src")));

/** Pins the caret in a table cell. Empty cells have no text node, so `placeCaret` would throw. */
async function placeCaretInCell(cell) {
  const content = cell.locator("p").first();
  await content.waitFor({ timeout: 5000 });
  await content.click({ force: true });
  const text = (await content.textContent()) ?? "";
  if (text.length > 0) {
    await placeCaret(content, "end");
    return;
  }
  const handle = await content.elementHandle();
  await handle.evaluate((el) => {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.waitForFunction(
    (el) => {
      const selection = getSelection();
      return Boolean(selection.rangeCount && selection.anchorNode && el.contains(selection.anchorNode));
    },
    handle,
    { timeout: 5000 },
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await handle.dispose();
}

// 1. A paste event carrying the browser's text/html, as ⌘V delivers it.
let { demo, editor } = await openExample();
await editor.click();
await page.evaluate(
  ({ html }) => {
    const target = document.querySelector("[data-example='image-rehost'] .bn-editor");
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", "Last month I spoke at a conference about what browsers can do on their own.");
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  },
  { html: clipboardHtml },
);
await editor.locator("table").waitFor({ timeout: 5000 });
let pasted = await srcs(editor);
check("the pasted table keeps its 6 images", pasted.length === 6, pasted.length);
check("images stay in their cells (3 per row)", (await editor.locator("table tr").evaluateAll((rows) => rows.map((r) => r.querySelectorAll(".genesis-inline-image").length))).join() === "3,3");
check("lazy and responsive sources are recovered", pasted.every((s) => s?.startsWith(REMOTE_ORIGIN)) && pasted[1].endsWith("/dunes.png") && pasted[2].endsWith("/dunes.png"), pasted.join(", "));
check("the empty header row is gone", (await editor.locator("table th").count()) === 0 && (await editor.locator("table tr").count()) === 2);
check("alt text is kept", (await cellImages(editor).first().getAttribute("alt")) === "Speaking at the conference");
check("the linked cell image shows its link", (await editor.locator("table [data-testid='inline-image-link']").getAttribute("href")) === "https://example.com/talk");
check("the heading's empty anchor is dropped", (await editor.locator("h2").first().innerText()).trim() === "Why I'm Revisiting Browser AI");
check("the self-linked image has no link", (await editor.locator("img.bn-visual-media").count()) === 1 && (await editor.locator("[data-testid='image-link-badge']").count()) === 0);
const badges = editor.locator("[data-testid='inline-rehost-badge']:not([hidden])");
check("cell images show re-upload progress", (await badges.count()) >= 1, await badges.count());
await page.mouse.click(5, 5);
await demo.screenshot({ path: `${SHOTS}/table-images-paste.png` });

const widths = await cellImages(editor).evaluateAll((els) => els.map((img) => [Math.round(img.getBoundingClientRect().width), Math.round(img.closest("td").clientWidth)]));
check("each image fits its cell", widths.every(([w, cell]) => w > 0 && w <= cell), JSON.stringify(widths));

// 2. Re-hosting: every cell image is copied once per URL, then the export has the copies.
await demo.getByRole("button", { name: "Save when uploads finish" }).click();
const saved = demo.getByTestId("rehost-saved");
await saved.filter({ hasText: "<table" }).waitFor({ timeout: 20000 });
const html = await saved.innerText();
const cells = html.match(/<td>(?:<a [^>]*>)?<img [^>]*>/g) ?? [];
check("export writes <td><img> for every cell", cells.length === 6, cells.length);
check("cell images were re-hosted", cells.every((c) => c.includes(`src="${PAGE_ORIGIN}/api/mock-upload/`) && c.includes("data-genesis-hosted")), cells[0]);
check("the source is kept as data-original-src", cells.some((c) => c.includes(`data-original-src="${REMOTE_ORIGIN}/examples/dunes.png"`)));
check("width and height are exported", cells[0].includes('width="799"') && cells[0].includes('height="533"'));
check("each URL is copied once", copies.length === 2, `${copies.length} requests`);
check("badges are gone", (await badges.count()) === 0);
const loaded = await page
  .waitForFunction(() => [...document.querySelectorAll("[data-example='image-rehost'] table .genesis-inline-image img")].every((el) => el.complete && el.naturalWidth > 0), null, { timeout: 5000 })
  .then(() => true, () => false);
check("copied images load", loaded);

// 3. Resize is capped to the cell, and kept.
const first = editor.locator("table .genesis-inline-image").first();
await first.hover();
const handle = first.getByTestId("inline-image-resize");
const box = await handle.boundingBox();
await page.mouse.move(box.x + 3, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const smaller = await cellImages(editor).first().evaluate((img) => Math.round(img.getBoundingClientRect().width));
check("dragging the handle resizes the image", smaller < widths[0][0] - 60, `${widths[0][0]} → ${smaller}`);
await first.hover();
const box2 = await first.getByTestId("inline-image-resize").boundingBox();
await page.mouse.move(box2.x + 3, box2.y + box2.height / 2);
await page.mouse.down();
await page.mouse.move(box2.x + 2000, box2.y + box2.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const [grown, cellWidth] = await cellImages(editor).first().evaluate((img) => [Math.round(img.getBoundingClientRect().width), img.closest("td").clientWidth]);
check("it never grows wider than the cell", grown <= cellWidth, `${grown} ≤ ${cellWidth}`);

// 4. The dialog: edit alt text and the link, then remove an image.
await first.hover();
await first.getByTestId("inline-image-edit").click();
const dialog = page.locator("dialog[open][data-testid='inline-image-dialog']");
await dialog.waitFor();
check("Edit opens the dialog with the image's values", (await dialog.getByLabel("Alt text").inputValue()) === "Speaking at the conference");
await dialog.getByLabel("Alt text").fill("On stage");
await dialog.getByLabel("Link URL").fill("example.org/talk");
await dialog.getByRole("button", { name: "Apply" }).click();
await page.waitForTimeout(150);
check("Apply updates the alt text", (await cellImages(editor).first().getAttribute("alt")) === "On stage");
check("Apply adds the link", (await editor.locator("table td").first().getByTestId("inline-image-link").getAttribute("href")) === "https://example.org/talk");
const last = editor.locator("table .genesis-inline-image").last();
const cellIndex = await last.evaluate((el) => {
  const td = el.closest("td");
  return [...td.closest("table").querySelectorAll("td")].indexOf(td);
});
const lastCell = editor.locator("table td").nth(cellIndex);
await last.hover();
await last.getByTestId("inline-image-edit").click();
await dialog.getByRole("button", { name: "Remove image" }).click();
await dialog.waitFor({ state: "hidden" });
await lastCell.locator(".genesis-inline-image").waitFor({ state: "detached" });
check("Remove image deletes it", (await cellImages(editor).count()) === 5);

// 5. Insert from the slash menu, into a cell.
// Type only `/` (a space in the query closes the menu). Click the item by title so we don't
// depend on which option is highlighted. The menu's mousedown preventDefault keeps the caret.
await placeCaretInCell(lastCell);
await page.keyboard.type("/");
const menu = page.locator(".bn-suggestion-menu");
await menu.waitFor({ state: "visible", timeout: 5000 });
const slashItem = menu.getByRole("option", { name: /^Inline image\b/ });
await slashItem.click();
// Empty placeholder has no src, so it is 0×0 and Playwright treats it as hidden.
await lastCell.locator(".genesis-inline-image").waitFor({ state: "attached", timeout: 5000 });
await dialog.waitFor();
await dialog.getByLabel("Image URL").fill(`${PAGE_ORIGIN}/examples/lake.png`);
await dialog.getByLabel("Alt text").fill("Lake");
await dialog.getByRole("button", { name: "Insert" }).click();
const inserted = lastCell.locator(".genesis-inline-image img[alt='Lake']");
await inserted.waitFor({ timeout: 5000 });
check("/Inline image inserts into the cell", (await inserted.count()) === 1 && (await inserted.getAttribute("alt")) === "Lake");
check("the slash text is gone", !/\//.test(await lastCell.innerText()));

// 6. One undo step removes the whole paste; the URL swaps never were steps.
for (let i = 0; i < 8; i++) await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(300);
check("undo goes back to before the paste", (await editor.locator("table").count()) === 0);

// 7. A real clipboard paste: the system clipboard holds the HTML, ⌘V / Ctrl+V pastes it.
({ demo, editor } = await openExample());
copies.length = 0;
await page.evaluate(async (html) => {
  await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob(["Last month"], { type: "text/plain" }) })]);
}, clipboardHtml);
await editor.click();
await page.keyboard.press(`${mod}+v`);
await editor.locator("table").waitFor({ timeout: 5000 }).catch(() => {});
pasted = await srcs(editor);
check("⌘V from the system clipboard keeps the 6 cell images", pasted.length === 6 && pasted.every((s) => s?.startsWith(REMOTE_ORIGIN)), pasted.length);
await demo.getByRole("button", { name: "Save when uploads finish" }).click();
await demo.getByTestId("rehost-saved").filter({ hasText: "<table" }).waitFor({ timeout: 20000 });
const html2 = await demo.getByTestId("rehost-saved").innerText();
check("and re-hosts them", (html2.match(/<td>(?:<a [^>]*>)?<img [^>]*src="[^"]*\/api\/mock-upload\//g) ?? []).length === 6);

// 8. Playground: the Paste HTML tab's dev.to sample.
await page.goto(`${BASE_URL}/playground`);
await page.evaluate(() => localStorage.clear());
await page.reload();
const playground = page.locator(".playground-editor .bn-editor");
await playground.waitFor({ timeout: 15000 });
await page.getByTestId("output-tabs").getByRole("tab", { name: "Paste HTML", exact: true }).click();
await page.getByTestId("paste-html-sample").click();
await page.getByRole("option", { name: "dev.to images in a table", exact: true }).click();
await page.getByTestId("paste-html-load-sample").click();
await page.getByTestId("paste-html-report").waitFor({ timeout: 5000 });
check("Playground sample: 6 images in the table", (await playground.locator("table td .genesis-inline-image img").count()) === 6);
check("the report lists the empty header row", (await page.getByTestId("paste-html-removed").innerText()).includes("thead"), await page.getByTestId("paste-html-removed").innerText());
await page.screenshot({ path: `${SHOTS}/table-images-playground.png`, fullPage: true });

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
