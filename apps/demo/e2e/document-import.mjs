import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const googleDocs = readFileSync(join(here, "../../../packages/editor/fixtures/samples/google-docs.html"));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

const demo = () => page.locator("[data-example='document-import']");
const editor = () => demo().locator(".bn-editor");
const input = () => demo().getByTestId("document-import-example-input");

const pick = (file) => input().setInputFiles(file);

const response = await page.goto(`${BASE_URL}/docs/document-import`);
const h1 = (await page.locator("article h1").first().innerText().catch(() => "")).trim();
const active = await page.locator("aside a[aria-current='page'][href='/docs/document-import']").count();
check("/docs/document-import renders", response?.status() === 200 && h1 === "Document import" && active === 1, `h1="${h1}"`);
await editor().waitFor({ timeout: 15000 });
check("example starts with the prompt heading", (await editor().locator("h2").innerText()) === "Import a document");

await pick({
  name: "notes.html",
  mimeType: "text/html",
  buffer: Buffer.from('<h2>From HTML</h2><p>A <strong>bold</strong> <a href="https://example.com">link</a>.</p><script>bad()</script>'),
});
await demo().getByTestId("document-import-report").waitFor({ timeout: 10000 });
check("HTML import replaces the document", (await editor().locator("h2").innerText()) === "From HTML");
check("HTML import keeps the link", (await editor().locator("a[href='https://example.com']").count()) === 1);
check("HTML import shows a fidelity score", /^\d+%$/.test(await demo().getByTestId("document-import-score").innerText()));
check("HTML import lists the conversion warning", (await demo().getByTestId("document-import-warnings").innerText()).includes("Imported HTML"));

await pick({
  name: "notes.md",
  mimeType: "text/markdown",
  buffer: Buffer.from("# Markdown title\n\nA **bold** [link](https://example.com/md).\n\n- one\n- two"),
});
await editor().locator("h1").waitFor({ timeout: 10000 });
check("Markdown import makes a heading", (await editor().locator("h1").innerText()) === "Markdown title");
check("Markdown import keeps the link", (await editor().locator("a[href='https://example.com/md']").count()) === 1);
check("Markdown import makes list items", (await editor().locator("[data-content-type='bulletListItem']").count()) >= 2);

await pick({
  name: "notes.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("First paragraph.\n\nSecond paragraph."),
});
await page.waitForTimeout(400);
check(
  "plain text becomes paragraphs",
  (await editor().locator("[data-content-type='paragraph']").count()) >= 2 && (await editor().innerText()).includes("First paragraph."),
);

await pick({
  name: "google-docs.html",
  mimeType: "text/html",
  buffer: googleDocs,
});
await editor().getByText("Quarterly planning").waitFor({ timeout: 10000 });
check("Google Docs HTML keeps the title", (await editor().innerText()).includes("Quarterly planning"));
check("Google Docs HTML keeps a heading", (await editor().locator("h1, h2").count()) >= 1);

await pick({
  name: "chapter.pages",
  mimeType: "application/vnd.apple.pages",
  buffer: Buffer.from("not a real pages file"),
});
await demo().getByTestId("document-import-error").waitFor({ timeout: 5000 });
check("Pages files are refused", (await demo().getByTestId("document-import-error").innerText()).includes("Export as Word"), await demo().getByTestId("document-import-error").innerText());

await editor().click();
await page.keyboard.press("Meta+a");
await page.keyboard.press("Backspace");
await page.keyboard.press("Control+a");
await page.keyboard.press("Backspace");
await page.keyboard.type("/import");
const menu = page.locator(".bn-suggestion-menu");
await menu.waitFor({ timeout: 5000 });
const titles = (await menu.locator(".bn-suggestion-menu-item").allInnerTexts()).map((t) => t.split("\n")[0].trim());
check("slash menu offers Import document", titles.includes("Import document"), titles.join(", "));
await page.keyboard.press("Escape");

await demo().screenshot({ path: `${SHOTS}/document-import.png` });

await page.goto(`${BASE_URL}/playground`);
await page.evaluate(() => localStorage.clear());
await page.reload();
const play = page.locator(".playground-editor .bn-editor");
await play.waitFor({ timeout: 15000 });
check("playground has an Import button", (await page.getByTestId("playground-import").count()) === 1);
await page.getByTestId("playground-import-input").setInputFiles({
  name: "play.md",
  mimeType: "text/markdown",
  buffer: Buffer.from("# Playground file\n\nImported from the playground."),
});
await page.getByTestId("playground-import-report").waitFor({ timeout: 10000 });
check("playground Import replaces the document", (await play.locator("h1").innerText()) === "Playground file");
check("playground shows a fidelity report", /^\d+%$/.test(await page.getByTestId("playground-import-score").innerText()));
check("playground report lists the markdown conversion", (await page.getByTestId("playground-import-warnings").innerText()).includes("marked"));
await page.screenshot({ path: `${SHOTS}/playground-import.png`, fullPage: true });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} document-import checks passed`);
process.exit(failed.length ? 1 : 0);
