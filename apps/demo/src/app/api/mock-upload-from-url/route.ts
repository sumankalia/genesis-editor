import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { MAX_UPLOAD_BYTES, saveUpload } from "../mock-upload/store";

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

// The e2e serves "remote" images from 127.0.0.1, so loopback is allowed in development, and in a
// local production build (CI's browser checks) with GENESIS_DEMO_ALLOW_LOOPBACK=1. Never on Vercel.
const allowLoopback =
  !process.env.VERCEL && (process.env.NODE_ENV !== "production" || process.env.GENESIS_DEMO_ALLOW_LOOPBACK === "1");

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs can be copied.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  for (const address of addresses) {
    const loopback = address === "::1" || address.startsWith("127.");
    if (isPrivateAddress(address) && !(allowLoopback && loopback)) throw new Error("That address isn't public.");
  }
}

/** Fetches with redirects followed by hand, so each hop is checked against private addresses. */
async function fetchPublic(raw: string, signal: AbortSignal) {
  let url = new URL(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const response = await fetch(url, { redirect: "manual", signal });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return response;
  }
  throw new Error("Too many redirects.");
}

/**
 * Mock `uploadFromUrl` endpoint: POST JSON `{ url, alt?, filename? }`; the server downloads the
 * image and stores it like `/api/mock-upload`, responding with `{ url }`. It refuses private
 * addresses (SSRF), redirects into them, non-raster types and files over 10 MB.
 * Query params for testing: `?fail=1` returns a 500, `?status=<code>` returns that status, `?delay=<ms>` waits first.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const delay = Math.min(Number(params.get("delay")) || 0, 10_000);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (params.get("fail")) {
    return Response.json({ error: "Mock server is set to fail (remove ?fail=1 to succeed)." }, { status: 500 });
  }
  const status = Number(params.get("status"));
  if (status >= 400 && status < 600) return Response.json({ error: `Mock status ${status}.` }, { status });

  let body: { url?: unknown; filename?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (typeof body.url !== "string") return Response.json({ error: "Missing `url`." }, { status: 400 });

  let response: Response;
  try {
    response = await fetchPublic(body.url, AbortSignal.timeout(20_000));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't fetch the image." }, { status: 422 });
  }
  if (!response.ok) return Response.json({ error: `The image host answered ${response.status}.` }, { status: 422 });
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  // SVG is refused because it is served from this origin and can carry script.
  if (!type.startsWith("image/") || type === "image/svg+xml") {
    return Response.json({ error: "Only raster images (PNG, JPEG, GIF, WebP, …) are accepted." }, { status: 415 });
  }
  if (Number(response.headers.get("content-length")) > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) return Response.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });

  const name = typeof body.filename === "string" ? body.filename.slice(0, 200) : "image";
  const id = await saveUpload(bytes, { type, name });
  return Response.json({ url: `/api/mock-upload/${id}` });
}
