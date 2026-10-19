#!/usr/bin/env node
/**
 * Installs the packed package into a scratch app on several Node versions and checks every public
 * entry point from `require` and `import`, a parse → toHTML round trip on each server DOM adapter,
 * and a server-side import and render of the React entry.
 *
 *   node scripts/node-matrix.mjs                     # packs, then tests nvm's newest 18, 20 and 22, and this Node
 *   node scripts/node-matrix.mjs --tarball x.tgz     # skips packing
 *   node scripts/node-matrix.mjs --node ~/.nvm/versions/node/v18.20.7/bin/node --node /usr/local/bin/node
 *
 * Node binaries are run by absolute path, so the default Node isn't changed. Exits 1 when a check fails.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
const keep = args.includes("--keep");

function detectNodes() {
  const found = new Set([process.execPath]);
  const nvm = process.env.NVM_DIR ?? join(process.env.HOME ?? "", ".nvm");
  const versions = join(nvm, "versions", "node");
  if (existsSync(versions)) {
    const parse = (v) => v.slice(1).split(".").map(Number);
    const installed = readdirSync(versions).filter((v) => /^v\d+\.\d+\.\d+$/.test(v));
    for (const major of [18, 20, 22]) {
      const newest = installed
        .filter((v) => parse(v)[0] === major)
        .sort((a, b) => {
          const [x, y] = [parse(a), parse(b)];
          return x[1] - y[1] || x[2] - y[2];
        })
        .pop();
      if (newest) found.add(join(versions, newest, "bin", "node"));
    }
  }
  return [...found];
}

const nodes = option("--node").length ? option("--node").map((p) => resolve(p.replace(/^~/, process.env.HOME ?? "~"))) : detectNodes();
const work = mkdtempSync(join(tmpdir(), "genesis-matrix-"));

let tarball = option("--tarball")[0];
if (tarball) tarball = resolve(tarball);
else {
  console.log("Packing genesis-editor…");
  const name = execFileSync("npm", ["pack", "--pack-destination", work], { cwd: pkgDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
    .trim()
    .split("\n")
    .pop();
  tarball = join(work, name);
}

const SAMPLE = '<h2 class="x">Title</h2><p>A&nbsp; <b>bold</b> <a href="https://example.com/">link</a>.</p><ul><li>one</li></ul><pre><code>a\n  b</code></pre>';
const roundTrip = (load) => `
${load}
const sample = ${JSON.stringify(SAMPLE)};
const first = parser.parseHTML(sample, { dom });
const html = parser.toHTML(first.blocks);
const again = parser.parseHTML(html, { dom });
if (first.blocks.length !== 4 || first.blocks[0].type !== "heading") throw new Error("unexpected blocks: " + JSON.stringify(first.blocks).slice(0, 200));
if (JSON.stringify(again.blocks) !== JSON.stringify(first.blocks)) throw new Error("round trip changed the blocks");
if (first.blocks[3].content[0].text !== "a\\n  b") throw new Error("code lost its newline");
`;

/** [id, file name, source, required] — each runs in its own process, so one failure can't hide another. */
const CHECKS = [
  ["require genesis-editor", "main.cjs", `const m = require("genesis-editor"); if (typeof m.BlockEditor !== "object" && typeof m.BlockEditor !== "function") throw new Error("no BlockEditor");`],
  ["require /parser", "parser.cjs", `const m = require("genesis-editor/parser"); if (typeof m.parseHTML !== "function") throw new Error("no parseHTML");`],
  ["require /parser/linkedom", "linkedom.cjs", `const m = require("genesis-editor/parser/linkedom"); if (!m.linkedomDom) throw new Error("no linkedomDom");`],
  ["require /parser/jsdom", "jsdom.cjs", `const m = require("genesis-editor/parser/jsdom"); if (!m.jsdomDom) throw new Error("no jsdomDom");`],
  ["CJS round trip (linkedom)", "rt-linkedom.cjs", roundTrip(`const parser = require("genesis-editor/parser"); const dom = require("genesis-editor/parser/linkedom").linkedomDom;`)],
  ["CJS round trip (jsdom)", "rt-jsdom.cjs", roundTrip(`const parser = require("genesis-editor/parser"); const dom = require("genesis-editor/parser/jsdom").jsdomDom;`)],
  ["import genesis-editor", "main.mjs", `const m = await import("genesis-editor"); if (!m.BlockEditor) throw new Error("no BlockEditor");`],
  ["import /parser", "parser.mjs", `const m = await import("genesis-editor/parser"); if (typeof m.parseHTML !== "function") throw new Error("no parseHTML");`],
  ["import /parser/linkedom", "linkedom.mjs", `const m = await import("genesis-editor/parser/linkedom"); if (!m.linkedomDom) throw new Error("no linkedomDom");`],
  ["import /parser/jsdom", "jsdom.mjs", `const m = await import("genesis-editor/parser/jsdom"); if (!m.jsdomDom) throw new Error("no jsdomDom");`],
  ["ESM round trip (linkedom)", "rt-linkedom.mjs", roundTrip(`const parser = await import("genesis-editor/parser"); const { linkedomDom: dom } = await import("genesis-editor/parser/linkedom");`)],
  ["ESM round trip (jsdom)", "rt-jsdom.mjs", roundTrip(`const parser = await import("genesis-editor/parser"); const { jsdomDom: dom } = await import("genesis-editor/parser/jsdom");`)],
  [
    "ESM round trip (document factory)",
    "rt-factory.mjs",
    roundTrip(`const parser = await import("genesis-editor/parser"); const { parseHTML: linkedom } = await import("linkedom"); const dom = (html) => linkedom(html).document;`),
  ],
  [
    "SSR import + render (ESM)",
    "ssr.mjs",
    `const React = await import("react"); const { renderToString } = await import("react-dom/server"); const { BlockEditor } = await import("genesis-editor");
const html = renderToString(React.createElement(BlockEditor, { format: "html", defaultValue: "<p>Hi</p>", className: "x" }));
if (!/class="genesis-editor x"/.test(html)) throw new Error("unexpected server HTML: " + html);`,
  ],
  [
    "SSR require + render (CJS)",
    "ssr.cjs",
    `const React = require("react"); const { renderToString } = require("react-dom/server"); const { BlockEditor } = require("genesis-editor");
const html = renderToString(React.createElement(BlockEditor, {}));
if (!html.includes("genesis-editor")) throw new Error("unexpected server HTML: " + html);`,
  ],
  ["Client render in jsdom (CJS)", "client.cjs", clientRender(`const React = require("react"); const { createRoot } = require("react-dom/client"); const { BlockEditor } = require("genesis-editor");`, `require("jsdom")`)],
  ["Client render in jsdom (ESM)", "client.mjs", clientRender(`const React = await import("react"); const { createRoot } = await import("react-dom/client"); const { BlockEditor } = await import("genesis-editor");`, `await import("jsdom")`)],
];

