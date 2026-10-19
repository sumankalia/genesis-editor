import { isSafeUrl } from "./sanitize";

/** What a link preview endpoint or `resolve` returns. Every field is optional. */
export type LinkPreviewMeta = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
};

/** The props of a `linkPreview` block. */
export type LinkPreviewProps = Required<LinkPreviewMeta> & { url: string };

const LIMITS = { title: 300, description: 1000, siteName: 100 } as const;

/** An absolute http(s) URL, or undefined. */
export function cleanPreviewUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return undefined;
  let url: URL;
  try {
    url = new URL(value.trim(), base);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  return isSafeUrl(url.href) ? url.href : undefined;
}

/** One line of plain text: control characters removed, whitespace collapsed, capped at `max` characters. */
export function cleanPreviewText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Block props for a page and its (untrusted) metadata; null when `url` isn't an http(s) URL. */
export function linkPreviewProps(url: unknown, meta: unknown = {}): LinkPreviewProps | null {
  const page = cleanPreviewUrl(url);
  if (!page) return null;
  const raw = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  return {
    url: page,
    title: cleanPreviewText(raw.title, LIMITS.title),
    description: cleanPreviewText(raw.description, LIMITS.description),
    siteName: cleanPreviewText(raw.siteName, LIMITS.siteName),
    image: cleanPreviewUrl(raw.image, page) ?? "",
    favicon: cleanPreviewUrl(raw.favicon, page) ?? "",
  };
}

/** The host without `www.`, or "" for an unparsable URL. */
export function previewDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
