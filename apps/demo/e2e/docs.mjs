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
const settle = async (p) => {
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await p.waitForTimeout(400);
};
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// Landing page.
await page.goto(`${BASE_URL}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
check("landing shows the package name", (await page.locator("h1").innerText()).length > 0);
const install = (await page.getByTestId("install-command").innerText()).trim();
check("landing shows the install command", install === "npm install genesis-editor", install);
await page.getByRole("button", { name: "Copy install command" }).click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
check("install copy button copies the command", clip === "npm install genesis-editor", clip);
await page.locator("[data-testid='hero-editor'] .bn-editor").waitFor({ timeout: 10000 });
check("hero editor is live", (await page.locator("[data-testid='hero-editor'] .bn-editor").getAttribute("contenteditable")) === "true");
check("landing has no save status", (await page.getByTestId("save-status").count()) === 0);
check("version badge shown", await page.getByText(/^v\d+\.\d+\.\d+$/).first().isVisible());
check("GitHub and npm links", (await page.getByRole("link", { name: "GitHub repository" }).count()) > 0 && (await page.getByRole("link", { name: "npm package" }).count()) > 0);
await settle(page);
await page.screenshot({ path: `${SHOTS}/docs-landing.png` });

// Every docs page renders with the sidebar marking it active.
const pages = [
  ["getting-started", "Getting started"],
  ["usage", "Usage"],
  ["image-uploads", "Image uploads"],
  ["theming", "Theming"],
  ["api", "API reference"],
  ["shortcuts", "Keyboard shortcuts"],
  ["markdown", "Markdown"],
];
for (const [slug, title] of pages) {
  const response = await page.goto(`${BASE_URL}/docs/${slug}`);
  const h1 = (await page.locator("article h1").first().innerText().catch(() => "")).trim();
  const active = await page.locator(`aside a[aria-current='page'][href='/docs/${slug}']`).count();
  check(`/docs/${slug} renders`, response?.status() === 200 && h1 === title && active === 1, `h1="${h1}" active=${active}`);
}

// Example tabs: preview is live, code tab shows highlighted source.
await page.goto(`${BASE_URL}/docs/image-uploads`);
const example = page.locator("[data-example]").first();
await example.locator(".example-preview .bn-editor").waitFor({ timeout: 10000 });
check("example preview renders an editor", true);
await example.getByRole("tab", { name: "Code" }).click();
const codeText = await example.locator(".code-block").first().innerText();
check("example code tab shows source", codeText.includes("<BlockEditor"), codeText.slice(0, 40));
check("example code hides demo-only lines", !codeText.includes("useSiteTheme") && !codeText.includes("// hide"));
check("example code is highlighted", (await example.locator(".code-block .shiki span[style]").count()) > 0);
await example.getByRole("tab", { name: "Preview" }).click();
check("examples per upload mode", (await page.locator("[data-example]").count()) >= 3);
await settle(page);
await page.screenshot({ path: `${SHOTS}/docs-image-uploads.png` });

// API reference is generated from the exported types.
await page.goto(`${BASE_URL}/docs/api`);
const propNames = await page.getByTestId("api-props").locator("tbody tr td:first-child").allInnerTexts();
for (const name of ["value", "onChange", "persist", "uploadUrl", "uploadFile", "theme", "editable"]) {
  check(`API table documents ${name}`, propNames.some((n) => n.trim().startsWith(name)));
}
const methodNames = await page.getByTestId("api-methods").locator("tbody tr td:first-child").allInnerTexts();
check("API table documents ref methods", ["focus", "getBlocks", "setBlocks", "getMarkdown", "clearPersisted"].every((m) => methodNames.some((n) => n.includes(m))), methodNames.join(","));
await settle(page);
await page.screenshot({ path: `${SHOTS}/docs-api-reference.png` });

// Playground: props panel drives the editor and the generated code.
await page.goto(`${BASE_URL}/playground`);
await page.waitForSelector(".bn-editor");
const output = page.getByTestId("output-code");
check("playground shows generated code", (await output.innerText()).includes("<BlockEditor"));
await page.getByLabel("editable").click();
await page.waitForTimeout(200);
check("editable switch makes the editor read-only", (await page.locator(".bn-editor").getAttribute("contenteditable")) === "false");
check("generated code reflects editable", (await output.innerText()).includes("editable={false}"));
await page.getByLabel("editable").click();
await page.getByTestId("options-panel").getByLabel("Upload server", { exact: false }).first().click();
check("generated code reflects uploadUrl", (await output.innerText()).includes('uploadUrl="/api/mock-upload"'));
await page.getByTestId("options-panel").getByLabel("This browser", { exact: false }).first().click();
await page.getByRole("tab", { name: "JSON" }).click();
const json = await page.getByTestId("output-json").innerText();
check("JSON output shows the document", json.includes('"type": "heading"'));
await page.locator(".bn-editor .bn-block-content").last().click();
await page.keyboard.type("Live output check");
await page.waitForTimeout(600);
check("JSON output updates live", (await page.getByTestId("output-json").innerText()).includes("Live output check"));
await page.getByRole("tab", { name: "Markdown", exact: true }).click();
check("Markdown output updates live", (await page.getByTestId("output-markdown").innerText()).includes("Live output check"));
await page.getByRole("tab", { name: "Code" }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await settle(page);
await page.screenshot({ path: `${SHOTS}/docs-playground.png` });

// Side menu: compact, and inside the editor's own gutter in every container.
const sideMenuIn = async (p, editorLocator) => {
  await editorLocator.scrollIntoViewIfNeeded();
  const block = editorLocator.locator(".bn-block-content").first();
  const bb = await block.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 3 });
  await p.mouse.move(bb.x + 20, bb.y + bb.height / 2, { steps: 3 });
  await p.locator(".bn-side-menu").first().waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  return editorLocator.evaluate((editorEl) => {
    const menu = document.querySelector(".bn-side-menu");
    if (!menu) return null;
    const e = editorEl.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const buttons = [...menu.querySelectorAll(".bn-button")].map((b) => {
      const r = b.getBoundingClientRect();
      const svg = b.querySelector("svg").getBoundingClientRect();
      return { w: r.width, h: r.height, icon: svg.width, cursor: getComputedStyle(b).cursor };
    });
    return { inset: m.left - e.left, buttons };
  });
};
const sideMenuOk = (info) =>
  !!info &&
  info.inset >= 4 &&
  info.buttons.length === 2 &&
  info.buttons.every((b) => b.w <= 22 && b.h <= 22 && b.icon === 14 && b.cursor === "pointer");
const sideMenuDetail = (info) =>
  info ? `inset=${Math.round(info.inset)} ${info.buttons.map((b) => `${b.w}x${b.h}/${b.icon}`).join(",")}` : "no menu";

for (const path of ["/docs/usage", "/docs/image-uploads", "/docs/theming"]) {
  await page.goto(`${BASE_URL}${path}`);
  const editors = page.locator("[data-example] .example-preview .bn-editor");
  await editors.first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const count = await editors.count();
  const bad = [];
  for (let i = 0; i < count; i++) {
    if ((await editors.nth(i).getAttribute("contenteditable")) !== "true") continue;
    const info = await sideMenuIn(page, editors.nth(i));
    if (!sideMenuOk(info)) bad.push(`#${i} ${sideMenuDetail(info)}`);
  }
  check(`side menu fits every example on ${path}`, bad.length === 0, bad.join(" | ") || `${count} editors`);
}
await page.goto(`${BASE_URL}/docs/usage`);
const narrowExample = page.locator("[data-example]").first();
await narrowExample.locator(".bn-editor").waitFor();
await narrowExample.evaluate((el) => { el.style.width = "300px"; });
const narrowInfo = await sideMenuIn(page, narrowExample.locator(".bn-editor"));
check("side menu fits a 300px container", sideMenuOk(narrowInfo), sideMenuDetail(narrowInfo));
const customGutter = await narrowExample.evaluate((el) => {
  el.querySelector(".genesis-editor").style.setProperty("--genesis-gutter", "5rem");
  return getComputedStyle(el.querySelector(".bn-editor")).paddingLeft;
});
check("--genesis-gutter on the root sets the gutter", customGutter === "80px", customGutter);
await page.goto(`${BASE_URL}/`);
await page.locator("[data-testid='hero-editor'] .bn-editor").waitFor({ timeout: 10000 });
const heroInfo = await sideMenuIn(page, page.locator("[data-testid='hero-editor'] .bn-editor"));
check("side menu fits the hero editor", sideMenuOk(heroInfo), sideMenuDetail(heroInfo));
await page.goto(`${BASE_URL}/playground`);
await page.waitForSelector(".bn-editor");
const playInfo = await sideMenuIn(page, page.locator(".playground-editor .bn-editor"));
check("side menu fits the playground editor", sideMenuOk(playInfo), sideMenuDetail(playInfo));

