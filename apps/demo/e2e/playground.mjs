import { chromium } from "playwright-core";

import { placeCaret, selectText } from "./caret.mjs";
import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const URL = `${BASE_URL}/playground`;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new globalThis.URL(BASE_URL).origin });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const mod = process.platform === "darwin" ? "Meta" : "Control";

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
const editor = page.locator(".playground-editor .bn-editor");
await editor.waitFor({ timeout: 15000 });

const tab = (name) => page.getByTestId("output-tabs").getByRole("tab", { name, exact: true });
const htmlOutput = page.getByTestId("output-html");
const htmlText = () => htmlOutput.locator("pre").innerText();
/** Waits for the HTML tab (debounced like the other tabs) to satisfy `test`. */
const waitForHtml = async (test, timeout = 5000) => {
  const end = Date.now() + timeout;
  let text = "";
  while (Date.now() < end) {
    text = await htmlText();
    if (test(text)) return text;
    await page.waitForTimeout(100);
  }
  return text;
};

// HTML tab: live getHTML(), pretty-printed.
await tab("HTML").click();
let html = await waitForHtml((t) => t.includes("Welcome to Genesis"));
check("HTML tab shows the document", html.startsWith("<h1") && html.includes("Welcome to Genesis"), html.slice(0, 80));
check("nested blocks are indented", /\n {2,}<li/.test(html), html.match(/.*<li.*/)?.[0]);
check("paragraphs stay on one line", /<p>Every line here is its own <strong>block<\/strong>\..*<\/p>/.test(html));
const highlighted = await htmlOutput.locator('pre.shiki span[style*="--shiki"]').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
check("HTML is highlighted", highlighted);

await placeCaret(editor.locator("h1"));
await page.keyboard.type(" today");
html = await waitForHtml((t) => t.includes("Welcome to Genesis today"));
check("typing updates the HTML tab", /<h1[^>]*>Welcome to Genesis today<\/h1>/.test(html), html.split("\n")[0]);

await selectText(editor.locator("h1"), "Welcome to ".length, "Welcome to Genesis".length);
await page.keyboard.press(`${mod}+b`);
html = await waitForHtml((t) => t.includes("<strong>Genesis</strong>"));
check("formatting a selection updates the HTML tab", /<h1[^>]*>Welcome to <strong>Genesis<\/strong> today<\/h1>/.test(html), html.split("\n")[0]);

await htmlOutput.getByRole("button", { name: /copy/i }).click();
const copied = await page.evaluate(() => navigator.clipboard.readText());
check("copy button copies the HTML shown", copied.trimEnd() === (await htmlText()).trimEnd(), `${copied.length} chars`);
await page.screenshot({ path: `${SHOTS}/playground-html-tab.png`, fullPage: true });

// Paste HTML: empty input, raw HTML, samples, options, clear.
await tab("Paste HTML").click();
const input = page.getByTestId("paste-html-input");
const status = page.getByTestId("paste-html-status");
await page.getByTestId("paste-html-load").click();
check("empty input shows an error", (await page.getByTestId("paste-html-error").innerText()).includes("Paste some HTML first"));
check("empty input leaves the document", (await editor.locator("h1").innerText()).includes("Welcome to Genesis"));

await input.fill('<div class="wrap"><h2>Pasted title</h2><p>Some <b>bold</b> and <span style="color:#e03e3e">red</span> text.</p><script>alert(1)</script></div>');
await page.getByTestId("paste-html-load").click();
await page.getByTestId("paste-html-report").waitFor({ timeout: 5000 });
check("Load replaces the document", (await editor.locator("h2").innerText()) === "Pasted title" && (await editor.locator("h1").count()) === 0);
check("report shows fidelity and blocks", /^\d+%$/.test(await page.getByTestId("paste-html-score").innerText()) && (await page.getByTestId("paste-html-blocks").innerText()) === "2");
check("report lists what was removed", (await page.getByTestId("paste-html-removed").innerText()).includes("<script>"), await page.getByTestId("paste-html-removed").innerText());
check("report lists unwrapped elements", (await status.innerText()).includes("<div>"));
await tab("HTML").click();
html = await waitForHtml((t) => t.includes("Pasted title"));
check("the HTML tab follows a Load", html.startsWith("<h2>Pasted title</h2>") && !html.includes("<script"), html.split("\n")[0]);
await tab("Paste HTML").click();
check("the textarea keeps its text across tabs", (await input.inputValue()).includes("Pasted title"));

