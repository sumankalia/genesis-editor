import { chromium } from "playwright-core";

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
const FLOATING_TOOLBAR = ".bn-formatting-toolbar:not(.genesis-fixed-toolbar *)";
const editorIn = (root) => root.locator(".bn-editor").first();

/** Clears the editor and leaves the caret in an empty first paragraph. */
async function emptyEditor(root) {
  const editor = editorIn(root);
  await editor.click();
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press("Backspace");
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press("Backspace");
}

async function slashTitles(root, query = "") {
  await emptyEditor(root);
  await page.keyboard.type(`/${query}`);
  const menu = page.locator(".bn-suggestion-menu");
  await menu.waitFor({ timeout: 5000 });
  await page.waitForTimeout(150);
  const titles = await menu.locator(".bn-suggestion-menu-item").allInnerTexts();
  await page.keyboard.press("Escape");
  return titles.map((t) => t.split("\n")[0].trim());
}

async function blockTypes(root) {
  return root.locator(".bn-block-content").evaluateAll((els) => els.map((el) => el.getAttribute("data-content-type")));
}

/** Selects the text of the first block so the floating toolbar opens. */
async function toolbarLabels(root) {
  await emptyEditor(root);
  await page.keyboard.type("Select me");
  await page.keyboard.down("Shift");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  const bar = page.locator(FLOATING_TOOLBAR).first();
  await bar.waitFor({ timeout: 5000 });
  await page.waitForTimeout(150);
  return bar.locator("button").evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") || el.getAttribute("data-test") || el.textContent?.trim() || ""),
  );
}

