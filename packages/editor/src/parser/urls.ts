import { REDIRECT_WRAPPERS, TRACKER_HOSTS, TRACKER_PATHS, TRACKING_PARAMS } from "./rules/noise";
import { isSafeUrl } from "./sanitize";

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** Resolves `url` against `base`. Returns whether a relative URL was resolved or left relative. */
export function resolveUrl(url: string, base: string | undefined) {
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return { url: `https:${trimmed}`, relative: false, resolved: true };
  if (ABSOLUTE.test(trimmed) || trimmed.startsWith("#")) return { url: trimmed, relative: false, resolved: false };
  if (!base) return { url: trimmed, relative: true, resolved: false };
  try {
    return { url: new URL(trimmed, base).href, relative: false, resolved: true };
  } catch {
    return { url: trimmed, relative: true, resolved: false };
  }
}

function parse(url: string) {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** Unwraps redirect wrappers (`google.com/url?q=`, `l.facebook.com/l.php?u=`) and removes tracking parameters. */
export function cleanHref(href: string, base: string | undefined): string | undefined {
  let url = resolveUrl(href, base).url;
  for (let hop = 0; hop < 3; hop++) {
    const parsed = parse(url);
    const wrapper = parsed && REDIRECT_WRAPPERS.find((w) => w.host.test(parsed.hostname) && w.path.test(parsed.pathname));
    const target = wrapper && parsed.searchParams.get(wrapper.param);
    if (!target) break;
    url = target;
  }
  const parsed = parse(url);
  if (parsed && /^https?:$/.test(parsed.protocol)) {
    const params = [...parsed.searchParams.keys()];
    if (params.some((key) => TRACKING_PARAMS.test(key))) {
      for (const key of params) if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
      url = parsed.href;
    }
  }
  return isSafeUrl(url) ? url : undefined;
}

export function isTrackerUrl(url: string) {
  const parsed = parse(url);
  if (parsed && TRACKER_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) return true;
  return TRACKER_PATHS.some((pattern) => pattern.test(url));
}

/** The largest candidate of a `srcset` (by width, then density). */
export function largestSrcsetCandidate(srcset: string | null | undefined) {
  if (!srcset) return undefined;
  let best: { url: string; score: number } | undefined;
  for (const candidate of srcset.split(/,\s+(?=\S)/)) {
    const [url, descriptor = "1x"] = candidate.trim().split(/\s+/);
    if (!url) continue;
    const n = parseFloat(descriptor);
    const score = descriptor.endsWith("w") ? n : descriptor.endsWith("x") ? n * 1000 : 0;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url;
}

/**
 * A `srcset` with relative candidates resolved and unusable ones (data:, other schemes, bad descriptors)
 * removed. `undefined` unless at least two candidates remain: one adds nothing over `src`.
 */
export function cleanSrcset(srcset: string | null | undefined, base: string | undefined) {
  if (!srcset) return undefined;
  const out: string[] = [];
  for (const candidate of srcset.split(/,\s+(?=\S)/)) {
    const [raw, descriptor, extra] = candidate.trim().split(/\s+/);
    if (!raw || extra !== undefined || (descriptor && !/^\d+(\.\d+)?[wx]$/.test(descriptor))) continue;
    const url = resolveUrl(raw, base).url;
    if (!/^(https?:\/\/|\/)/i.test(url) || /[\s"<>]/.test(url)) continue;
    out.push(descriptor ? `${url} ${descriptor}` : url);
  }
  return out.length > 1 ? out.join(", ") : undefined;
}

/** Approximate decoded size of a `data:` URL. */
export function dataUrlBytes(url: string) {
  const comma = url.indexOf(",");
  const payload = url.length - comma - 1;
  return /;base64,/i.test(url.slice(0, comma + 1)) ? Math.floor((payload * 3) / 4) : payload;
}