/** Mounts the editor in a jsdom window, as a Jest or Vitest test would, and waits for its content. */
function clientRender(load, loadJsdom) {
  return `
const { JSDOM } = ${loadJsdom};
const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: "http://localhost/" });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (!(key in globalThis)) try { globalThis[key] = dom.window[key]; } catch {}
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
${load}
const root = createRoot(document.getElementById("root"));
root.render(React.createElement(BlockEditor, { format: "html", defaultValue: "<h2>Hello</h2><p>from <b>jsdom</b></p>" }));
const deadline = Date.now() + 10000;
while (!document.querySelector(".bn-editor h2") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
const h2 = document.querySelector(".bn-editor h2");
if (!h2 || h2.textContent !== "Hello") throw new Error("editor content not rendered: " + document.body.innerHTML.slice(0, 200));
root.unmount();
process.exit(0);
`;
}

function run(node, file, cwd) {
  const result = spawnSync(node, [file], { cwd, encoding: "utf8", timeout: 60_000, env: { ...process.env, PATH: `${dirname(node)}:${process.env.PATH}` } });
  if (result.status === 0) return { ok: true };
  const text = `${result.stderr}\n${result.stdout}`;
  const line = text.split("\n").find((l) => /Error|error:|ERR_|Cannot|not defined|failed/.test(l)) ?? (result.signal ? `killed (${result.signal})` : text.trim().split("\n")[0]);
  return { ok: false, detail: line.trim().slice(0, 140) };
}

const results = [];
for (const node of nodes) {
  const version = execFileSync(node, ["-v"], { encoding: "utf8" }).trim();
  const app = join(work, `app-${version}`);
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "matrix-app", private: true, version: "0.0.0" }));
  const npm = join(dirname(node), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  console.log(`\n${version}: installing into ${app}`);
  const install = spawnSync(node, [npm, "install", tarball, "react@19", "react-dom@19", "linkedom@0.18", "jsdom@26", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: app,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dirname(node)}:${process.env.PATH}` },
  });
  if (install.status !== 0) {
    console.log(install.stderr);
    results.push({ version, check: "npm install", ok: false, detail: install.stderr.split("\n")[0] });
    continue;
  }
  for (const [check, file, source] of CHECKS) {
    writeFileSync(join(app, file), file.endsWith(".mjs") ? source : `(async () => {\n${source}\n})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });`);
    const outcome = run(node, file, app);
    results.push({ version, check, ...outcome });
    console.log(`  ${outcome.ok ? "PASS" : "FAIL"}  ${check}${outcome.detail ? `  (${outcome.detail})` : ""}`);
  }
}

const versions = [...new Set(results.map((r) => r.version))];
const checks = [...new Set(results.map((r) => r.check))];
console.log(`\n| Check | ${versions.join(" | ")} |\n| --- | ${versions.map(() => "---").join(" | ")} |`);
for (const check of checks) {
  const cells = versions.map((v) => {
    const r = results.find((x) => x.version === v && x.check === check);
    return r ? (r.ok ? "pass" : "FAIL") : "—";
  });
  console.log(`| ${check} | ${cells.join(" | ")} |`);
}
if (!keep) rmSync(work, { recursive: true, force: true });
else console.log(`\nScratch apps kept in ${work}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
