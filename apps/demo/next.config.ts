import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The floating dev badge sits on top of the mobile block toolbar.
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    // pnpm hoists dependencies to the workspace root.
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
