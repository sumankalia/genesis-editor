import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom", /^@blocknote\//, "lucide-react", "prosemirror-state"],
  // The editor relies on hooks and browser APIs, so it must be a client component in React Server Components apps.
  banner: { js: '"use client";' },
});
