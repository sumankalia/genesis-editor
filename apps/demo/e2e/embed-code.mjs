import { chromium } from "playwright-core";

import { placeCaret } from "./caret.mjs";
import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const WIDGET = "allow-scripts allow-popups allow-popups-to-escape-sandbox";
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && m.location()?.url?.startsWith(BASE_URL) && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

const response = await page.goto(`${BASE_URL}/docs/embeds`);
check("/docs/embeds renders", response?.status() === 200);
check("documents the approach for 14 sites", (await page.locator("[data-testid='embed-code-approaches'] tbody tr").count()) === 14);
const demo = page.locator("[data-example='embed-code']");
const editor = demo.locator(".bn-editor");
await editor.waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
const frames = () => editor.locator(".genesis-embed iframe");
const frameInfo = () =>
  frames().evaluateAll((els) => els.map((el) => ({ src: el.getAttribute("src"), srcdoc: el.hasAttribute("srcdoc"), sandbox: el.getAttribute("sandbox") })));

// 1. `value` HTML with three sites' embed code, scripts included.
await frames().nth(2).waitFor({ timeout: 10000 });
let info = await frameInfo();
check("loaded embed code becomes 3 embeds", info.length === 3, `${info.length}`);
check("default has no Load button", (await editor.locator("[data-testid='embed-load']").count()) === 0);
check("X post in our own frame", info[0]?.src === "https://platform.twitter.com/embed/Tweet.html?id=20");
check("Bluesky post in our own frame", info[1]?.src === "https://embed.bsky.app/embed/did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3my43eyfzs225");
check("Threads post in our own frame", info[2]?.src === "https://www.threads.net/@_edent_/post/C-3dQXkOq6Q/embed/");
check("each keeps its text as a fallback", (await editor.locator(".genesis-embed-fallback").count()) === 3);
check(
  "the tweet's fallback reads like the post",
  (await editor.locator(".genesis-embed-fallback").first().innerText()).startsWith("just setting up my twttr\n"),
);
const pastedScripts = await page.evaluate(
  () => document.querySelectorAll('script[src*="widgets.js"], script[src*="embed.bsky.app"], script[src*="threads.net"], script[src*="gist.github.com"]').length,
);
check("no pasted script is in the page", pastedScripts === 0, `${pastedScripts}`);

// 2. Pastes: HTML, raw code as text, and a script-only snippet.
await demo.getByRole("button", { name: "Paste Imgur code (HTML)" }).click();
await page.waitForTimeout(400);
info = await frameInfo();
check("Imgur code pasted as HTML", info.some((f) => f.src === "https://imgur.com/pva2rXL/embed?pub=true"));
await demo.getByRole("button", { name: "Paste Mastodon code as text" }).click();
await page.waitForTimeout(400);
info = await frameInfo();
check("Mastodon code pasted as text (raw code)", info.some((f) => f.src === "https://mastodon.social/@Gargron/117457641525342383/embed"));
await demo.getByRole("button", { name: "Paste a Gist script" }).click();
await page.waitForTimeout(400);
info = await frameInfo();
const widget = info.find((f) => f.srcdoc);
check("Gist script becomes a widget frame", Boolean(widget) && widget.src === null && widget.sandbox === WIDGET, JSON.stringify(widget));
const gistFrame = page.frames().find((f) => f.url() === "about:srcdoc");
let gistOrigin = "";
let gistRendered = false;
if (gistFrame) {
  gistOrigin = await gistFrame.evaluate(() => window.origin).catch((e) => String(e));
  gistRendered = await gistFrame.waitForSelector(".gist", { timeout: 15000 }).then(() => true, () => false);
}
check("the widget runs with an opaque (null) origin", gistOrigin === "null", gistOrigin);
check("the official Gist script renders inside it", gistRendered);
const gistBox = editor.locator(".genesis-embed-frame--widget").last();
await gistBox.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
const gistHeight = await gistBox.evaluate((el) => el.getBoundingClientRect().height);
check("the widget frame follows its reported height", gistHeight !== 400 && gistHeight >= 80 && gistHeight <= 640, `${gistHeight}px`);
check("still no pasted script in the page", (await page.evaluate(() => document.querySelectorAll('script[src*="gist.github.com"], script[src*="mastodon.social"], script[src*="imgur.com"]').length)) === 0);