// Dark mode.
await page.goto(`${BASE_URL}/docs/getting-started`);
await page.getByRole("button", { name: "Theme" }).click();
await page.getByRole("menuitemradio", { name: "Dark" }).click();
await page.waitForTimeout(300);
check("dark mode applies to the site", await page.evaluate(() => document.documentElement.classList.contains("dark")));
await page.goto(`${BASE_URL}/`);
await page.locator("[data-testid='hero-editor'] .bn-editor").waitFor({ timeout: 10000 });
check("hero editor follows dark mode", (await page.locator("[data-testid='hero-editor'] .bn-container").getAttribute("data-color-scheme")) === "dark");
await settle(page);
await page.screenshot({ path: `${SHOTS}/docs-landing-dark.png` });
await page.evaluate(() => localStorage.setItem("theme", "system"));

// Mobile navigation.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await mobile.newPage();
m.on("pageerror", (e) => errors.push(e.message));
for (const path of ["/", "/docs/api", "/playground"]) {
  await m.goto(`${BASE_URL}${path}`);
  await m.waitForTimeout(500);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || window.innerWidth > 390);
  check(`no horizontal overflow on mobile ${path}`, !overflow);
}
await m.goto(`${BASE_URL}/playground`);
await m.waitForSelector(".bn-editor");
await m.locator(".bn-block-content").first().tap();
await m.waitForTimeout(300);
const mobileGutter = await m.evaluate(() => ({
  padding: getComputedStyle(document.querySelector(".playground-editor .bn-editor")).paddingLeft,
  menuVisible: [...document.querySelectorAll(".bn-side-menu")].some((el) => el.getBoundingClientRect().width > 0),
}));
check("mobile uses the compact gutter without the hover menu", mobileGutter.padding === "20px" && !mobileGutter.menuVisible, JSON.stringify(mobileGutter));

await m.goto(`${BASE_URL}/docs/usage`);
await m.getByRole("button", { name: "Open menu" }).tap();
const sheet = m.getByRole("dialog");
await sheet.waitFor({ timeout: 3000 }).catch(() => {});
check("mobile menu lists docs pages", await sheet.getByRole("link", { name: "API reference" }).isVisible());
await m.screenshot({ path: `${SHOTS}/docs-mobile-menu.png` });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} docs checks passed`);
process.exit(failed.length ? 1 : 0);
