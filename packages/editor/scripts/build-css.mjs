// Builds dist/style.css: Tailwind (theme, preflight, utilities used by the editor and
// BlockNote's shadcn components) scoped to `.genesis-editor`, then BlockNote's own
// stylesheet, then the editor overrides.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const SCOPE = ".genesis-editor";
const WHERE = `:where(${SCOPE})`;
const ROOT_SELECTORS = new Set([":root", ":host", "html"]);
const SELF_AND_DESCENDANTS = new Set([
  "*",
  "::before",
  "::after",
  "::backdrop",
  "::file-selector-button",
  "::placeholder",
  "::marker",
]);
// Typography the editor should inherit from the host page rather than reset.
const ROOT_DECLS_TO_DROP = new Set([
  "font-family",
  "font-feature-settings",
  "font-variation-settings",
  "-webkit-text-size-adjust",
  "tab-size",
  "-webkit-tap-highlight-color",
]);

function scopeSelector(selector) {
  if (selector.includes(SCOPE)) return [selector];
  if (ROOT_SELECTORS.has(selector)) return [WHERE];
  if (selector === "body") return [];
  if (SELF_AND_DESCENDANTS.has(selector)) {
    const self = selector === "*" ? WHERE : `${WHERE}${selector}`;
    return [self, `${WHERE} ${selector}`];
  }
  return [`${WHERE} ${selector}`];
}

/** @type {import("postcss").PluginCreator<void>} */
const scopeToEditor = () => ({
  postcssPlugin: "genesis-editor-scope",
  OnceExit(css) {
    css.walkAtRules("layer", (rule) => {
      if (rule.nodes) rule.replaceWith(rule.nodes);
      else rule.remove();
    });
    css.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
      const isRoot = rule.selectors.some((s) => ROOT_SELECTORS.has(s));
      const selectors = [...new Set(rule.selectors.flatMap(scopeSelector))];
      if (selectors.length === 0) {
        rule.remove();
        return;
      }
      rule.selectors = selectors;
      if (isRoot && rule.selectors.length === 1) {
        rule.walkDecls((decl) => {
          if (ROOT_DECLS_TO_DROP.has(decl.prop)) decl.remove();
        });
      }
      if (rule.nodes.length === 0) rule.remove();
    });
  },
});
scopeToEditor.postcss = true;

const input = join(root, "src/styles/index.css");
const compiled = await postcss([
  tailwind({ base: root, optimize: { minify: false } }),
  scopeToEditor(),
]).process(await readFile(input, "utf8"), { from: input });

// BlockNote's own selectors are namespaced with `.bn-*`, except for a few bare
// attribute selectors (`[data-text-color=red]`, ...) that would reach the host page.
const NAMESPACED = /\.bn-|ProseMirror|prosemirror|tableWrapper|column-resize|selectedCell|collaboration|katex|shiki/;
/** @type {import("postcss").PluginCreator<void>} */
const scopeBareSelectors = () => ({
  postcssPlugin: "genesis-editor-scope-bare",
  OnceExit(css) {
    css.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
      rule.selectors = rule.selectors.map((s) => (NAMESPACED.test(s) ? s : `${WHERE} ${s}`));
    });
  },
});
scopeBareSelectors.postcss = true;

const blocknotePath = require.resolve("@blocknote/shadcn/style.css");
const blocknote = (
  await postcss([scopeBareSelectors()]).process(await readFile(blocknotePath, "utf8"), {
    from: blocknotePath,
  })
).css;
const overrides = await readFile(join(root, "src/styles/editor.css"), "utf8");

const output = [
  "/* genesis-editor | MIT License | Includes BlockNote (MPL-2.0) and Tailwind CSS (MIT) styles. */",
  compiled.css,
  blocknote,
  overrides,
].join("\n");

await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/style.css"), output);
console.log(`dist/style.css ${(Buffer.byteLength(output) / 1024).toFixed(1)} kB`);
