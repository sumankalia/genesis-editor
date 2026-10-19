import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { BASE_URL } from "./config.mjs";

const SITE = "https://genesis-editor-three.vercel.app";
const here = dirname(fileURLToPath(import.meta.url));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// npmjs.com answers scripted requests with 403, so its package pages are checked on the registry.
const local = (url) =>
  url.startsWith(SITE)
    ? BASE_URL + url.slice(SITE.length)
    : url.replace(/^https:\/\/www\.npmjs\.com\/package\//, "https://registry.npmjs.org/");
const get = async (url) => {
  const response = await fetch(url, { redirect: "manual" });
  return { status: response.status, type: response.headers.get("content-type") ?? "", text: await response.text() };
};

// The index follows llmstxt.org: one H1, a blockquote summary, then H2 sections of link lists.
const index = await get(`${BASE_URL}/llms.txt`);
check("/llms.txt is 200 text/plain", index.status === 200 && index.type.startsWith("text/plain"), `${index.status} ${index.type}`);
const lines = index.text.split("\n");
check("starts with a single H1", /^# \S/.test(lines[0]) && lines.filter((l) => /^# /.test(l)).length === 1, lines[0]);
check("blockquote summary follows the H1", lines.slice(1).find((l) => l.trim())?.startsWith("> "));
const sections = lines.filter((l) => /^## /.test(l)).map((l) => l.slice(3));
check("has Docs, Reference and Optional sections", ["Docs", "Reference", "Optional"].every((s) => sections.includes(s)), sections.join(", "));
const links = [...index.text.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)(: .+)?$/gm)];
const listLines = lines.filter((l) => l.startsWith("- "));
check("every list item is [title](url): note", listLines.length === links.length && links.length > 10, `${links.length}/${listLines.length}`);
const docLinks = links.filter((m) => m[2].startsWith(`${SITE}/docs/`));
check("every docs link ends in .md and has a note", docLinks.length > 0 && docLinks.every((m) => m[2].endsWith(".md") && m[3]?.length > 3), `${docLinks.length} docs pages`);

// Every URL in it answers 200 (docs and the full file locally, npm and GitHub live).
const markdown = new Map();
for (const [, title, url] of links) {
  const target = local(url);
  const response = await get(target).catch((error) => ({ status: String(error.message) }));
  check(`200: ${title}`, response.status === 200, `${response.status} ${target}`);
  if (url.endsWith(".md") || url.endsWith(".txt")) {
    markdown.set(url, response.text ?? "");
    if (url.endsWith(".md")) check(`  text/markdown: ${title}`, response.type?.startsWith("text/markdown"), response.type);
  }
}

// Each .md page is clean Markdown: an H1, balanced fences, no leftover HTML elements.
const tags = /<\/?(div|span|button|svg|article|section|template|pre|code|table|tr|td|p|a|ul|li)\b[^>]*>/i;
const outsideFences = (text) =>
  text
    .split(/^`{3,}.*$/m)
    .filter((_, i) => i % 2 === 0)
    .join("\n")
    .replace(/(`+)[^`\n]*?\1/g, "");
for (const [url, text] of markdown) {
  const name = url.slice(SITE.length);
  const fences = text.match(/^`{3,}/gm)?.length ?? 0;
  check(`${name}: H1, balanced fences, no HTML`, /^# \S/.test(text) && fences % 2 === 0 && !tags.test(outsideFences(text)), `fences ${fences}`);
  check(`${name}: no empty code blocks`, !/^`{3,}\w*\n`{3,}$/m.test(text));
}
const unknown = await get(`${BASE_URL}/docs/not-a-page.md`);
check("unknown .md page is 404", unknown.status === 404, String(unknown.status));

const full = markdown.get(`${SITE}/llms-full.txt`) ?? "";
for (const [url, text] of markdown) {
  if (!url.endsWith(".md")) continue;
  const title = text.split("\n")[0].slice(2);
  check(`llms-full has ${url.slice(SITE.length)}`, full.includes(`<!-- ${url.slice(0, -3)} -->`) && full.includes(`## ${title}\n`));
}

// The API page lists every prop and ref member the package actually exports.
const entry = join(here, "../../../packages/editor/src/index.ts");
const program = ts.createProgram([entry], { strict: true, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const checker = program.getTypeChecker();
const exportsOf = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(entry)));
const members = (name) => {
  const symbol = exportsOf.find((s) => s.name === name);
  if (!symbol) return [];
  const type = checker.getDeclaredTypeOfSymbol(symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const parts = type.isUnion() ? type.types : [type];
  return [...new Set(parts.flatMap((t) => checker.getPropertiesOfType(t).map((p) => p.name)))];
};
const api = markdown.get(`${SITE}/docs/api.md`) ?? "";
const section = (heading) => api.split(/^## /m).find((s) => s.startsWith(heading)) ?? "";
const rows = (text) => new Set([...text.matchAll(/^\| ([\w$]+) \|/gm)].map((m) => m[1]));
const props = members("BlockEditorProps");
const handle = members("BlockEditorHandle");
const propRows = rows(section("BlockEditor props"));
const handleRows = rows(section("Ref (BlockEditorHandle)"));
check("BlockEditorProps read from the source", props.length > 20, String(props.length));
check("BlockEditorHandle read from the source", handle.length > 5, String(handle.length));
const missingProps = props.filter((p) => !propRows.has(p));
const extraProps = [...propRows].filter((p) => p !== "Prop" && !props.includes(p));
check("api.md lists every prop, and only real ones", !missingProps.length && !extraProps.length, `missing ${missingProps.join(", ") || "none"}; extra ${extraProps.join(", ") || "none"}`);
const missingHandle = handle.filter((p) => !handleRows.has(p));
const extraHandle = [...handleRows].filter((p) => !["Member", "Method", "Name"].includes(p) && !handle.includes(p));
check("api.md lists every ref member, and only real ones", !missingHandle.length && !extraHandle.length, `missing ${missingHandle.join(", ") || "none"}; extra ${extraHandle.join(", ") || "none"}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
