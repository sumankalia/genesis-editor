import { readFileSync } from "node:fs";

import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

// The example serves its "remote" images from 127.0.0.1 when the page is on localhost.
const PAGE_ORIGIN = new URL(BASE_URL).origin;
const REMOTE_ORIGIN = PAGE_ORIGIN.replace("//localhost", "//127.0.0.1");
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// The failure scenario makes the mock server answer 500 on purpose.
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
const copies = [];
page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/mock-upload-from-url") && copies.push(r.url()));
const PNG = readFileSync(new URL("../public/examples/lake.png", import.meta.url)).toString("base64");
const mod = process.platform === "darwin" ? "Meta" : "Control";

const response = await page.goto(`${BASE_URL}/docs/image-uploads`);
check("/docs/image-uploads renders", response?.status() === 200);
const demo = page.locator("[data-example='image-rehost']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
check("docs explain uploadFromUrl and SSRF", (await page.locator("article").innerText()).includes("must block SSRF"));

const images = () => editor.locator("img.bn-visual-media");
const srcs = () => images().evaluateAll((els) => els.map((el) => el.getAttribute("src")));
const badges = () => editor.locator("[data-testid='rehost-badge']:not([hidden])");

// 1. Paste: blocks appear at once with the remote images, and badges show progress.
await demo.getByRole("button", { name: "Paste an article with remote images" }).click();
await page.waitForTimeout(250);
const pasted = await srcs();
check("pasted images appear immediately", pasted.length === 3 && pasted.every((s) => s.startsWith("http://127.0.0.1")), pasted.join(", "));
check("each image shows a re-upload badge", (await badges().count()) === 3);
check("badges say what's happening", /Re-uploading|Waiting to re-upload/.test(await badges().first().innerText()));
check("pendingUploads counts the copies", /^\d+ uploading$/.test(await demo.getByTestId("rehost-pending").innerText()));
await page.mouse.click(5, 5);
await page.waitForTimeout(400);
await editor.locator("img.bn-visual-media").first().scrollIntoViewIfNeeded();
await demo.screenshot({ path: `${SHOTS}/uploads-rehost-progress.png` });

// 2. Save waits for the uploads, and the HTML has the copies.
await demo.getByRole("button", { name: "Save when uploads finish" }).click();
const saved = demo.getByTestId("rehost-saved");
await saved.filter({ hasText: "<img" }).waitFor({ timeout: 15000 });
const html = await saved.innerText();
check("uploadsSettled() waits for every copy", !html.includes(' src="http://127.0.0.1') && (html.match(new RegExp(`src="${escape(PAGE_ORIGIN)}/api/mock-upload/`, "g")) ?? []).length === 3, html.slice(0, 400));
check("export keeps the source as data-original-src", html.includes(`data-original-src="${REMOTE_ORIGIN}/examples/dunes.png"`));
check("the same image is copied once", copies.length === 2, `${copies.length} requests`);
const done = await srcs();
check("blocks show the copies", done.every((s) => s.includes("/api/mock-upload/")), done.join(", "));
check("badges are gone", (await badges().count()) === 0);
const loaded = await page
  .waitForFunction(() => [...document.querySelectorAll("[data-example='image-rehost'] .bn-editor img.bn-visual-media")].every((el) => el.complete && el.naturalWidth > 0), null, { timeout: 5000 })
  .then(() => true, () => false);
check("copied images load", loaded);
// The counter is polled every 150 ms, so give it a moment to catch up.
const idle = await demo.getByTestId("rehost-pending").filter({ hasText: "Nothing uploading" }).waitFor({ timeout: 2000 }).then(() => true, () => false);
check("pendingUploads is back to zero", idle);

check("copies are marked hosted", (html.match(/data-genesis-hosted/g) ?? []).length === 3);

// 3. Undo removes the paste in one step; the swap itself was never an undo step.
await editor.locator("h3").click();
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(300);
check("one undo removes the whole paste", (await images().count()) === 0 && (await editor.locator("h3").count()) === 0);
await page.keyboard.press(`${mod}+Shift+z`);
await page.waitForTimeout(300);
await page.mouse.click(5, 5);
await saved.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);

// Screenshot of the finished state, from a fresh paste.
await page.reload();
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
await demo.getByRole("button", { name: "Paste an article with remote images" }).click();
await demo.getByRole("button", { name: "Save when uploads finish" }).click();
await saved.filter({ hasText: "<img" }).waitFor({ timeout: 15000 });
await page.mouse.click(5, 5);
await page.waitForTimeout(400);
await demo.screenshot({ path: `${SHOTS}/uploads-rehost-done.png` });

// 4. Failure: one automatic retry, then "Not re-uploaded · Retry", and the original image stays.
await page.reload();
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
copies.length = 0;
await demo.getByTestId("rehost-fail").check();
await demo.getByRole("button", { name: "Paste an article with remote images" }).click();
const failedBadges = editor.locator("[data-testid='rehost-badge'][data-state='failed']");
await failedBadges.nth(2).waitFor({ timeout: 15000 }).catch(() => {});
const failedText = await failedBadges.first().innerText().catch(() => "");
check("failed copies show Not re-uploaded · Retry", (await failedBadges.count()) === 3 && /Not re-uploaded\s*·\s*Retry/.test(failedText), `${await failedBadges.count()}: ${failedText}`);
check("5xx is retried once per image", copies.length === 4, `${copies.length} requests`);
const kept = await srcs();
check("failed images keep their original URL", kept.every((s) => s.startsWith("http://127.0.0.1")));
await editor.locator("img.bn-visual-media").first().scrollIntoViewIfNeeded();
await page.mouse.click(5, 5);
await page.waitForTimeout(400);
await demo.screenshot({ path: `${SHOTS}/uploads-rehost-failed.png` });

await demo.getByTestId("rehost-fail").uncheck();
await failedBadges.first().getByTestId("rehost-retry").click();
await page.waitForFunction(() => {
  const img = document.querySelector("[data-example='image-rehost'] .bn-editor img.bn-visual-media");
  return img?.getAttribute("src")?.includes("/api/mock-upload/");
}, null, { timeout: 15000 }).catch(() => {});
const retried = await srcs();
check("Retry copies the image", retried[0].includes("/api/mock-upload/") && (await failedBadges.count()) === 2, retried[0]);

await page.reload();
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
// A direct upload is marked hosted too, so a later load never copies it.
await editor.locator(".bn-block-content").last().click();
await page.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "direct.png", { type: "image/png" }));
  document.querySelector("[data-example='image-rehost'] .bn-editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, PNG);
await page.waitForFunction(() => document.querySelectorAll("[data-example='image-rehost'] .bn-editor img.bn-visual-media").length === 1, null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(300);
await demo.getByRole("button", { name: "Save when uploads finish" }).click();
await saved.filter({ hasText: "<img" }).waitFor({ timeout: 10000 }).catch(() => {});
const withUpload = await saved.innerText();
check("direct uploads are marked hosted", (withUpload.match(/data-genesis-hosted/g) ?? []).length === 1, `${(withUpload.match(/data-genesis-hosted/g) ?? []).length} hosted`);

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} re-host checks passed`);
process.exit(failed.length ? 1 : 0);
