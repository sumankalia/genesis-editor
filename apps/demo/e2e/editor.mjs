import { chromium } from "playwright-core";

import { BASE_URL, SHOTS, launchOptions } from "./config.mjs";

const URL = `${BASE_URL}/`;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".bn-editor");

const blockTypes = () =>
  page.$$eval(".bn-editor .bn-block-content", (els) => els.map((e) => e.dataset.contentType));
const currentType = async () => {
  await page.waitForTimeout(60);
  return page.evaluate(() => {
    const n = window.getSelection()?.anchorNode;
    const el = n instanceof Element ? n : n?.parentElement;
    return el?.closest(".bn-block-content")?.dataset.contentType ?? null;
  });
};

const initial = await blockTypes();
check("starter document renders as blocks", initial.length >= 8, initial.join(","));
for (const t of ["heading", "paragraph", "checkListItem", "divider", "quote", "codeBlock"]) {
  check(`starter has ${t} block`, initial.includes(t));
}
await page.screenshot({ path: `${SHOTS}/desktop-initial.png` });

// Go to the trailing empty paragraph.
const last = page.locator(".bn-editor .bn-block-content").last();
await last.click();
check("cursor in trailing paragraph", (await currentType()) === "paragraph");

// Slash menu: change an empty paragraph into a quote.
await page.keyboard.type("/");
const menu = page.locator(".bn-suggestion-menu");
await menu.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
check("slash menu opens on /", await menu.isVisible());
await page.screenshot({ path: `${SHOTS}/desktop-slash-menu.png` });
await page.keyboard.type("quote");
await page.keyboard.press("Enter");
check("slash menu turns empty block into quote", (await currentType()) === "quote");
await page.keyboard.type("Inserted from the slash menu");
await page.keyboard.press("Enter");
if ((await currentType()) !== "paragraph") await page.keyboard.press("Enter");

// Markdown shortcuts.
const exitToParagraph = async () => {
  for (let i = 0; i < 2 && (await currentType()) !== "paragraph"; i++) {
    await page.keyboard.press("Enter");
  }
};
const shortcuts = [
  ["# ", "heading", "Markdown heading"],
  ["- ", "bulletListItem", "Bullet one"],
  ["[] ", "checkListItem", "A to-do"],
  ["> ", "quote", "A quote"],
];
for (const [trigger, type, text] of shortcuts) {
  await currentType();
  await page.keyboard.type(trigger);
  const got = await currentType();
  check(`markdown "${trigger.trim()}" -> ${type}`, got === type, `got ${got}`);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  if (type === "bulletListItem") {
    await page.keyboard.type("Bullet two");
    await page.keyboard.press("Enter");
  }
  await exitToParagraph();
}
await page.keyboard.type("``` ");
check('markdown "```" -> codeBlock', (await currentType()) === "codeBlock", `got ${await currentType()}`);
await page.keyboard.type("let x = 1;");

// Nesting with Tab / Shift+Tab on "Bullet two".
const bulletTwo = page.locator(".bn-block-content", { hasText: "Bullet two" });
await bulletTwo.click();
await page.waitForTimeout(100);
await page.keyboard.press("End");
const depth = () =>
  bulletTwo.evaluate((el) => {
    let d = 0;
    let n = el.closest(".bn-block-outer");
    while ((n = n?.parentElement?.closest(".bn-block-outer"))) d++;
    return d;
  });
const d0 = await depth();
await page.keyboard.press("Tab");
await page.waitForTimeout(100);
const d1 = await depth();
check("Tab nests block under previous", d1 === d0 + 1, `${d0} -> ${d1}`);
await page.keyboard.press("Shift+Tab");
await page.waitForTimeout(100);
const d2 = await depth();
check("Shift+Tab un-nests block", d2 === d0, `${d1} -> ${d2}`);
await page.keyboard.press("Tab");

// Inline formatting via keyboard shortcuts.
const heading = page.locator(".bn-block-content", { hasText: "Markdown heading" });
const selectWord = async (loc, word) => {
  await loc.evaluate((el, w) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(w);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + w.length);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        return;
      }
    }
  }, word);
  await page.waitForTimeout(150);
};
await heading.click();
await selectWord(heading, "Markdown");
await page.keyboard.press("ControlOrMeta+b");
check("Cmd+B bolds selection", (await heading.locator("strong").count()) > 0);
await page.keyboard.press("ControlOrMeta+i");
check("Cmd+I italicizes selection", (await heading.locator("em").count()) > 0);
await selectWord(heading, "heading");
await page.keyboard.press("ControlOrMeta+e");
check("Cmd+E makes inline code", (await heading.locator("code").count()) > 0);

