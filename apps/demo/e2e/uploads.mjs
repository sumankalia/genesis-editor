import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, fixture, launchOptions } from "./config.mjs";

const BASE = BASE_URL;
const PLAYGROUND = `${BASE_URL}/playground`;
const RED = fixture("red.png");
const BLUE = fixture("blue.png");
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

const fresh = async (settings) => {
  await page.goto(PLAYGROUND);
  await page.evaluate((s) => {
    localStorage.clear();
    if (s) localStorage.setItem("genesis:upload-settings:v1", JSON.stringify(s));
  }, settings ?? null);
  await page.reload();
  await page.waitForSelector(".bn-editor");
};

const panel = page.locator(".bn-panel");
const images = () => page.locator(".bn-editor [data-content-type='image'] img");

const insertImageBlock = async () => {
  await page.locator(".bn-editor .bn-block-content").last().click();
  await page.waitForTimeout(100);
  await page.keyboard.type("/image");
  await page.locator(".bn-suggestion-menu-item", { hasText: "Image" }).first().waitFor();
  await page.keyboard.press("Enter");
  await panel.waitFor({ state: "visible", timeout: 3000 });
};

const options = page.getByTestId("options-panel");
const setSettings = async ({ mode, url, path }) => {
  await options.getByLabel({ local: "This browser", server: "Upload server", custom: "Custom function" }[mode], { exact: false }).first().click();
  if (mode === "server") {
    await options.getByLabel("Upload URL").fill(url);
    await options.getByLabel(/Response field/).fill(path ?? "");
  }
};

// 1. Local fallback via file picker.
await fresh();
await insertImageBlock();
const uploadTab = page.getByTestId("upload-tab");
check("image block opens panel with Upload tab", await uploadTab.isVisible());
const localNote = await uploadTab.getByText("No upload server configured").isVisible();
check("local mode is called out in the panel", localNote);
await page.screenshot({ path: `${SHOTS}/upload-panel-local.png` });
await page.getByTestId("upload-input").setInputFiles(RED);
await images().first().waitFor({ timeout: 5000 });
const localSrc = await images().first().getAttribute("src");
check("local upload produces data URL image", localSrc?.startsWith("data:image/png"), localSrc?.slice(0, 30));
await page.waitForTimeout(700);
await page.reload();
await page.waitForSelector(".bn-editor");
check("local image survives reload", (await images().count()) === 1);

// 2. By URL (Link tab) still works.
const hosted = await (await fetch(`${BASE}/api/mock-upload`, {
  method: "POST",
  body: (() => { const f = new FormData(); f.append("file", new Blob([readFileSync(BLUE)], { type: "image/png" }), "blue.png"); return f; })(),
})).json();
await insertImageBlock();
await panel.getByRole("tab", { name: "Link" }).click();
await page.locator("[data-test='embed-input']").fill(`${BASE}${hosted.url}`);
await panel.getByRole("button", { name: /Embed/ }).click();
await page.waitForTimeout(300);
check("image by URL still works", (await images().count()) === 2 && (await images().nth(1).getAttribute("src")) === `${BASE}${hosted.url}`);

// 3. Server mode with uploading state.
await setSettings({ mode: "server", url: "/api/mock-upload?delay=1500" });
await insertImageBlock();
check("server mode hides local notice", !(await page.getByText("No upload server configured").isVisible()));
await page.getByTestId("upload-input").setInputFiles(BLUE);
await page.waitForTimeout(300);
const uploadingPanel = await page.getByTestId("upload-tab").getByRole("status").isVisible().catch(() => false);
const uploadingBlock = await page.locator(".bn-file-loading-preview").isVisible();
check("uploading state shown", uploadingPanel || uploadingBlock, `panel=${uploadingPanel} block=${uploadingBlock}`);
await page.screenshot({ path: `${SHOTS}/upload-uploading.png` });
await page.waitForFunction(() => document.querySelectorAll(".bn-editor [data-content-type='image'] img").length === 3, null, { timeout: 8000 });
const serverSrc = await images().nth(2).getAttribute("src");
check("server upload sets hosted URL", (serverSrc ?? "").startsWith(`${BASE}/api/mock-upload/`), serverSrc);
const loaded = await images().nth(2).evaluate((img) => img.complete && img.naturalWidth > 0 ? true : new Promise((r) => { img.onload = () => r(img.naturalWidth > 0); img.onerror = () => r(false); setTimeout(() => r(false), 4000); }));
check("uploaded image actually loads", loaded);
await page.waitForTimeout(300);
check("panel closes after successful upload", !(await panel.isVisible()));