const loadSample = async (name) => {
  await page.getByTestId("paste-html-sample").click();
  await page.getByRole("option", { name, exact: true }).click();
  await page.getByTestId("paste-html-load-sample").click();
  await page.waitForTimeout(150);
};
await loadSample("Blog page");
check("Load sample fills the textarea", (await input.inputValue()).includes("Shipping a block editor"));
check("Load sample loads it", (await editor.locator("h2").first().innerText()) === "Shipping a block editor in six weeks");
check("cleanup removes page furniture", /^\d+ sections \(/.test(await page.getByTestId("paste-html-cleanup").innerText()), await page.getByTestId("paste-html-cleanup").innerText());
check("furniture isn't in the document", !(await editor.innerText()).includes("Related posts"));
await page.screenshot({ path: `${SHOTS}/playground-paste-html.png`, fullPage: true });

await page.locator("#option-clean-noise").click();
await page.getByTestId("paste-html-load").click();
await page.waitForTimeout(150);
check("cleanup follows the Remove page furniture option", (await page.getByTestId("paste-html-cleanup").innerText()) === "off" && (await editor.innerText()).includes("Related posts"));
await tab("Code").click();
check("the generated code shows the clean option", (await page.getByTestId("output-code").innerText()).includes("clean={{ noise: false }}"));
await tab("Paste HTML").click();
await page.locator("#option-clean-noise").click();

await page.locator("#option-html-mode").click();
await page.getByRole("option", { name: /^Strict/ }).click();
await loadSample("Google Docs");
check("htmlMode applies to Load", (await status.innerText()).includes("strict"));
await page.locator("#option-html-mode").click();
await page.getByRole("option", { name: /^Clean/ }).click();

await loadSample("JSON-escaped");
check("JSON-escaped HTML is decoded", (await editor.locator("h2").innerText()) === "Release notes" && !(await editor.innerText()).includes("\\n"));
check("decoding is reported as a warning", (await page.getByTestId("paste-html-warnings").innerText()).length > 0, await page.getByTestId("paste-html-warnings").innerText());

await input.fill("<!-- only a comment --><script>x()</script>");
await page.getByTestId("paste-html-load").click();
await page.waitForTimeout(150);
check("HTML with no content says so", (await status.innerText()).includes("No blocks came out"));

await page.getByTestId("paste-html-clear").click();
check("Clear empties the input and the report", (await input.inputValue()) === "" && (await page.getByTestId("paste-html-report").count()) === 0 && (await page.getByTestId("paste-html-error").count()) === 0);

await tab("Paste Markdown").click();
const mdInput = page.getByTestId("paste-markdown-input");
await page.getByTestId("paste-markdown-load").click();
check("empty Markdown input shows an error", (await page.getByTestId("paste-markdown-error").innerText()).includes("Paste some Markdown first"));
await mdInput.fill("# Pasted md\n\nA **bold** [link](https://example.com).");
await page.getByTestId("paste-markdown-load").click();
await page.getByTestId("paste-markdown-report").waitFor({ timeout: 5000 });
check("Load Markdown replaces the document", (await editor.locator("h1").innerText()) === "Pasted md");
check("Markdown load keeps links", (await editor.locator("a[href='https://example.com']").count()) === 1);
await page.getByTestId("paste-markdown-sample").click();
await page.getByRole("option", { name: "Release notes", exact: true }).click();
await page.getByTestId("paste-markdown-load-sample").click();
await page.waitForTimeout(150);
check("Markdown sample loads", (await editor.locator("h1").innerText()) === "Release notes");
await page.screenshot({ path: `${SHOTS}/playground-paste-markdown.png`, fullPage: true });

// Mobile: the tabs scroll instead of overflowing the page.
for (const width of [320, 480]) {
  const mobile = await browser.newPage({ viewport: { width, height: 800 } });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(URL);
  await mobile.locator(".playground-editor .bn-editor").waitFor({ timeout: 15000 });
  const tabs = mobile.getByTestId("output-tabs");
  const fit = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(`${width}px: the page doesn't scroll sideways`, fit);
  const pasteTab = tabs.getByRole("tab", { name: "Paste HTML", exact: true });
  await pasteTab.scrollIntoViewIfNeeded();
  await pasteTab.click();
  check(`${width}px: every tab is reachable`, (await pasteTab.getAttribute("data-state")) === "active" && (await mobile.getByTestId("paste-html-input").isVisible()));
  const box = await mobile.getByTestId("paste-html-input").boundingBox();
  check(`${width}px: the textarea fits`, box !== null && box.x >= 0 && box.x + box.width <= width + 0.5, JSON.stringify(box));
  if (width === 320) {
    await tabs.scrollIntoViewIfNeeded();
    await mobile.screenshot({ path: `${SHOTS}/playground-mobile-320.png` });
  }
  await mobile.close();
}

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} playground checks passed`);
process.exit(failed.length ? 1 : 0);
