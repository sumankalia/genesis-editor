// Drives spikes/meta-prop/index.html in Chrome and prints a JSON verdict per check.
//   node spikes/meta-prop/run.mjs
/* global spike, window, document, console, process, setTimeout, DataTransfer, ClipboardEvent */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, "../../../../apps/demo/package.json"));
const { chromium } = require("playwright-core");

const server = await createServer({
  root: here,
  configFile: false,
  logLevel: "error",
  server: { port: 4318, strictPort: true },
  esbuild: { jsx: "automatic" },
  resolve: { dedupe: ["react", "react-dom", "yjs", "@blocknote/core", "prosemirror-state", "prosemirror-view", "prosemirror-model"] },
});
await server.listen();

const browser = await chromium.launch({ headless: true, channel: process.env.E2E_CHANNEL || "chrome" });
const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
};

try {
  await page.goto("http://localhost:4318/index.html");
  await page.waitForFunction(() => window.spike && document.querySelectorAll(".bn-editor").length === 4, null, { timeout: 20000 });

  // 1. JSON: the prop exists, defaults to "", and round-trips through the document.
  const json = await page.evaluate(() => ({ meta: spike.metaOf(spike.A), dflt: spike.B.document[0].props.meta }));
  record("JSON: meta in editor.document for every block type", Object.entries({ p1: "m-p1", h1: "m-h1", l1: "m-l1", l2: "m-l2", t1: "m-t1", i1: "m-i1", p2: "m-p2" }).every(([k, v]) => json.meta[k] === v), json.meta);
  record("JSON: default is empty string", json.dflt === "", json.dflt);

  // 2. HTML export / import.
  const html = await page.evaluate(async () => {
    const { A } = spike;
    const full = A.blocksToFullHTML(A.document);
    const lossy = await A.blocksToHTMLLossy(A.document);
    const back = await A.tryParseHTMLToBlocks(full);
    return { fullHasMeta: full.includes('data-meta="m-p1"'), lossyHasMeta: lossy.includes("m-p1"), reparsed: back.map((b) => b.props.meta) };
  });
  record("HTML: blocksToFullHTML writes data-meta", html.fullHasMeta);
  record("HTML: tryParseHTMLToBlocks(fullHTML) restores meta", html.reparsed.join() === "m-p1,m-h1,m-l1,m-t1,m-i1,m-p2", html.reparsed);
  console.log(`info lossy HTML contains meta: ${html.lossyHasMeta}`);

  // 3. Copy/paste with real ClipboardEvents (ProseMirror's own clipboard serializer and parser).
  const paste = await page.evaluate(() => {
    const { A, B } = spike;
    A.focus();
    A.setSelection("p1", "p2");
    const dt = new DataTransfer();
    A.domElement.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
    const types = [...dt.types];
    const bnHtml = dt.getData("blocknote/html");
    const pasteInto = (editor, id) => {
      editor.focus();
      editor.setTextCursorPosition(id, "end");
      editor.domElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    };
    const before = new Set(Object.keys(spike.metaOf(A)));
    pasteInto(A, "p2");
    const afterA = A.document.map((b) => ({ id: b.id, type: b.type, meta: b.props.meta, children: b.children.map((c) => c.props.meta) }));
    pasteInto(B, "b0");
    const afterB = B.document.map((b) => ({ type: b.type, meta: b.props.meta, children: b.children.map((c) => c.props.meta) }));
    return { types, bnHasMeta: bnHtml.includes("data-meta"), afterA, newIds: afterA.filter((b) => !before.has(b.id)).length, afterB };
  });
  console.log(`info clipboard types: ${paste.types.join(", ")}; blocknote/html carries data-meta: ${paste.bnHasMeta}`);
  // ProseMirror merges the first pasted paragraph into the block at the cursor, so it takes that block's
  // props (meta included); every whole block after it keeps its own.
  const pastedA = paste.afterA.slice(-5, -1);
  record("Copy/paste within editor keeps meta on whole blocks", pastedA.map((b) => b.meta).join() === "m-h1,m-l1,m-t1,m-i1", paste.afterA.map((b) => `${b.type}:${b.meta}`));
  record("Copy/paste within editor keeps child meta", pastedA[1]?.children[0] === "m-l2", pastedA[1]?.children);
  record("Copy/paste: first block merges into the target and takes its meta", paste.afterA.at(-6)?.meta === "m-p2", paste.afterA.at(-6));
  record("Copy/paste between editors keeps meta on whole blocks", paste.afterB.slice(1, 5).map((b) => b.meta).join() === "m-h1,m-l1,m-t1,m-i1", paste.afterB.map((b) => `${b.type}:${b.meta}`));

  // 3b. Native clipboard via keyboard shortcuts.
  await page.evaluate(() => {
    spike.B.replaceBlocks(spike.B.document, [{ id: "b0", type: "paragraph", content: "target" }]);
    spike.A.focus();
    spike.A.setSelection("h1", "l1");
  });
  await page.keyboard.press("ControlOrMeta+c");
  await page.evaluate(() => {
    spike.B.focus();
    spike.B.setTextCursorPosition("b0", "end");
  });
  await page.keyboard.press("ControlOrMeta+v");
  const native = await page.evaluate(() => spike.B.document.map((b) => `${b.type}:${b.props.meta}`));
  record("Native Cmd+C / Cmd+V between editors keeps meta", native.includes("bulletListItem:m-l1"), native);

  // 4. Drag with the side-menu handle (real mouse, HTML5 drag and drop).
  await page.evaluate(() => spike.A.replaceBlocks(spike.A.document, spike.initial));
  const block = page.locator('[data-editor="A"] [data-id="p1"]').first();
  await block.hover();
  const handle = page.locator('[data-editor="A"] .bn-side-menu [draggable="true"]').first();
  await handle.waitFor({ timeout: 5000 });
  const targetBlock = page.locator('[data-editor="A"] [data-id="p2"] .bn-inline-content').first();
  const tb = await targetBlock.boundingBox();
  await handle.dragTo(targetBlock, { targetPosition: { x: 20, y: tb.height - 2 } });
  await page.waitForTimeout(300);
  const dragged = await page.evaluate(() => spike.A.document.map((b) => `${b.id}:${b.props.meta}`));
  const movedLast = dragged.at(-1)?.endsWith(":m-p1") || dragged.at(-2)?.endsWith(":m-p1");
  record("Drag via side menu moves the block and keeps meta", movedLast && dragged.filter((d) => d.endsWith(":m-p1")).length === 1, dragged);

  // 5. Yjs: sync between two editors, update, and a fresh client.
  await page.evaluate(() => spike.C.replaceBlocks(spike.C.document, spike.initial));
  await page.waitForTimeout(200);
  const ysync = await page.evaluate(() => spike.metaOf(spike.D));
  record("Yjs: meta syncs to the other client", ysync.p1 === "m-p1" && ysync.l2 === "m-l2" && ysync.t1 === "m-t1", ysync);
  await page.evaluate(() => spike.D.updateBlock("h1", { props: { meta: "changed-in-D" } }));
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => spike.metaOf(spike.C).h1);
  record("Yjs: updateBlock meta propagates back", back === "changed-in-D", back);
  await page.evaluate(() => {
    spike.C.setTextCursorPosition("p1", "end");
  });
  await page.locator('[data-editor="C"] [data-id="p1"]').first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" typed");
  await page.waitForTimeout(200);
  const typed = await page.evaluate(() => ({ text: spike.D.getBlock("p1").content.map((c) => c.text).join(""), meta: spike.D.getBlock("p1").props.meta }));
  record("Yjs: typing keeps meta on both clients", typed.meta === "m-p1" && typed.text.endsWith("typed"), typed);
  const fresh = await page.evaluate(async () => {
    const { Y, docC, make, withCollaboration } = spike;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(docC));
    const E = make(withCollaboration({ collaboration: { fragment: doc.getXmlFragment("doc"), user: { name: "E", color: "#000" } } }));
    const el = document.createElement("div");
    document.body.append(el);
    E.mount(el);
    await new Promise((r) => setTimeout(r, 100));
    return spike.metaOf(E);
  });
  record("Yjs: a fresh client loading the doc state sees meta", fresh.p1 === "m-p1" && fresh.h1 === "changed-in-D", fresh);

  // 6. Split and merge.
  await page.evaluate(() => spike.A.replaceBlocks(spike.A.document, spike.initial));
  await page.evaluate(() => {
    spike.A.focus();
    spike.A.setTextCursorPosition("p2", "start");
  });
  await page.waitForTimeout(150);
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const split = await page.evaluate(() => spike.A.document.slice(-2).map((b) => ({ text: b.content.map((c) => c.text).join(""), meta: b.props.meta })));
  record("Split (Enter mid-block): the new block gets empty meta", split[0].text && split[1].text && split[0].meta === "m-p2" && split[1].meta === "", split);
  await page.keyboard.press("Backspace");
  const merged = await page.evaluate(() => spike.A.document.slice(-1).map((b) => ({ text: b.content.map((c) => c.text).join(""), meta: b.props.meta })));
  record("Merge (Backspace): merged block keeps the first block's meta", merged[0].meta === "m-p2" && merged[0].text === "Last paragraph", merged);

  await page.evaluate(() => {
    spike.A.focus();
    spike.A.setTextCursorPosition("h1", "start");
  });
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  const atStart = await page.evaluate(() => spike.A.document.slice(0, 3).map((b) => ({ id: b.id, type: b.type, text: b.content.map((c) => c.text).join(""), meta: b.props.meta })));
  const dup = atStart.filter((b) => b.meta === "m-h1").length;
  console.log(`info Enter at block start (BlockNote keeps props there): ${JSON.stringify(atStart)}`);
  record("Enter at block start: meta stays on exactly one block", dup === 1, atStart);

  await page.screenshot({ path: resolve(here, "spike.png"), fullPage: true });
} catch (e) {
  record("runner", false, String(e).slice(0, 500));
} finally {
  if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(" | ")}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await browser.close();
  await server.close();
  process.exit(failed ? 1 : 0);
}
