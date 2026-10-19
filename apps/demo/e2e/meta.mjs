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
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const mod = process.platform === "darwin" ? "Meta" : "Control";

await page.goto(`${BASE_URL}/docs/html`);
const example = page.locator("[data-example='block-meta']");
const editor = example.locator(".bn-editor");
const jsonBox = example.getByTestId("meta-json");
await editor.waitFor({ timeout: 15000 });
await example.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const blocks = async () => JSON.parse(await jsonBox.innerText());

let doc = await blocks();
check("meta keeps id and lang", JSON.stringify(doc[0].meta) === '{"v":1,"attrs":{"id":"launch","lang":"en"}}' && doc[1].meta?.attrs?.lang === "fr", JSON.stringify(doc[0].meta));
const quote = doc.find((b) => b.type === "quote");
check("quote keeps its paragraphs, attribution, and cite URL", quote?.props?.cite === "https://example.com/interview" && quote.children?.length === 2 && quote.children[1].meta?.source?.tag === "cite", JSON.stringify(quote?.children));
const image = doc.find((b) => b.type === "image");
check("image keeps alt, size, link, and rich caption", image?.props?.alt === "A soft gradient" && image.props.width === 1200 && image.props.height === 400 && image.props.previewWidth === 480 && image.props.href === "https://example.com/" && /Genesis/.test(image.props.captionRich ?? ""), JSON.stringify(image?.props));

// Rendering.
const quoteGroup = editor.locator(".bn-block:has(> [data-content-type='quote']) > .bn-block-group");
const frame = await quoteGroup.evaluate((group) => {
  const block = group.parentElement;
  const quote = block.querySelector(":scope > [data-content-type='quote'] blockquote");
  return { block: getComputedStyle(block).borderLeftWidth, quote: getComputedStyle(quote).borderLeftStyle, group: getComputedStyle(group).marginLeft };
}).catch(() => null);
check("quote children are drawn inside one quote border", frame?.block === "2px" && frame.quote === "none" && frame.group === "0px", JSON.stringify(frame));
check("attribution is a styled paragraph", (await quoteGroup.locator("[data-content-type='paragraph'][data-meta*='cite']").innerText()).includes("The design doc"));
check("image renders alt", (await editor.locator("img.bn-visual-media").getAttribute("alt")) === "A soft gradient");

// A real Enter split: the second half gets the meta without the id.
await placeCaret(editor.locator("h2"), "Launch".length);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
doc = await blocks();
check("Enter: first half keeps the id", doc[0].content === "Launch" && doc[0].meta?.attrs?.id === "launch");
check("Enter: second half gets the meta without the id", doc[1].content?.trim() === "notes" && JSON.stringify(doc[1].meta) === '{"v":1,"attrs":{"lang":"en"}}', JSON.stringify(doc[1]));
await page.keyboard.press(`${mod}+z`);
await page.waitForTimeout(400);
check("undo joins them back with the original meta", (await blocks())[0].content === "Launch notes");

// Clipboard: other apps never get data-meta; BlockNote's own format keeps it unless stripped.
await page.evaluate(() => window.addEventListener("copy", (e) => (window.__copied = { html: e.clipboardData.getData("text/html"), bn: e.clipboardData.getData("blocknote/html") })));
const copyFrench = async () => {
  await editor.locator("[data-content-type='paragraph']").first().click();
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+c`);
  await page.waitForTimeout(100);
  return page.evaluate(() => window.__copied);
};
let copied = await copyFrench();
check("copied HTML for other apps has no data-meta", !!copied?.html && !copied.html.includes("data-meta"), copied?.html?.slice(0, 80));
check("BlockNote's clipboard keeps meta", copied?.bn?.includes("data-meta") ?? false);

await example.getByTestId("meta-policy-strip-on-export").click();
await page.waitForTimeout(300);
check("strip-on-export leaves meta out of getBlocks", !(await jsonBox.innerText()).includes('"meta"'));
copied = await copyFrench();
check("strip-on-export strips BlockNote's clipboard too", !!copied?.bn && !copied.bn.includes("data-meta"));
await example.getByTestId("meta-policy-keep").click();
await page.mouse.click(5, 5);
await page.waitForTimeout(300);
check("keep brings meta back (it stayed in the document)", (await jsonBox.innerText()).includes('"id": "launch"'));
await example.screenshot({ path: `${SHOTS}/meta-json.png` });

// localStorage saved before versioning is migrated.
await page.goto(`${BASE_URL}/docs/usage`);
await page.evaluate(() =>
  localStorage.setItem(
    "docs:persist-example",
    JSON.stringify({ savedAt: 1, blocks: [{ id: "old", type: "paragraph", props: { meta: '{"attrs":{"lang":"de"}}', textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text: "Gespeichert vor Version 2", styles: {} }], children: [] }] }),
  ),
);
await page.reload();
const persisted = page.locator("[data-example='persist'] .bn-editor");
await persisted.waitFor({ timeout: 15000 });
await page.waitForTimeout(300);
check("an unversioned save still loads", (await persisted.innerText()).includes("Gespeichert vor Version 2"));
await placeCaret(persisted.locator("p").first());
await page.keyboard.type("!");
await page.waitForTimeout(800);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("docs:persist-example")));
check("it is re-saved as version 2 with top-level meta", saved.v === 2 && JSON.stringify(saved.blocks[0].meta) === '{"v":1,"attrs":{"lang":"de"}}' && !("meta" in saved.blocks[0].props), JSON.stringify(saved).slice(0, 160));
await page.evaluate(() => localStorage.removeItem("docs:persist-example"));

// API reference.
await page.goto(`${BASE_URL}/docs/api`);
const props = await page.getByTestId("api-props").locator("tbody tr td:first-child").allInnerTexts();
check("API documents the meta prop", props.includes("meta"));
check("API shows GenesisMeta and MetaOptions", (await page.locator("pre", { hasText: "export type GenesisMeta" }).count()) === 1 && (await page.locator("pre", { hasText: "export type MetaOptions" }).count()) === 1);
check("API lists stripMeta", (await page.locator("td", { hasText: "stripMeta(blocks)" }).count()) >= 1);

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} meta checks passed`);
process.exit(failed.length ? 1 : 0);
