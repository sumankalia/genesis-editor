import { readFile, writeFile } from "node:fs/promises";

import { defineConfig } from "tsup";

const shared = {
  dts: true,
  sourcemap: true,
  target: "es2020",
};

const editorExternal = ["react", "react-dom", /^@blocknote\//, "lucide-react", "prosemirror-state", "prosemirror-history", "prosemirror-view", "prosemirror-model"];
// The editor relies on hooks and browser APIs, so it must be a client component in React Server Components apps.
const editorBanner = { js: '"use client";' };
const parserEntries = {
  "parser/index": "src/parser/index.ts",
  "parser/linkedom": "src/parser/linkedom.ts",
  "parser/jsdom": "src/parser/jsdom.ts",
};

/**
 * The parser is pure and also runs on servers, so only the editor entry gets the "use client" directive. (A tsup
 * banner would go on every file of the shared ESM build, chunks included.) The source map shifts by the added line.
 */
async function markClientEntry() {
  const file = "dist/index.js";
  const code = await readFile(file, "utf8");
  if (code.startsWith('"use client";')) return;
  await writeFile(file, `"use client";\n${code}`);
  const map = JSON.parse(await readFile(`${file}.map`, "utf8")) as { mappings: string };
  map.mappings = `;${map.mappings}`;
  await writeFile(`${file}.map`, JSON.stringify(map));
}

export default defineConfig([
  {
    ...shared,
    // One ESM build with code splitting, so the editor and `genesis-editor/parser` share chunks: an app that
    // uses both gets the HTML engine once.
    format: ["esm"],
    entry: { index: "src/index.ts", ...parserEntries },
    splitting: true,
    clean: true,
    external: [...editorExternal, "linkedom", "jsdom"],
    onSuccess: markClientEntry,
  },
  {
    ...shared,
    // BlockNote's own CommonJS build `require`s ESM-only packages (lib0), which fails before Node 22.12
    // and misreads default exports after it. The CommonJS build therefore bundles everything but React.
    format: ["cjs"],
    entry: ["src/index.ts"],
    clean: false,
    // A bundled BlockNote's source map would be ~18 MB.
    sourcemap: false,
    external: ["react", "react-dom"],
    noExternal: [/^(?!react$|react-dom$|react\/|react-dom\/)/],
    banner: editorBanner,
  },
  {
    ...shared,
    // linkedom's CommonJS build `require`s ESM-only css-select, so the CommonJS adapter bundles linkedom.
    format: ["cjs"],
    entry: parserEntries,
    clean: false,
    sourcemap: false,
    external: ["jsdom", "canvas"],
    noExternal: ["linkedom", /^css-select/, /^css-what/, /^nth-check/, /^boolbase/, /^domutils/, /^domhandler/, /^dom-serializer/, /^domelementtype/, /^entities/, /^htmlparser2/, "cssom", "html-escaper", "uhyphen"],
  },
]);
