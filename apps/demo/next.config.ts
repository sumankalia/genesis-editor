import path from "node:path";
import type { NextConfig } from "next";

// pnpm hoists dependencies to the workspace root.
const workspaceRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The floating dev badge sits on top of the mobile block toolbar.
  devIndicators: false,
  partialPrefetching: true,
  outputFileTracingRoot: workspaceRoot,
  // Pages read these at render time ("use cache" with cacheLife("max")). They're prerendered at
  // build, but a revalidation runs on the server, where only traced files exist.
  outputFileTracingIncludes: {
    "/**": ["./src/components/examples/**/*"],
    "/docs/{api,tools}": [
      "../../packages/editor/src/**/*.{ts,tsx}",
      "../../packages/editor/tsconfig.json",
      "../../node_modules/.pnpm/typescript@*/node_modules/typescript/lib/lib.*.d.ts",
    ],
  },
  turbopack: {
    root: workspaceRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
