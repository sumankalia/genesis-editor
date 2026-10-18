import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as ("esm" | "cjs")[],
  dts: true,
  sourcemap: true,
  target: "es2020",
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts"],
    clean: true,
    external: ["react", "react-dom", /^@blocknote\//, "lucide-react", "prosemirror-state", "prosemirror-history"],
    // The editor relies on hooks and browser APIs, so it must be a client component in React Server Components apps.
    banner: { js: '"use client";' },
  },
  {
    ...shared,
    // The parser is pure and also runs on servers, so it gets no "use client" banner.
    entry: { "parser/index": "src/parser/index.ts", "parser/linkedom": "src/parser/linkedom.ts" },
    clean: false,
    external: ["linkedom"],
  },
]);
