import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

const response = await page.goto(`${BASE_URL}/paste`);
check("/paste renders", response?.status() === 200);
await page.getByTestId("paste-landing").waitFor({ timeout: 15000 });
await page.locator(".bn-editor").waitFor({ timeout: 15000 });

await page.getByTestId("paste-landing-load").click();
check("empty paste shows an error", (await page.getByTestId("paste-landing-error").innerText()).includes("Paste some HTML first"));

await page.getByTestId("paste-landing-input").fill("<h2>Pasted title</h2><p>Hello <b>world</b>. See <a href=\"https://example.com\">the docs</a> and <code>map()</code>.</p><pre><code>const n = 1;</code></pre><script>alert(1)</script>");
await page.getByTestId("paste-landing-load").click();
await page.getByTestId("paste-landing-report").waitFor({ timeout: 5000 });
check("Load maps to blocks", (await page.locator(".bn-editor h2").innerText()) === "Pasted title");
check("report lists a drop", (await page.getByTestId("paste-landing-drop").innerText()).includes("<script>"), await page.getByTestId("paste-landing-drop").innerText());
check("report lists keep", (await page.getByTestId("paste-landing-keep").innerText()).includes("blocks"));
check("script is not in the editor", !(await page.locator(".bn-editor").innerText()).includes("alert(1)"));

await page.getByTestId("paste-landing-preview").click();
const preview = page.getByTestId("article-preview");
await preview.waitFor({ timeout: 5000 });
check("Preview is getHTML()", (await preview.locator("h2").innerText()) === "Pasted title" && (await preview.innerText()).includes("world"));
check("Preview has no slash chrome", (await page.locator(".bn-suggestion-menu").count()) === 0);
const pasteLook = await preview.evaluate((el) => {
  const p = el.querySelector("p");
  const a = el.querySelector("a");
  const code = el.querySelector("p code");
  const pre = el.querySelector("pre");
  const cs = (n) => (n ? getComputedStyle(n) : null);
  const pStyle = cs(p);
  const aStyle = cs(a);
  const codeStyle = cs(code);
  const preStyle = cs(pre);
  return {
    pGap: pStyle ? Number.parseFloat(pStyle.paddingTop) + Number.parseFloat(pStyle.marginTop) : 0,
    aColor: aStyle?.color ?? "",
    aDecoration: aStyle?.textDecorationLine ?? "",
    pColor: pStyle?.color ?? "",
    codeBg: codeStyle?.backgroundColor ?? "",
    pBg: pStyle?.backgroundColor ?? "",
    preFont: preStyle?.fontFamily ?? "",
    preBg: preStyle?.backgroundColor ?? "",
    prePad: preStyle ? Number.parseFloat(preStyle.paddingTop) : 0,
  };
});
check("Preview paragraphs are not flush", pasteLook.pGap >= 3, String(pasteLook.pGap));
check(
  "Preview links are colored and underlined",
  pasteLook.aColor !== pasteLook.pColor && pasteLook.aDecoration.includes("underline"),
  JSON.stringify({ aColor: pasteLook.aColor, pColor: pasteLook.pColor, aDecoration: pasteLook.aDecoration }),
);
check(
  "Preview code is distinct from body",
  /mono|menlo|consolas|courier/i.test(pasteLook.preFont) && pasteLook.prePad >= 16 && pasteLook.preBg !== pasteLook.pBg && pasteLook.codeBg !== pasteLook.pBg,
  JSON.stringify(pasteLook),
);
await page.screenshot({ path: `${SHOTS}/paste-preview.png` });
await page.getByTestId("paste-landing-edit").click();

await page.getByTestId("paste-case-workers").click();
const workers = page.locator(".bn-editor");
await workers.getByText("Web workers in ReactJs").waitFor({ timeout: 15000 });
check("DEV.to sample keeps the byline", (await workers.innerText()).includes("Suman Kumar"));
check("DEV.to sample keeps the title", (await workers.innerText()).includes("Web workers in ReactJs"));
check("attribution names Suman Kumar", (await page.getByTestId("paste-landing-credits").innerText()).includes("Suman Kumar"));

await page.getByTestId("paste-case-indexeddb").click();
const indexed = page.locator(".bn-editor");
await indexed.getByText("Learn IndexedDB").waitFor({ timeout: 15000 });
check("Medium snapshot notes the 403", (await page.getByTestId("paste-landing-credits").innerText()).includes("403"));
check("Medium snapshot keeps the byline", (await indexed.innerText()).includes("Suman Kumar"));
await page.screenshot({ path: `${SHOTS}/paste-landing.png`, fullPage: true });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} paste landing checks passed`);
process.exit(failed.length ? 1 : 0);