// Selection toolbar.
const quote = page.locator(".bn-block-content", { hasText: "A quote" });
await selectWord(quote, "quote");
await page.mouse.move(10, 10);
const toolbar = page.locator(".bn-formatting-toolbar");
await toolbar.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
check("selection toolbar appears", await toolbar.isVisible());
await page.screenshot({ path: `${SHOTS}/desktop-selection-toolbar.png` });
const boldBtn = toolbar.locator('[data-test="bold"], button[aria-label="Bold"]').first();
if (await boldBtn.count()) {
  await boldBtn.click();
  check("toolbar Bold button bolds selection", (await quote.locator("strong").count()) > 0);
} else {
  check("toolbar Bold button found", false);
}
const italicBtn = toolbar.locator('[data-test="italic"], button[aria-label="Italic"]').first();
if (await italicBtn.count()) {
  await italicBtn.click();
  check("toolbar Italic button italicizes", (await quote.locator("em").count()) > 0);
}
const codeBtn = toolbar.locator('[data-test="code"], button[aria-label="Code"]').first();
check("toolbar has inline code button", (await codeBtn.count()) > 0);
const linkBtn = toolbar.locator('[data-test="createLink"]').first();
check("toolbar has link button", (await linkBtn.count()) > 0);

// Link via Cmd+K.
const todo = page.locator(".bn-block-content", { hasText: "A to-do" });
await selectWord(todo, "to-do");
await page.keyboard.press("ControlOrMeta+k");
const dialog = page.getByRole("dialog");
await dialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
check("Cmd+K opens link dialog", await dialog.isVisible());
await page.screenshot({ path: `${SHOTS}/desktop-link-dialog.png` });
await page.keyboard.type("example.com");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
const href = await todo.locator("a").first().getAttribute("href").catch(() => null);
check("Cmd+K applies link", href === "https://example.com", `href=${href}`);

// Drag handle reorder: move "Markdown heading" above the first block.
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(100);
const firstBlock = page.locator(".bn-editor .bn-block-content").first();
const firstTextBefore = (await firstBlock.innerText()).trim();
await heading.hover();
const handle = page.locator('[data-test="dragHandle"]').first();
await handle.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
check("drag handle appears on hover", await handle.isVisible());
await page.screenshot({ path: `${SHOTS}/desktop-drag-handle.png` });
if (await handle.isVisible()) {
  const target = await firstBlock.boundingBox();
  await handle.dragTo(firstBlock, { targetPosition: { x: 40, y: 2 } });
  await page.waitForTimeout(300);
  const firstTextAfter = (await page.locator(".bn-editor .bn-block-content").first().innerText()).trim();
  check(
    "dragging handle reorders block",
    firstTextAfter.includes("Markdown") && firstTextAfter !== firstTextBefore,
    `first block: "${firstTextBefore}" -> "${firstTextAfter}" (target y=${target?.y})`,
  );
}

// Autosave + reload.
await page.waitForTimeout(800);
const status = await page.getByTestId("save-status").getAttribute("data-status");
check("save indicator shows saved", status === "saved", status);
const stored = await page.evaluate(() => localStorage.getItem("genesis:document:v1"));
check("document written to localStorage", !!stored && stored.includes("Inserted from the slash menu"));
const typesBeforeReload = await blockTypes();
await page.reload();
await page.waitForSelector(".bn-editor");
const typesAfterReload = await blockTypes();
check(
  "content survives reload",
  JSON.stringify(typesBeforeReload) === JSON.stringify(typesAfterReload) &&
    (await page.locator(".bn-block-content", { hasText: "Inserted from the slash menu" }).count()) === 1,
  `${typesAfterReload.length} blocks`,
);
await page.screenshot({ path: `${SHOTS}/desktop-after-reload.png`, fullPage: true });

// Dark mode.
await page.getByRole("button", { name: "Document actions" }).click();
await page.getByRole("menuitemradio", { name: "Dark" }).click();
await page.waitForTimeout(300);
const scheme = await page.locator(".bn-container").getAttribute("data-color-scheme");
check("dark theme applies to editor", scheme === "dark", scheme);
await page.screenshot({ path: `${SHOTS}/desktop-dark.png` });
await page.evaluate(() => localStorage.setItem("theme", "system"));

// Mobile.
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const m = await mobile.newPage();
m.on("pageerror", (e) => errors.push(e.message));
await m.goto(URL);
await m.waitForSelector(".bn-editor");
const nav = m.getByRole("navigation", { name: "Block actions" });
check("mobile block toolbar visible", await nav.isVisible());
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check("no horizontal overflow on mobile", !overflow);
await m.screenshot({ path: `${SHOTS}/mobile-initial.png` });
const mTask = m.locator(".bn-block-content", { hasText: "Press Tab to nest" });
await mTask.tap();
const mDepth = () =>
  mTask.evaluate((el) => {
    let d = 0;
    let n = el.closest(".bn-block-outer");
    while ((n = n?.parentElement?.closest(".bn-block-outer"))) d++;
    return d;
  });
const md0 = await mDepth();
await nav.getByRole("button", { name: "Outdent" }).tap();
const md1 = await mDepth();
check("mobile Outdent button un-nests", md1 === md0 - 1, `${md0} -> ${md1}`);
await nav.getByRole("button", { name: "Indent" }).tap();
check("mobile Indent button nests", (await mDepth()) === md0);
const lastM = m.locator(".bn-editor .bn-block-content").last();
await lastM.tap();
await nav.getByRole("button", { name: "Add block" }).tap();
const mMenu = m.locator(".bn-suggestion-menu");
await mMenu.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
check("mobile Add block opens block menu", await mMenu.isVisible());
await m.screenshot({ path: `${SHOTS}/mobile-block-menu.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
