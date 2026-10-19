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

const response = await page.goto(`${BASE_URL}/docs/markdown`);
const h1 = (await page.locator("article h1").first().innerText()).trim();
const active = await page.locator("aside a[aria-current='page'][href='/docs/markdown']").count();
check("/docs/markdown renders", response?.status() === 200 && h1 === "Markdown" && active === 1, `h1="${h1}"`);

const live = page.locator("[data-example='markdown-value']");
const liveEditor = live.locator(".bn-editor");
const source = live.getByTestId("markdown-source");
await liveEditor.waitFor({ timeout: 15000 });
check("Markdown value loads as blocks", (await liveEditor.locator("h1").innerText()) === "Release notes");
check("Markdown value keeps links and bold", (await liveEditor.locator("a[href='https://example.com/changelog']").count()) === 1 && (await liveEditor.locator("strong").count()) >= 1);
check("import report is shown", /Fidelity \d+%/.test(await live.getByTestId("markdown-score").innerText()));

await placeCaret(liveEditor.locator("h1"));
await page.keyboard.type(" for v2", { delay: 20 });
await page.waitForTimeout(400);
const typed = await source.inputValue();
check("typing emits Markdown through onChange", typed.includes("Release notes for v2"), typed.split("\n")[0]);
check("echoed value doesn't move the heading", (await liveEditor.locator("h1").innerText()).includes("Release notes for v2"));

await source.fill("# From the textarea\n\nSafe [link](javascript:alert(1)) and [ok](https://example.com).");
await page.waitForTimeout(300);
check("editing the Markdown updates the editor", (await liveEditor.locator("h1").innerText().catch(() => "")) === "From the textarea");
const unsafe = await liveEditor.evaluate((el) => ({ html: el.innerHTML, hrefs: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")) }));
check("Markdown value is sanitized", !/javascript:/i.test(unsafe.html) && unsafe.hrefs.some((h) => h === "https://example.com"), JSON.stringify(unsafe.hrefs));

await source.fill(`# Heading

A paragraph.`);
await page.waitForTimeout(300);
await live.scrollIntoViewIfNeeded();
await page.mouse.click(5, 5);
await page.waitForTimeout(300);
await live.screenshot({ path: `${SHOTS}/markdown-value.png` });

const demo = page.locator("[data-example='markdown-paste']");
const pasteEditor = demo.locator(".bn-editor");
await pasteEditor.waitFor({ timeout: 15000 });
await demo.getByRole("button", { name: "Paste GitHub" }).click();
await page.waitForTimeout(300);
check("pasted GitHub heading", (await pasteEditor.locator("h1").innerText().catch(() => "")) === "Quarterly plan");
check("pasted GitHub link", (await pasteEditor.locator("a[href='https://example.com/changelog']").count()) === 1);
check("paste report is shown", /Fidelity \d+%/.test(await demo.getByTestId("markdown-paste-score").innerText().catch(() => "")));
await demo.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await demo.screenshot({ path: `${SHOTS}/markdown-paste.png` });

await page.goto(`${BASE_URL}/docs/api`);
const handle = await page.getByTestId("api-methods").locator("tbody tr td:first-child").allInnerTexts();
check("API documents setMarkdown", handle.some((n) => n.includes("setMarkdown")), handle.join(","));
const mdProps = await page.getByTestId("api-markdown-props").locator("tbody tr td:first-child").allInnerTexts();
check("API documents format=markdown props", ["value", "defaultValue", "onChange"].every((n) => mdProps.some((p) => p.trim().startsWith(n))), mdProps.join(","));

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} markdown checks passed`);
process.exit(failed.length ? 1 : 0);
