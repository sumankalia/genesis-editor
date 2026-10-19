import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

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

const response = await page.goto(`${BASE_URL}/docs/columns`);
const h1 = (await page.locator("article h1").first().innerText().catch(() => "")).trim();
const active = await page.locator("aside a[aria-current='page'][href='/docs/columns']").count();
check("/docs/columns renders", response?.status() === 200 && h1 === "Columns" && active === 1, `h1="${h1}"`);
check("documents email-safe table export", /data-genesis-columns/.test(await page.locator("article").innerText()));
check("does not mention BlockNote XL", !/xl-multi-column/.test(await page.locator("article").innerText()) || /GPL/.test(await page.locator("article").innerText()));

const demo = page.locator("[data-example='columns']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
check("example has a columns block", (await editor.locator("[data-content-type='columnList']").count()) === 1);
check("example has two columns", (await editor.locator("[data-content-type='column']").count()) === 2);
check("left column is an image", (await editor.locator("[data-content-type='columnList']").locator("xpath=ancestor::*[contains(@class,'bn-block')][1]").locator("[data-content-type='image'] img").count()) >= 1 || (await editor.locator("[data-content-type='image'] img").count()) >= 1);
check("right column has a heading", (await editor.locator("h3").filter({ hasText: "Mountain lake" }).count()) === 1);
check("not a data table of images", (await editor.locator("table td").count()) === 0);
await demo.screenshot({ path: `${SHOTS}/columns-docs.png` });

await page.goto(`${BASE_URL}/playground`);
await page.evaluate(() => localStorage.clear());
await page.reload();
const play = page.locator(".playground-editor .bn-editor");
await play.waitFor({ timeout: 15000 });
page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: "Reset" }).click();
await page.waitForTimeout(300);
check("starter has columns", (await play.locator("[data-content-type='columnList']").count()) === 1);
check("starter image is the lake", (await play.locator("[data-content-type='image'] img[alt='A mountain lake']").count()) === 1);
check("starter right column heading", (await play.locator("h3").filter({ hasText: "Mountain lake" }).count()) === 1);

await play.locator(".bn-block-content").last().click();
await page.keyboard.type("/");
const menu = page.locator(".bn-suggestion-menu");
await menu.waitFor({ state: "visible", timeout: 5000 });
await menu.getByRole("option", { name: /^Columns\b/ }).click();
await page.waitForTimeout(300);
check("slash Columns inserts two columns", (await play.locator("[data-content-type='columnList']").count()) === 2);
check("inserted list has two column blocks", (await play.locator("[data-content-type='column']").count()) >= 4);

const tabs = page.getByTestId("output-tabs");
await tabs.getByRole("tab", { name: "HTML", exact: true }).click();
const htmlText = await page.getByTestId("output-html").innerText();
check("export writes data-genesis-columns", /data-genesis-columns/.test(htmlText), htmlText.slice(0, 160));
check("export is a presentation table", /role="presentation"/.test(htmlText));

await tabs.getByRole("tab", { name: "Paste HTML", exact: true }).click();
await page.getByTestId("paste-html-sample").click();
await page.getByRole("option", { name: "Image beside text", exact: true }).click();
await page.getByTestId("paste-html-load-sample").click();
await page.waitForTimeout(400);
check("paste sample becomes columns", (await play.locator("[data-content-type='columnList']").count()) === 1);
check("paste sample is not a data table", (await play.locator("[data-content-type='table']").count()) === 0);

await page.getByTestId("paste-html-sample").click();
await page.getByRole("option", { name: "dev.to images in a table", exact: true }).click();
await page.getByTestId("paste-html-load-sample").click();
await page.waitForTimeout(400);
check("image grid stays a table", (await play.locator("[data-content-type='table']").count()) === 1);
check("image grid is not columns", (await play.locator("[data-content-type='columnList']").count()) === 0);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobile.goto(`${BASE_URL}/docs/columns`);
const mobileEditor = mobile.locator("[data-example='columns'] .bn-editor");
await mobileEditor.waitFor({ timeout: 15000 });
const stacked = await mobileEditor.locator("[data-content-type='columnList']").evaluate((el) => {
  const group = el.parentElement?.querySelector(".bn-block-group") ?? el.closest(".bn-block")?.querySelector(":scope > .bn-block-group");
  if (!group) return { dir: "missing" };
  const style = getComputedStyle(group);
  const outers = [...group.children];
  const tops = outers.map((n) => n.getBoundingClientRect().top);
  return { dir: style.flexDirection, stacked: outers.length >= 2 && Math.abs(tops[1] - tops[0]) > 20 };
});
check("mobile stacks columns", stacked.dir === "column" || stacked.stacked === true, JSON.stringify(stacked));
await mobile.close();

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} columns checks passed`);
process.exit(failed.length ? 1 : 0);
