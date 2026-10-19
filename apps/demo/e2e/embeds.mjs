import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const GENERIC = "allow-scripts allow-popups allow-popups-to-escape-sandbox";
const browser = await chromium.launch(launchOptions);
// Tall enough that element screenshots never scroll under the sticky site header.
const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Third-party frames log their own errors; only the app's count.
page.on("console", (m) => m.type() === "error" && m.location()?.url?.startsWith(BASE_URL) && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
const mod = process.platform === "darwin" ? "Meta" : "Control";

const response = await page.goto(`${BASE_URL}/docs/embeds`);
check("/docs/embeds renders", response?.status() === 200);
check("lists the 33 built-in providers", (await page.locator("[data-testid='embed-providers'] > span").count()) === 33);
const demo = page.locator("[data-example='embeds']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();

const frames = () => editor.locator(".genesis-embed iframe");
const frameInfo = () =>
  frames().evaluateAll((els) => els.map((el) => ({ src: el.getAttribute("src"), sandbox: el.getAttribute("sandbox"), allow: el.getAttribute("allow") })));
const lastBlock = () => editor.locator(".bn-block-outer").last();

// 1. Loaded HTML: provider iframes are rebuilt, the unknown one is a sandboxed generic embed.
await frames().first().waitFor({ timeout: 10000 });
const initial = await frameInfo();
check("loaded iframes become 3 embeds", initial.length === 3, `${initial.length}`);
check("YouTube is rebuilt on youtube-nocookie", initial[0]?.src === "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ");
check("Spotify track", initial[1]?.src === "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT");
check("generic embed is sandboxed without allow-same-origin", initial[2]?.sandbox === GENERIC && initial[2]?.allow === null);
check("caption bar shows the site and Open ↗", (await editor.locator(".genesis-embed-host").first().innerText()) === "YouTube" && (await editor.locator(".genesis-embed-open").count()) === 3);
check("default has no Load button", (await editor.locator("[data-testid='embed-load']").count()) === 0);
await page.waitForTimeout(2500);
await demo.screenshot({ path: `${SHOTS}/embeds-overview.png` });

// 2. A provider URL pasted on its own line becomes an embed; one undo gives the link back.
await demo.getByRole("button", { name: "Paste a YouTube link" }).click();
await page.waitForTimeout(400);
let info = await frameInfo();
check("pasted YouTube URL becomes an embed", info.length === 4 && info[3]?.src === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", `${info.length}`);
await lastBlock().scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
await lastBlock().screenshot({ path: `${SHOTS}/embeds-paste-url.png` });
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(300);
const undone = lastBlock().locator("a[href='https://www.youtube.com/watch?v=dQw4w9WgXcQ']");
check("one undo turns it back into the link", (await frames().count()) === 3 && (await undone.count()) === 1);
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(200);

// 3. Iframe code: provider rebuilt, pasted sandbox/allow ignored.
await demo.getByRole("button", { name: "Paste Vimeo iframe code" }).click();
await page.waitForTimeout(400);
info = await frameInfo();
const vimeo = info.find((f) => f.src?.startsWith("https://player.vimeo.com/"));
check("pasted Vimeo iframe becomes a provider embed", vimeo?.src === "https://player.vimeo.com/video/76979871?h=8272103f6e");
check("pasted sandbox and allow are ignored", Boolean(vimeo) && !vimeo.sandbox.includes("allow-top-navigation") && !vimeo.allow.includes("camera"));
await lastBlock().scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
await lastBlock().screenshot({ path: `${SHOTS}/embeds-iframe-code.png` });

await demo.getByRole("button", { name: "Paste an unknown iframe" }).click();
await page.waitForTimeout(400);
info = await frameInfo();
check("unknown iframe becomes a generic embed", info.some((f) => f.src === "https://example.org/" && f.sandbox === GENERIC));

// 4. A URL inside a sentence stays a link.
const before = await frames().count();
await demo.getByRole("button", { name: "Paste a link inside a sentence" }).click();
await page.waitForTimeout(400);
check("a URL in a sentence stays a link", (await frames().count()) === before && (await editor.locator("a[href='https://youtu.be/dQw4w9WgXcQ']").count()) === 1);

// 5. /embed: the input takes a link.
// Clicking past the end of the line puts the caret at its end.
const line = lastBlock().locator(".bn-inline-content");
const box = await line.boundingBox();
await line.click({ position: { x: box.width - 4, y: box.height / 2 } });
await page.keyboard.press("Enter");
await page.keyboard.type("/embed");
await page.waitForTimeout(300);
await page.keyboard.press("Enter");
const input = editor.locator(".genesis-embed-input").last();
await input.waitFor({ timeout: 5000 });
await page.waitForTimeout(150);
check("/embed focuses the link input", await input.evaluate((el) => el === document.activeElement));
await page.keyboard.type("not a link");
await page.keyboard.press("Enter");
check("an invalid entry shows an error", /can embed/.test(await editor.locator(".genesis-embed-error").last().innerText()));
await input.fill("");
await page.keyboard.type("https://x.com/jack/status/20");
check("typing clears the error", (await editor.locator(".genesis-embed-error").last().innerText()) === "");
await editor.locator(".genesis-embed--empty").last().screenshot({ path: `${SHOTS}/embeds-slash.png` });
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
info = await frameInfo();
check("/embed with a tweet URL", info.some((f) => f.src === "https://platform.twitter.com/embed/Tweet.html?id=20"));

// 6. Convert to link.
const count = await frames().count();
await editor.locator(".genesis-embed-to-link").last().click();
await page.waitForTimeout(300);
check("Convert to link replaces the embed with a link", (await frames().count()) === count - 1 && (await editor.locator("a[href='https://x.com/jack/status/20']").count()) === 1);

// 7. Export: iframes with our attributes, or link cards.
await demo.getByRole("button", { name: "Export HTML", exact: true }).click();
const exported = await demo.locator("[data-testid='embed-html']").innerText();
check("export writes data-genesis-embed figures", (exported.match(/data-genesis-embed/g) ?? []).length === count - 1, `${(exported.match(/data-genesis-embed/g) ?? []).length}`);
check("iframe-pasted embeds export their page URL", exported.includes('data-url="https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"'));
check("export never carries pasted attributes", !exported.includes("allow-top-navigation") && !exported.includes("camera"));
await demo.getByRole("button", { name: "Export for email (links)" }).click();
const links = await demo.locator("[data-testid='embed-html']").innerText();
check("link form has no iframes", !links.includes("<iframe") && links.includes('data-genesis-embed="link"'));

// 8. Allowlist: generic embeds are refused.
await demo.getByTestId("embed-policy").selectOption("allowlist");
await editor.waitFor();
await page.waitForTimeout(600);
info = await frameInfo();
check("allowlist shows providers only", info.length === 2 && !info.some((f) => f.sandbox === GENERIC), `${info.length}`);
await page.waitForTimeout(1500);
await demo.screenshot({ path: `${SHOTS}/embeds-allowlist.png` });

// 9. Dark theme and mobile.
await page.emulateMedia({ colorScheme: "dark" });
await page.evaluate(() => document.documentElement.classList.add("dark"));
await demo.getByTestId("embed-policy").selectOption("open");
await page.waitForTimeout(2500);
await demo.screenshot({ path: `${SHOTS}/embeds-dark.png` });
await page.evaluate(() => document.documentElement.classList.remove("dark"));
await page.emulateMedia({ colorScheme: "light" });

await demo.getByTestId("embed-click-to-load").check();
await editor.waitFor();
await page.waitForTimeout(600);
check("opt-in shows a Load button", (await editor.locator("[data-testid='embed-load']").count()) >= 1 && /Load .+ embed/.test(await editor.locator("[data-testid='embed-load']").first().innerText()));
check("opt-in keeps iframes out of the DOM", (await frames().count()) === 0);
await editor.locator("[data-testid='embed-load']").first().click();
await page.waitForTimeout(300);
check("opt-in Load click inserts the iframe", (await frames().count()) >= 1 && (await editor.locator("[data-testid='embed-load']").count()) === 2);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobile.goto(`${BASE_URL}/docs/embeds`);
const mobileDemo = mobile.locator("[data-example='embeds']");
await mobileDemo.locator(".genesis-embed iframe").first().waitFor({ timeout: 15000 });
await mobileDemo.scrollIntoViewIfNeeded();
await Promise.all(mobile.frames().filter((f) => f !== mobile.mainFrame()).map((f) => f.waitForLoadState("load", { timeout: 15000 }).catch(() => {})));
const barsFit = await mobileDemo.locator(".genesis-embed-bar").evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth + 1));
check("caption bars fit on mobile", barsFit);
const fits = await mobileDemo.locator(".genesis-embed").evaluateAll((els) => els.every((el) => el.getBoundingClientRect().right <= window.innerWidth + 1));
check("embeds fit a 390px screen", fits);
// Chromium doesn't paint cross-origin frames in isMobile screenshots, so the picture comes from a touch viewport.
const shot = await browser.newPage({ viewport: { width: 390, height: 1400 }, hasTouch: true });
await shot.goto(`${BASE_URL}/docs/embeds`);
const shotDemo = shot.locator("[data-example='embeds']");
await shotDemo.locator(".genesis-embed iframe").first().waitFor({ timeout: 15000 });
await shotDemo.scrollIntoViewIfNeeded();
await Promise.all(shot.frames().filter((f) => f !== shot.mainFrame()).map((f) => f.waitForLoadState("load", { timeout: 15000 }).catch(() => {})));
await shot.waitForTimeout(2500);
await shotDemo.screenshot({ path: `${SHOTS}/embeds-mobile.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} embed checks passed`);
process.exit(failed.length ? 1 : 0);