// 4. Failure, then retry.
await setSettings({ mode: "server", url: "/api/mock-upload?fail=1" });
await insertImageBlock();
await page.getByTestId("upload-input").setInputFiles(RED);
const alert = page.getByTestId("upload-tab").getByRole("alert");
await alert.waitFor({ timeout: 5000 }).catch(() => {});
check("error state shown in panel", await alert.isVisible(), await alert.innerText().catch(() => ""));
check("error toast with Retry shown", await page.locator("[data-sonner-toast]").getByRole("button", { name: "Retry" }).isVisible());
await page.screenshot({ path: `${SHOTS}/upload-error-retry.png` });
await setSettings({ mode: "server", url: "/api/mock-upload" });
const failedBlock = page.locator(".bn-editor [data-content-type='image'] .bn-add-file-button").last();
await failedBlock.click();
await alert.waitFor({ timeout: 3000 });
check("error persists when panel reopened", await alert.isVisible());
await alert.getByRole("button", { name: /Retry/ }).click();
await page.waitForFunction(() => document.querySelectorAll(".bn-editor [data-content-type='image'] img").length === 4, null, { timeout: 8000 }).catch(() => {});
check("retry uploads the same file", (await images().count()) === 4);

// 5. Response mapper.
await setSettings({ mode: "server", url: "/api/mock-upload?shape=nested", path: "data.link" });
await insertImageBlock();
await page.getByTestId("upload-input").setInputFiles(BLUE);
await page.waitForFunction(() => document.querySelectorAll(".bn-editor [data-content-type='image'] img").length === 5, null, { timeout: 8000 }).catch(() => {});
check("response mapper reads data.link", (await images().count()) === 5 && /\/api\/mock-upload\//.test((await images().nth(4).getAttribute("src")) ?? ""));

// 6. Custom uploadFile.
await setSettings({ mode: "custom" });
await insertImageBlock();
await page.getByTestId("upload-input").setInputFiles(RED);
await page.waitForFunction(() => document.querySelectorAll(".bn-editor [data-content-type='image'] img").length === 6, null, { timeout: 8000 }).catch(() => {});
check("custom uploadFile result is used", (await images().count()) === 6 && /\/api\/mock-upload\//.test((await images().nth(5).getAttribute("src")) ?? ""));

// 7. Paste and drop (server mode).
await setSettings({ mode: "server", url: "/api/mock-upload" });
const pngBase64 = readFileSync(BLUE).toString("base64");
await page.locator(".bn-editor .bn-block-content").last().click();
await page.waitForTimeout(100);
await page.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
  document.querySelector(".bn-editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, pngBase64);
await page.waitForFunction(() => document.querySelectorAll(".bn-editor [data-content-type='image'] img").length === 7, null, { timeout: 8000 }).catch(() => {});
check("pasting an image uploads it", (await images().count()) === 7);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
const box = await page.locator(".bn-editor .bn-block-content").nth(1).boundingBox();
await page.evaluate(({ b64, x, y }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
  const target = document.elementFromPoint(x, y);
  for (const type of ["dragenter", "dragover", "drop"]) {
    target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }
}, { b64: pngBase64, x: box.x + 40, y: box.y + box.height / 2 });
await page.waitForFunction(() => document.querySelectorAll(".bn-editor [data-content-type='image'] img").length === 8, null, { timeout: 8000 }).catch(() => {});
check("dropping an image uploads it", (await images().count()) === 8);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${SHOTS}/upload-images-in-document.png`, fullPage: true });

// 8. Uploaded images behave like URL images: same props shape, persisted.
await page.waitForTimeout(700);
const doc = await page.evaluate(() => JSON.parse(localStorage.getItem("genesis:document:v1")).blocks);
const imageBlocks = doc.filter((b) => b.type === "image");
check("all 8 image blocks saved with URLs", imageBlocks.length === 8 && imageBlocks.every((b) => typeof b.props.url === "string" && b.props.url.length > 0));

// 9. Failed paste recovers to an empty block with error + retry.
await setSettings({ mode: "server", url: "/api/mock-upload?fail=1" });
await page.locator(".bn-editor .bn-block-content").last().click();
await page.waitForTimeout(100);
await page.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "pasted-fail.png", { type: "image/png" }));
  document.querySelector(".bn-editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, pngBase64);
await page.getByTestId("upload-tab").getByRole("alert").waitFor({ timeout: 5000 }).catch(() => {});
check("failed paste opens panel with error", await page.getByTestId("upload-tab").getByRole("alert").isVisible());
const stuck = await page.locator(".bn-editor .bn-file-loading-preview").count();
check("failed paste block is not stuck uploading", stuck === 0 && (await page.locator(".bn-editor .bn-add-file-button").count()) === 1, `loading=${stuck}`);
await page.keyboard.press("Escape");

// Upload options screenshot.
await setSettings({ mode: "server", url: "/api/mock-upload", path: "" });
await options.screenshot({ path: `${SHOTS}/upload-settings.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} upload checks passed`);
process.exit(failed.length ? 1 : 0);
