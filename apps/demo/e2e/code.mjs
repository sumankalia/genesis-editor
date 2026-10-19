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

const response = await page.goto(`${BASE_URL}/docs/code-blocks`);
check("/docs/code-blocks renders", response?.status() === 200);
check("documents highlighting and HTML round-trip", /language-typescript/.test(await page.locator("article").innerText()));

const demo = page.locator("[data-example='code-blocks']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();

const codeBlock = editor.locator("[data-content-type='codeBlock']").first();
await codeBlock.waitFor({ timeout: 5000 });
const select = codeBlock.locator("select");
check("language picker is present", (await select.count()) === 1);
check("example language is TypeScript", (await select.inputValue()) === "typescript", await select.inputValue());

const highlighted = await codeBlock.locator('span[style*="--shiki"]').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
check("example code is highlighted", highlighted);

await demo.getByRole("button", { name: "Export HTML" }).click();
const exported = await demo.getByTestId("code-blocks-html").innerText();
check("export writes language-typescript", exported.includes('class="language-typescript"'), exported.slice(0, 120));

await demo.getByRole("button", { name: "Paste language-js" }).click();
await page.waitForTimeout(400);
const last = editor.locator("[data-content-type='codeBlock']").last();
check("pasted language-js becomes javascript", (await last.locator("select").inputValue()) === "javascript", await last.locator("select").inputValue());
await demo.screenshot({ path: `${SHOTS}/code-blocks.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} code-block checks passed`);
process.exit(failed.length ? 1 : 0);