async function pasteHTML(root, html) {
  await emptyEditor(root);
  await editorIn(root).evaluate((el, html) => {
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", html.replace(/<[^>]+>/g, ""));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, html);
  await page.waitForTimeout(200);
}

await page.goto(`${BASE_URL}/docs/tools`);
await page.evaluate(() => localStorage.clear());
await page.reload();
const h1 = (await page.locator("article h1").first().innerText()).trim();
check("/docs/tools renders", h1 === "Tools & plugins", h1);
check("sidebar links the tools page", (await page.locator("aside a[aria-current='page'][href='/docs/tools']").count()) === 1);
const toolNames = await page.getByTestId("tool-names").innerText();
check("built-in tool table lists block and inline tools", ["heading", "image", "bold", "link", "color"].every((t) => toolNames.includes(t)));

// Headings (levels 1–2) and image only.
const basic = page.locator("[data-example='tools-basic']");
await editorIn(basic).waitFor({ timeout: 10000 });
const basicSlash = await slashTitles(basic);
check("reduced slash menu has Heading 1 and 2", basicSlash.includes("Heading 1") && basicSlash.includes("Heading 2"), basicSlash.join(","));
check("reduced slash menu hides Heading 3", !basicSlash.includes("Heading 3"));
check("reduced slash menu hides lists and quote", !basicSlash.some((t) => /Bullet|Numbered|Check|Quote|Table|Code/.test(t)));
check("reduced slash menu keeps image", basicSlash.includes("Image"));
await emptyEditor(basic);
await page.keyboard.type("- item");
check("'- ' does not make a list when lists are off", !(await blockTypes(basic)).includes("bulletListItem"), (await blockTypes(basic)).join(","));
await emptyEditor(basic);
await page.keyboard.type("### three");
const h3Types = await blockTypes(basic);
const h3Level = await basic.locator("[data-content-type='heading']").first().getAttribute("data-level").catch(() => null);
check("'### ' does not make a level-3 heading", !(h3Types.includes("heading") && h3Level === "3"), `${h3Types.join(",")} level=${h3Level}`);
await emptyEditor(basic);
await page.keyboard.type("## two");
check("'## ' makes a level-2 heading", (await basic.locator("[data-content-type='heading'][data-level='2']").count()) === 1);
await pasteHTML(basic, "<h3>Pasted h3</h3><blockquote>Quoted</blockquote><ul><li>Listed</li></ul>");
const pasted = await blockTypes(basic);
check("pasted quote and list degrade to paragraphs", !pasted.some((t) => ["quote", "bulletListItem"].includes(t)), pasted.join(","));
check("pasted text is kept", (await editorIn(basic).innerText()).includes("Quoted") && (await editorIn(basic).innerText()).includes("Listed"));
await emptyEditor(basic);
await page.keyboard.type("Heading");
await page.keyboard.press(`${mod}+a`);
const typeSelect = page.locator(FLOATING_TOOLBAR).first();
await typeSelect.waitFor({ timeout: 5000 });
await typeSelect.locator("button").first().click();
await page.locator("[role='listbox'] [role='option']").first().waitFor({ timeout: 5000 });
const typeOptions = await page.locator("[role='listbox'] [role='option']").allInnerTexts();
check("block type select lists only allowed headings", typeOptions.some((t) => t.includes("Heading 2")) && !typeOptions.some((t) => t.includes("Heading 3")), typeOptions.join(","));
await page.keyboard.press("Escape");

// Minimal toolbar: bold, italic, link only.
const minimal = page.locator("[data-example='tools-minimal-toolbar']");
await minimal.scrollIntoViewIfNeeded();
const minimalLabels = await toolbarLabels(minimal);
check("minimal toolbar shows exactly bold, italic, link", minimalLabels.length === 3, minimalLabels.join(","));
await page.keyboard.press("Escape");
await pasteHTML(minimal, '<p>see <a href="https://example.com">site</a> <s>gone</s></p>');
check("links survive when link is on", (await minimal.locator(".bn-editor a[href='https://example.com']").count()) === 1);
check("strike is dropped when strike is off", (await minimal.locator(".bn-editor s").count()) === 0);

// Fixed top toolbar.
const fixed = page.locator("[data-example='tools-fixed-toolbar']");
await fixed.scrollIntoViewIfNeeded();
await editorIn(fixed).waitFor({ timeout: 10000 });
const fixedBar = fixed.getByTestId("fixed-toolbar");
check("fixed toolbar is visible without a selection", await fixedBar.isVisible());
check("fixed toolbar sits above the content", (await fixedBar.boundingBox()).y < (await editorIn(fixed).boundingBox()).y);
await emptyEditor(fixed);
await page.keyboard.type("Bold me");
await page.keyboard.press(`${mod}+a`);
await fixedBar.locator("button[data-test='bold'], button[aria-label^='Bold']").first().click();
check("fixed toolbar button formats the selection", (await fixed.locator(".bn-editor strong").count()) > 0);
check("no floating toolbar in fixed mode", (await fixed.locator(".bn-formatting-toolbar").count()) === 1);
await page.screenshot({ path: `${SHOTS}/tools-fixed-toolbar.png`, clip: await fixed.boundingBox() });

// Plugin: callout block.
const callout = page.locator("[data-example='plugin-callout']");
await callout.scrollIntoViewIfNeeded();
await editorIn(callout).waitFor({ timeout: 10000 });
check("callout initial content renders", (await callout.locator(".callout").count()) > 0);
const calloutSlash = await slashTitles(callout, "callout");
check("plugin slash item appears", calloutSlash.includes("Callout"), calloutSlash.join(","));
await emptyEditor(callout);
await page.keyboard.type("/callout");
await page.locator(".bn-suggestion-menu").waitFor();
await page.keyboard.press("Enter");
await page.keyboard.type("From the menu");
check("slash item inserts a callout", (await callout.locator(".callout").filter({ hasText: "From the menu" }).count()) === 1);
await emptyEditor(callout);
await page.keyboard.type("!> Shortcut");
check("'!> ' markdown shortcut makes a callout", (await callout.locator(".callout").filter({ hasText: "Shortcut" }).count()) === 1);
await callout.locator(".callout-icon").first().click();
check("callout tone button cycles the tone", (await callout.locator(".callout").first().getAttribute("data-tone")) === "warning");
const calloutLabels = await toolbarLabels(callout);
check("plugin toolbar item appears after built-ins", calloutLabels.at(-1) === "Callout", calloutLabels.join(","));
await page.locator(`${FLOATING_TOOLBAR} button[aria-label='Callout']`).first().click();
check("plugin toolbar button converts the block", (await callout.locator(".callout").filter({ hasText: "Select me" }).count()) === 1);
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("A tip lives here");
await page.keyboard.press("Escape");
await page.mouse.click(5, 5);
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/tools-callout-plugin.png`, clip: await callout.boundingBox() });

// API reference documents the plugin shape.
await page.goto(`${BASE_URL}/docs/api`);
const pluginFields = await page.getByTestId("api-plugins").locator("tbody tr td:first-child").allInnerTexts();
check("API reference documents plugin fields", ["name", "blocks", "slashItems", "toolbarItems", "markdownShortcuts"].every((f) => pluginFields.some((n) => n.trim().startsWith(f))), pluginFields.join(","));
const props = await page.getByTestId("api-props").locator("tbody tr td:first-child").allInnerTexts();
check("API reference documents tools, toolbar, plugins props", ["tools", "toolbar", "plugins"].every((p) => props.some((n) => n.trim().startsWith(p))));

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
