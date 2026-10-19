import { defineConfig } from "tsup";

const shared = {
  dts: true,
  sourcemap: true,
  target: "es2020",
};

const editorExternal = ["react", "react-dom", /^@blocknote\//, "lucide-react", "prosemirror-state", "prosemirror-history", "prosemirror-view", "prosemirror-model"];
// The editor relies on hooks and browser APIs, so it must be a client component in React Server Components apps.
const editorBanner = { js: '"use client";' };
// The parser is pure and also runs on servers, so it gets no "use client" banner.
const parserEntries = {
  "parser/index": "src/parser/index.ts",
  "parser/linkedom": "src/parser/linkedom.ts",
  "parser/jsdom": "src/parser/jsdom.ts",
};

export default defineConfig([
  {
    ...shared,
    format: ["esm"],
    entry: ["src/index.ts"],
    clean: true,
    external: editorExternal,
    // marked is ESM-only; bundling it keeps the published package self-contained.
    noExternal: ["marked"],
    banner: editorBanner,
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
    format: ["esm"],
    entry: parserEntries,
    clean: false,
    external: ["linkedom", "jsdom"],
    noExternal: ["marked"],
  },
  {
    ...shared,
    // linkedom's CommonJS build `require`s ESM-only css-select, so the CommonJS adapter bundles linkedom.
    // marked is ESM-only too, so the parser CJS build bundles it (Node < 22.12 cannot require() it).
    format: ["cjs"],
    entry: parserEntries,
    clean: false,
    sourcemap: false,
    external: ["jsdom", "canvas"],
    noExternal: ["marked", "linkedom", /^css-select/, /^css-what/, /^nth-check/, /^boolbase/, /^domutils/, /^domhandler/, /^dom-serializer/, /^domelementtype/, /^entities/, /^htmlparser2/, "cssom", "html-escaper", "uhyphen"],
  },
]);
