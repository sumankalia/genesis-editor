import { fetchPublic, readCapped } from "@/lib/fetch-public";

const MAX_HTML_BYTES = 512 * 1024;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_SIZE = 200;

type Preview = { title?: string; description?: string; image?: string; siteName?: string; favicon?: string };

// In memory, so it works on Vercel (no disk) and forgets everything on a cold start.
const cache = new Map<string, { at: number; preview: Preview }>();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
  });
}

function attributes(tag: string) {
  const attrs: Record<string, string> = {};
  for (const [, name, , double, single, bare] of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[name.toLowerCase()] = decode(double ?? single ?? bare ?? "");
  }
  return attrs;
}

/** Open Graph, Twitter card and plain `<meta>`/`<title>`/`<link rel=icon>` tags, read with patterns (the page is never run). */
function scrape(html: string, page: URL): Preview {
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html;
  const meta = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
  }
  let favicon: string | undefined;
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    if (/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(attrs.rel ?? "") && attrs.href) {
      favicon = attrs.href;
      break;
    }
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const absolute = (value: string | undefined) => {
    if (!value) return undefined;
    try {
      return new URL(value, page).href;
    } catch {
      return undefined;
    }
  };
  return {
    title: meta.get("og:title") ?? meta.get("twitter:title") ?? (title ? decode(title).trim() : undefined),
    description: meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"),
    image: absolute(meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image")),
    siteName: meta.get("og:site_name") ?? page.hostname.replace(/^www\./, ""),
    favicon: absolute(favicon ?? "/favicon.ico"),
  };
}

async function preview(raw: unknown, params: URLSearchParams) {
  const delay = Math.min(Number(params.get("delay")) || 0, 10_000);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (params.get("fail")) return Response.json({ error: "Mock server is set to fail (remove ?fail=1 to succeed)." }, { status: 500 });
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw)) return Response.json({ error: "Missing an http(s) `url`." }, { status: 400 });

  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < CACHE_MS) return Response.json(hit.preview);

  let response: Response;
  let url: URL;
  try {
    ({ response, url } = await fetchPublic(raw, AbortSignal.timeout(10_000), { headers: { Accept: "text/html,application/xhtml+xml" } }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't fetch the page." }, { status: 422 });
  }
  if (!response.ok) return Response.json({ error: `The page answered ${response.status}.` }, { status: 422 });
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "text/html" && type !== "application/xhtml+xml") {
    await response.body?.cancel().catch(() => {});
    return Response.json({ error: "That link isn't a web page." }, { status: 415 });
  }
  const html = new TextDecoder().decode(await readCapped(response, MAX_HTML_BYTES));
  const result = scrape(html, url);
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(raw, { at: Date.now(), preview: result });
  return Response.json(result);
}

/**
 * Mock `linkPreview` endpoint: `GET ?url=` or a JSON `POST` of `{ url }`, answered with
 * `{ title, description, image, siteName, favicon }` from the page's Open Graph tags. Like the
 * re-hosting mock it refuses private addresses and redirects into them (SSRF), reads at most 512 KB
 * of HTML, and keeps results in memory only. `?fail=1` returns a 500; `?delay=<ms>` waits first.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return preview(params.get("url"), params);
}

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  return preview(body.url, params);
}
