import { chromium } from "playwright-core";

import { placeCaret } from "./caret.mjs";
import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE_URL });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const mod = process.platform === "darwin" ? "Meta" : "Control";

const response = await page.goto(`${BASE_URL}/docs/html`);
const h1 = (await page.locator("article h1").first().innerText()).trim();
const active = await page.locator("aside a[aria-current='page'][href='/docs/html']").count();
check("/docs/html renders", response?.status() === 200 && h1 === "HTML & paste" && active === 1, `h1="${h1}"`);

// HTML in, HTML out.
const live = page.locator("[data-example='html-value']");
const liveEditor = live.locator(".bn-editor");
const source = live.getByTestId("html-source");
await liveEditor.waitFor({ timeout: 15000 });
check("HTML value loads as blocks", (await liveEditor.locator("h2").innerText()) === "Release notes");
check("HTML value keeps links and colors", (await liveEditor.locator("a[href='https://example.com/changelog']").count()) === 1 && (await liveEditor.locator("[data-style-type='textColor'][data-value='red']").count()) === 1);
check("import report is shown", /Fidelity \d+%/.test(await live.getByTestId("html-score").innerText()));
const before = await source.inputValue();

await placeCaret(liveEditor.locator("h2"));
await page.keyboard.type(" for v2", { delay: 20 });
await page.waitForTimeout(400);
await page.keyboard.type(" today", { delay: 20 });
await page.waitForTimeout(400);
const typedHtml = await source.inputValue();
check("typing emits HTML through onChange", typedHtml.includes("<h2>Release notes for v2 today</h2>"), typedHtml.split("\n")[0]);
check("echoed value doesn't move the cursor", (await liveEditor.locator("h2").innerText()) === "Release notes for v2 today");
check("emitted HTML is canonical", !typedHtml.includes("style=\"color: #e03e3e\"") && typedHtml.includes("data-text-color=\"red\""), before === typedHtml ? "unchanged" : "");

await source.fill(`<h3 onclick="alert(1)">From the textarea</h3><p>Safe<script>window.__pwned = 1</script> <a href="javascript:alert(1)">link</a></p>`);
await page.waitForTimeout(300);
check("editing the HTML updates the editor", (await liveEditor.locator("h3").innerText().catch(() => "")) === "From the textarea");
const unsafe = await liveEditor.evaluate((el) => ({ html: el.innerHTML, pwned: "__pwned" in window }));
check("HTML value is sanitized", !/onclick|<script|javascript:/i.test(unsafe.html) && !unsafe.pwned);
check("textarea keeps what was typed until the next edit", (await source.inputValue()).includes("<script>"));