// 3. Export: embed code back as embed code; with scripts; iframes; email.
const exportAs = async (label) => {
  await demo.getByRole("button", { name: label, exact: true }).click();
  return demo.locator("[data-testid='embed-code-html']").innerText();
};
const auto = await exportAs("Export HTML");
check("export writes the canonical snippets", (auto.match(/data-genesis-embed="snippet"/g) ?? []).length === 6, `${(auto.match(/data-genesis-embed="snippet"/g) ?? []).length}`);
check("the tweet exports as its blockquote", auto.includes('<blockquote class="twitter-tweet"><p>just setting up my twttr</p>'));
check("export carries no script by default", !auto.includes("<script"));
const scripted = await exportAs("Export with scripts");
check("embedScripts adds each official script once", (scripted.match(/platform\.twitter\.com\/widgets\.js/g) ?? []).length === 1 && scripted.includes("https://embed.bsky.app/static/embed.js"));
const iframes = await exportAs("Export as iframes");
check("iframe export keeps the text in data-fallback", iframes.includes("<iframe") && iframes.includes('data-fallback="just setting up my twttr'));
const email = await exportAs("Export for email");
check("email export: text as a quote, then the link", !email.includes("<iframe") && email.includes("<blockquote><p>just setting up my twttr</p>"));

// 4. Round trip: pasting the export gives the same embeds again.
const before = await frames().count();
await placeCaret(editor.locator(".bn-block-outer").first().locator(".bn-inline-content"));
await page.evaluate((html) => {
  const transfer = new DataTransfer();
  transfer.setData("text/html", html);
  transfer.setData("text/plain", "");
  document.querySelector("[data-example='embed-code'] .bn-editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
}, auto);
await page.waitForTimeout(600);
check("pasting the export gives the same embeds again", (await frames().count()) === before * 2, `${await frames().count()}`);

// 5. The fallback reads while a frame hasn't loaded (here: X's frame never answers).
const slow = await context.newPage();
await slow.route("https://platform.twitter.com/**", () => {});
await slow.goto(`${BASE_URL}/docs/embeds`);
const slowDemo = slow.locator("[data-example='embed-code']");
await slowDemo.locator(".genesis-embed iframe").first().waitFor({ timeout: 15000 });
await slowDemo.scrollIntoViewIfNeeded();
await slow.waitForTimeout(1500);
const tweetBox = slowDemo.locator(".genesis-embed-frame").first();
const fallbackShown = await tweetBox.evaluate((box) => {
  const quote = box.querySelector(".genesis-embed-fallback");
  const frame = box.querySelector("iframe");
  return !box.classList.contains("genesis-embed-frame--loaded") && getComputedStyle(frame).opacity === "0" && quote.getBoundingClientRect().height > 40;
});
check("the text shows until the frame loads", fallbackShown);
await tweetBox.locator("xpath=..").screenshot({ path: `${SHOTS}/embeds-blockquote-fallback.png` });
await slow.close();

// Screenshot: the three posts as loaded, from a fresh page.
await page.goto(`${BASE_URL}/docs/embeds`);
await demo.locator(".genesis-embed iframe").nth(2).waitFor({ timeout: 15000 });
await demo.scrollIntoViewIfNeeded();
await Promise.all(page.frames().filter((f) => f !== page.mainFrame()).map((f) => f.waitForLoadState("load", { timeout: 15000 }).catch(() => {})));
await page.waitForTimeout(3500);
await demo.screenshot({ path: `${SHOTS}/embeds-blockquote.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} embed code checks passed`);
process.exit(failed.length ? 1 : 0);
