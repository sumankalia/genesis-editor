import { BUILT_IN_EMBED_PROVIDERS } from "./embed-providers";

/** How an embed's iframe is drawn. `src` is always built by the provider or validated as `https:`. */
export type EmbedFrame = {
  src: string;
  /** CSS aspect ratio, e.g. `"16/9"`. Ignored when `height` is set. */
  aspectRatio?: string;
  /** Fixed height in pixels. */
  height?: number;
  /** Widest the frame gets, in pixels. */
  maxWidth?: number;
  /** Permissions policy. Defaults to `PROVIDER_ALLOW` for providers; generic embeds get none. */
  allow?: string;
  /** Defaults to `PROVIDER_SANDBOX` for providers and `GENERIC_SANDBOX` for generic embeds. */
  sandbox?: string;
};

export type EmbedProvider = {
  /** Stored in the block's `provider` prop. */
  name: string;
  /** Shown in the caption bar, e.g. `"YouTube"`. */
  label: string;
  /** Page URLs this provider embeds, anchored at `^https?://`. Capture groups go to `toEmbed`. */
  match: RegExp[];
  /** Origins its frames load from: the CSP `frame-src` entries, and the only origins `toEmbed` may return. */
  frameOrigins: string[];
  /** Maps a pasted iframe `src` back to the page URL. Without it, the `src` itself is tried against `match`. */
  fromIframe?: (src: URL) => string | null | undefined;
  /** Reads the page URL from the site's own embed markup, e.g. `<blockquote class="twitter-tweet">`. */
  fromHTML?: (el: Element) => string | null | undefined;
  toEmbed: (url: string, match: RegExpMatchArray) => EmbedFrame;
};

export type EmbedOptions = {
  /** `"open"` (the default) allows providers and sandboxed generic iframes; `"allowlist"` allows providers only. */
  policy?: "open" | "allowlist";
  /** Provider names to allow. Defaults to all. */
  providers?: string[];
  /** Generic iframes under the `"open"` policy. Defaults to `true`. */
  generic?: boolean;
};

export const PROVIDER_SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation";
export const PROVIDER_ALLOW = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";
/** No `allow-same-origin`, `allow-forms` or `allow-top-navigation`: the page can't reach its own origin's storage or navigate the app. */
export const GENERIC_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/** Declares an embed provider for the `embedProviders` prop or a plugin's `embeds`. Returns it unchanged. */
export function defineEmbedProvider<const P extends EmbedProvider>(provider: P): P {
  if (!provider.name || !/^[\w-]+$/.test(provider.name)) throw new Error("defineEmbedProvider: the name must be letters, digits, - or _.");
  if (!provider.match.length) throw new Error(`defineEmbedProvider(${provider.name}): match needs at least one pattern.`);
  if (!provider.frameOrigins.length || provider.frameOrigins.some((o) => !/^https:\/\/[^/]+$/.test(o))) {
    throw new Error(`defineEmbedProvider(${provider.name}): frameOrigins must be https origins.`);
  }
  return provider;
}

export type EmbedRegistry = { providers: readonly EmbedProvider[]; generic: boolean; origin?: string };

/** The enabled providers (custom ones first, replacing built-ins of the same name) and whether generic iframes are allowed. */
export function embedRegistry(
  options: EmbedOptions = {},
  extra: readonly EmbedProvider[] = [],
  context: { strict?: boolean; origin?: string } = {},
): EmbedRegistry {
  const seen = new Set<string>();
  const providers = [...extra, ...BUILT_IN_EMBED_PROVIDERS].filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return !options.providers || options.providers.includes(p.name);
  });
  const generic = (options.policy ?? "open") === "open" && options.generic !== false && !context.strict;
  const origin = context.origin ?? (typeof location !== "undefined" ? location.origin : undefined);
  return { providers, generic, origin };
}

export type ResolvedEmbed = {
  /** The provider name, or `""` for a generic iframe. */
  provider: string;
  label: string;
  /** The page URL ("Open ↗" and the link fallback). For generic embeds, the iframe `src`. */
  url: string;
  frame: Required<Pick<EmbedFrame, "src" | "sandbox">> & Omit<EmbedFrame, "src" | "sandbox">;
};