await source.fill(JSON.stringify('<h3 class="sub">Escaped</h3>\n<p>Line&nbsp; one.&nbsp;&nbsp; &nbsp;</p>\n<pre><code>a\n  b</code></pre>').slice(1, -1));
await page.waitForTimeout(300);
const escaped = await liveEditor.evaluate((el) => ({
  h3: el.querySelector("h3")?.textContent,
  p: el.querySelector("[data-content-type='paragraph'] p")?.textContent,
  code: el.querySelector("pre code")?.textContent,
  text: el.textContent,
}));
check("JSON-escaped HTML value is decoded, not shown as \\n text", escaped.h3 === "Escaped" && !/\\[n"]/.test(escaped.text ?? ""), JSON.stringify(escaped).slice(0, 160));
check("&nbsp; padding collapses to single spaces", escaped.p === "Line one.", JSON.stringify(escaped.p));
check("decoded code block keeps its newlines", escaped.code === "a\n  b", JSON.stringify(escaped.code));

await source.fill(before);
await page.waitForTimeout(300);
await live.scrollIntoViewIfNeeded();
await page.mouse.click(5, 5);
await page.waitForTimeout(300);
await live.screenshot({ path: `${SHOTS}/html-value.png` });

// Paste demo.
const demo = page.locator("[data-example='html-paste']");
const pasteEditor = demo.locator(".bn-editor");
await pasteEditor.waitFor({ timeout: 15000 });
const blocksBefore = await pasteEditor.locator(".bn-block-outer").count();
await demo.getByRole("button", { name: "Paste" }).first().click();
await page.waitForTimeout(300);
check("pasted Google Docs heading", (await pasteEditor.locator("h1").innerText().catch(() => "")) === "Quarterly plan");
check("Docs bold span becomes bold", (await pasteEditor.locator("strong").first().innerText().catch(() => "")) === "Goal:");
const lossless = await pasteEditor.locator("em", { hasText: "lossless" }).evaluate((el) => !!el.closest("[data-style-type='textColor'][data-value='red'], [data-text-color='red']") || !!el.querySelector("[data-style-type='textColor'][data-value='red']")).catch(() => false);
check("Docs color and italic survive", lossless);
check("Docs list items pasted", (await pasteEditor.locator("[data-content-type='bulletListItem']").count()) === 2);
check("Docs wrapper and fonts are gone", !/docs-internal-guid|Arial|font-size/.test(await pasteEditor.innerHTML()));
const report = demo.getByTestId("paste-report");
check("paste report is shown", /\d+%/.test(await demo.getByTestId("paste-score").innerText()) && (await report.innerText()).includes("wrapper"));

await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(200);
check("one undo removes the whole paste", (await pasteEditor.locator("h1").count()) === 0 && (await pasteEditor.locator(".bn-block-outer").count()) === blocksBefore);

await demo.getByRole("button", { name: "Paste" }).nth(1).click();
await page.waitForTimeout(300);
const article = await pasteEditor.innerHTML();
check("article: table pasted", (await pasteEditor.locator("table td").count()) >= 4);
check("article: lazy image keeps its real source", (await pasteEditor.locator("img[src$='/examples/gradient.svg']").count()) === 1);
check("article: tracking params stripped", /href="https:\/\/example\.com\/engine\?id=42"/.test(article) && !/utm_/.test(article));
check("article: script, pixel, and hidden text dropped", !/trackPaste|google-analytics|Hidden promo/.test(article));
const reportText = await report.innerText();
check("article: report lists what was removed", /script/.test(reportText) && /hidden|tracking/.test(reportText), reportText.replace(/\s+/g, " ").slice(0, 160));
await page.mouse.click(5, 5);
await page.waitForTimeout(300);
await demo.screenshot({ path: `${SHOTS}/html-paste.png` });

// Page furniture and Undo cleanup.
await pasteEditor.locator("h2").first().click();
await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
await demo.getByRole("button", { name: "Paste" }).nth(2).click();
await page.waitForTimeout(300);
const toast = demo.getByTestId("cleanup-toast");
const toastText = (await toast.innerText().catch(() => "")).replace(/\s+/g, " ");
check("cleanup toast says what was removed", /Removed \d+ sections \(.+\) Undo cleanup/.test(toastText), toastText);
const cleaned = await pasteEditor.innerText();
check("blog page: article kept", cleaned.includes("Shipping a block editor in six weeks") && cleaned.includes("one click brings it all back"));
check("blog page: furniture removed", !/We use cookies|Careers|Related posts|newsletter|© 2026/.test(cleaned));
check("report shows the cleanup", /\d+ sections \(/.test(await demo.getByTestId("paste-cleanup").innerText()));
await page.waitForTimeout(200);
await demo.screenshot({ path: `${SHOTS}/cleanup-toast.png` });
await toast.getByRole("button", { name: "Undo cleanup" }).click();
await page.waitForTimeout(300);
const restored = await pasteEditor.innerText();
check("Undo cleanup restores the furniture", /We use cookies[\s\S]*Shipping a block editor[\s\S]*Related posts[\s\S]*© 2026/.test(restored));
check("Undo cleanup replaces the paste instead of adding to it", restored.split("Shipping a block editor in six weeks").length === 2);
check("toast closes after Undo cleanup", (await toast.count()) === 0);
check("report shows cleanup off", (await demo.getByTestId("paste-cleanup").innerText()) === "nothing removed");
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(200);
check("one undo removes the uncleaned paste", !(await pasteEditor.innerText()).includes("Shipping a block editor"));
await demo.getByRole("button", { name: "Paste" }).nth(2).click();
await page.waitForTimeout(200);
await pasteEditor.locator("p").first().click();
await page.keyboard.type("x");
await page.waitForTimeout(200);
check("editing dismisses the toast", (await toast.count()) === 0);

// Copy puts both HTML and plain text on the clipboard.
await demo.getByRole("button", { name: "Copy Web article" }).click();
await page.waitForTimeout(200);
const clipboardTypes = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types));
check("Copy writes text/html and text/plain", clipboardTypes.includes("text/html") && clipboardTypes.includes("text/plain"), clipboardTypes.join(","));

// Copy and paste inside the editor uses BlockNote's own clipboard.
const inside = await pasteEditor.evaluate((root) => {
  const target = root.querySelector("h2");
  const data = new DataTransfer();
  data.setData("blocknote/html", '<div class="bn-block-group" data-node-type="blockGroup"><div class="bn-block-outer" data-node-type="blockOuter"><div class="bn-block" data-node-type="blockContainer"><div class="bn-block-content" data-content-type="paragraph"><p class="bn-inline-content">internal <span data-style-type="textColor" data-value="blue">copy</span></p></div></div></div></div>');
  data.setData("text/html", "<p>internal copy</p>");
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  root.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  return root.querySelectorAll("[data-text-color='blue'], [data-style-type='textColor'][data-value='blue']").length;
});
check("internal clipboard bypasses the engine", inside > 0);

// HTML copied as JSON text (an API response, a .json file) pastes as its HTML.
const jsonPaste = await pasteEditor.evaluate((root) => {
  const target = root.querySelector("h2");
  const data = new DataTransfer();
  data.setData("text/plain", JSON.stringify([{ HTML: '<h4 class="x">From JSON</h4>\n<p>Body</p>' }], null, 2));
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  root.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  return { h4: root.querySelector("h4")?.textContent, raw: root.textContent.includes('"HTML"') };
});
check("HTML inside pasted JSON text is imported", jsonPaste.h4 === "From JSON" && !jsonPaste.raw, JSON.stringify(jsonPaste));

// API reference.
await page.goto(`${BASE_URL}/docs/api`);
const cells = (id) => page.getByTestId(id).locator("tbody tr td:first-child").allInnerTexts();
const props = await cells("api-props");
check("API documents format, htmlMode, baseUrl, onImportReport", ["format", "htmlMode", "baseUrl", "onImportReport"].every((n) => props.includes(n)), props.join(","));
const htmlProps = await cells("api-html-props");
check("API documents the HTML-format props", ["format", "defaultValue", "value", "onChange"].every((n) => htmlProps.includes(n)), htmlProps.join(","));
const handle = await cells("api-methods");
check("API documents getHTML, setHTML, lastReport", ["getHTML", "setHTML", "lastReport"].every((n) => handle.includes(n)), handle.join(","));
const options = await cells("api-parse-options");
check("API documents ParseOptions", ["mode", "tools", "baseUrl", "dom", "maxLength", "maxDepth"].every((n) => options.includes(n)), options.join(","));
check("API shows FidelityReport", (await page.locator("pre", { hasText: "export type FidelityReport" }).count()) === 1);
await page.locator("#parser").scrollIntoViewIfNeeded();
await page.evaluate(() => document.getElementById("parser").scrollIntoView({ block: "start" }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/html-api.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} html checks passed`);
process.exit(failed.length ? 1 : 0);
