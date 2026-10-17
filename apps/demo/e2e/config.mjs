import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The running demo, e.g. `pnpm dev` (port 4317) or `pnpm start`. */
export const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:4317").replace(/\/$/, "");
/** Set `E2E_CHANNEL=chrome` to use an installed Chrome instead of Playwright's Chromium. */
export const launchOptions = { headless: true, channel: process.env.E2E_CHANNEL || undefined };
export const SHOTS = process.env.E2E_SCREENSHOTS ?? join(here, "screenshots");
export const fixture = (name) => join(here, "fixtures", name);

mkdirSync(SHOTS, { recursive: true });
