import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;

/** Private, loopback, link-local and other non-public ranges. */
function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
    return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a);
  }
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

// The e2e serves "remote" images and pages from 127.0.0.1, so loopback is allowed in development, and in a
// local production build (CI's browser checks) with GENESIS_DEMO_ALLOW_LOOPBACK=1. Never on Vercel.
const allowLoopback =
  !process.env.VERCEL && (process.env.NODE_ENV !== "production" || process.env.GENESIS_DEMO_ALLOW_LOOPBACK === "1");

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs can be fetched.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  for (const address of addresses) {
    const loopback = address === "::1" || address.startsWith("127.");
    if (isPrivateAddress(address) && !(allowLoopback && loopback)) throw new Error("That address isn't public.");
  }
}

/**
 * Fetches with redirects followed by hand, so each hop is checked against private addresses (SSRF). Returns the
 * final response and its URL.
 */
export async function fetchPublic(raw: string, signal: AbortSignal, init: RequestInit = {}) {
  let url = new URL(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const response = await fetch(url, { ...init, redirect: "manual", signal });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return { response, url };
  }
  throw new Error("Too many redirects.");
}

/** Reads at most `limit` bytes of a body, then stops the download. */
export async function readCapped(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return bytes;
}