function parse(url: string) {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function fromProvider(provider: EmbedProvider, url: string): ResolvedEmbed | null {
  for (const pattern of provider.match) {
    const match = pattern.exec(url);
    if (!match) continue;
    const frame = provider.toEmbed(url, match);
    const src = parse(frame.src);
    if (!src || src.protocol !== "https:" || !provider.frameOrigins.includes(src.origin)) return null;
    return {
      provider: provider.name,
      label: provider.label,
      url,
      frame: { ...frame, src: src.href, sandbox: frame.sandbox ?? PROVIDER_SANDBOX, allow: frame.allow ?? PROVIDER_ALLOW },
    };
  }
  return null;
}

/** The provider embed for a page URL, or `null` when no enabled provider matches. */
export function embedForUrl(url: string, registry: EmbedRegistry, only?: string): ResolvedEmbed | null {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  for (const provider of registry.providers) {
    if (only !== undefined && provider.name !== only) continue;
    const resolved = fromProvider(provider, trimmed);
    if (resolved) return resolved;
  }
  return null;
}

/** Whether a generic iframe may show this URL: `https:`, no credentials, and not the app's own origin. */
export function genericAllowed(src: string, registry: EmbedRegistry) {
  const url = parse(src);
  if (!registry.generic || !url || url.protocol !== "https:" || url.username || url.password) return false;
  return !registry.origin || url.origin !== registry.origin;
}

function generic(src: string): ResolvedEmbed {
  const url = parse(src)!;
  return { provider: "", label: url.host, url: url.href, frame: { src: url.href, sandbox: GENERIC_SANDBOX } };
}

/**
 * A pasted iframe: the provider embed rebuilt from its page URL, else a sandboxed generic embed when
 * the policy allows it, else `null`. Only the `src` is read; pasted `sandbox`/`allow` are never trusted.
 */
export function embedForIframe(src: string, registry: EmbedRegistry): ResolvedEmbed | null {
  const url = parse(src.trim());
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
  for (const provider of registry.providers) {
    const page = provider.fromIframe ? provider.fromIframe(url) : url.href;
    const resolved = page ? fromProvider(provider, page) : null;
    if (resolved) return resolved;
  }
  return genericAllowed(url.href, registry) ? generic(url.href) : null;
}

/** A site's embed markup (tweets, Instagram posts, TikToks) as a provider embed. */
export function embedForElement(el: Element, registry: EmbedRegistry): ResolvedEmbed | null {
  for (const provider of registry.providers) {
    const page = provider.fromHTML?.(el);
    const resolved = page ? fromProvider(provider, page) : null;
    if (resolved) return resolved;
  }
  return null;
}

export type EmbedProps = { provider?: string; url?: string; embedUrl?: string };

/**
 * How a stored embed block may be drawn: a provider block is rebuilt from its `url` (a stored
 * `embedUrl` is never trusted for providers), a generic one is validated again. `null` → show a link.
 */
export function resolveEmbedBlock(props: EmbedProps, registry: EmbedRegistry): ResolvedEmbed | null {
  if (props.provider) {
    const resolved = props.url ? embedForUrl(props.url, registry, props.provider) : null;
    if (resolved) return resolved;
  }
  const src = props.embedUrl || props.url;
  if (!props.provider && src && genericAllowed(src, registry)) return generic(src);
  return null;
}

/** The CSP `frame-src` origins for the enabled providers. Generic embeds can load any `https:` origin, so they need `https:` too. */
export function getEmbedFrameSrc(options: EmbedOptions = {}, extra: readonly EmbedProvider[] = []): string[] {
  const registry = embedRegistry(options, extra, { origin: "" });
  const origins = new Set(registry.providers.flatMap((p) => p.frameOrigins));
  if (registry.generic) origins.add("https:");
  return [...origins];
}

export type EmbedExtras = { title?: string; caption?: string; aspectRatio?: string; height?: number; previewWidth?: number };

/** The `embed` block props for a resolved embed. A fixed height wins over an aspect ratio. */
export function embedBlockProps(resolved: ResolvedEmbed, extras: EmbedExtras = {}) {
  const props: Record<string, string | number> = { provider: resolved.provider, url: resolved.url, embedUrl: resolved.frame.src };
  const height = extras.height ?? resolved.frame.height;
  const aspectRatio = extras.aspectRatio ?? resolved.frame.aspectRatio;
  if (height) props.height = height;
  else if (aspectRatio) props.aspectRatio = aspectRatio;
  if (extras.title) props.title = extras.title;
  if (extras.caption) props.caption = extras.caption;
  if (extras.previewWidth) props.previewWidth = extras.previewWidth;
  return props;
}

/** A stored aspect ratio such as `"16/9"` or `"1.5/1"`, or `undefined` when it isn't one. */
export function cleanAspectRatio(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{1,5}(?:\.\d{1,3})?)\s*\/\s*(\d{1,5}(?:\.\d{1,3})?)$/);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) return undefined;
  return `${match[1]}/${match[2]}`;
}
