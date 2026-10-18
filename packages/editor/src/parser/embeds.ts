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

/** A site's official widget script, e.g. `{ src: "https://platform.twitter.com/widgets.js" }`. */
export type EmbedScript = { src: string; attrs?: Record<string, string> };

/**
 * The site's own embed code: usually a `<blockquote>` plus a `<script>` (tweets, Threads, Bluesky, Reddit…),
 * sometimes a `<div>`, an `<a>` or a script alone. Only the markup is read; a pasted script never runs.
 */
export type EmbedSnippet = {
  /** CSS selector for the snippet's root, e.g. `"blockquote.twitter-tweet"`. A `script[…]` selector reads a script-only snippet's attributes. */
  selector: string;
  /** The page URL in the snippet; it must match the provider's `match`. */
  url: (el: Element) => string | null | undefined;
  /** When `url` doesn't match (e.g. a Mastodon server that isn't listed): an iframe `src` to try as a sandboxed generic embed. */
  frame?: (el: Element) => string | null | undefined;
  /** The fallback text, when it isn't the snippet's own text (e.g. Flickr's `title`). */
  text?: (el: Element) => string | null | undefined;
  /** Sizes the snippet carries, e.g. Reddit's `data-embed-height` or Flickr's image size. */
  size?: (el: Element) => { height?: number; aspectRatio?: string } | undefined;
  /**
   * Rebuilds the site's snippet (without its script) for export. `body` is the fallback text as `<p>`
   * lines, the last one linked to `url`; everything else must be escaped by the provider.
   */
  toHTML?: (url: string, body: string, match: RegExpMatchArray, lines: string[]) => string;
  /** The official script: written with `toHTML({ embedScripts: true })`, and run inside the sandbox by `render: "widget"` providers. */
  script?: string | ((url: string, match: RegExpMatchArray) => EmbedScript);
};

export type EmbedProvider = {
  /** Stored in the block's `provider` prop. */
  name: string;
  /** Shown in the caption bar, e.g. `"YouTube"`. */
  label: string;
  /** Page URLs this provider embeds, anchored at `^https?://`. Capture groups go to `toEmbed`. */
  match: RegExp[];
  /**
   * Origins its frames load from: the CSP `frame-src` entries, and the only origins `toEmbed` may return.
   * For `render: "widget"` providers, the origins their script loads from.
   */
  frameOrigins: string[];
  /** Maps a pasted iframe `src` back to the page URL. Without it, the `src` itself is tried against `match`. */
  fromIframe?: (src: URL) => string | null | undefined;
  /** The site's own embed code (blockquote, div, link or script), read on paste and load and written back on export. */
  snippet?: EmbedSnippet;
  /** @deprecated Use `snippet`. Reads the page URL from the site's embed markup. */
  fromHTML?: (el: Element) => string | null | undefined;
  /**
   * `"iframe"` (the default): `toEmbed` returns the frame URL. `"widget"`, for sites that offer no frame
   * URL: `toEmbed` returns the script URL, and the snippet plus that script run in a sandboxed frame with
   * an opaque origin, so the script can't reach the app.
   */
  render?: "iframe" | "widget";
  /** Keep a pasted iframe's `width`/`height` as the aspect ratio (GIFs, photos), instead of the provider's size. */
  pastedSize?: boolean;
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
/** Widget frames (`srcdoc`) never get `allow-same-origin`: with it, the document would share the app's origin. */
export const WIDGET_SANDBOX = GENERIC_SANDBOX;

/** Declares an embed provider for the `embedProviders` prop or a plugin's `embeds`. Returns it unchanged. */
export function defineEmbedProvider<const P extends EmbedProvider>(provider: P): P {
  if (!provider.name || !/^[\w-]+$/.test(provider.name)) throw new Error("defineEmbedProvider: the name must be letters, digits, - or _.");
  if (!provider.match.length) throw new Error(`defineEmbedProvider(${provider.name}): match needs at least one pattern.`);
  if (!provider.frameOrigins.length || provider.frameOrigins.some((o) => !/^https:\/\/[^/]+$/.test(o))) {
    throw new Error(`defineEmbedProvider(${provider.name}): frameOrigins must be https origins.`);
  }
  if (provider.render === "widget" && !provider.snippet?.script) {
    throw new Error(`defineEmbedProvider(${provider.name}): widget providers need snippet.script.`);
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
  /** `"widget"`: `frame.src` is the provider's script, run in a sandboxed `srcdoc` frame (`widgetDocument`). */
  render: "iframe" | "widget";
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
    if (provider.render === "widget") {
      return { provider: provider.name, label: provider.label, url, render: "widget", frame: { ...frame, src: src.href, sandbox: WIDGET_SANDBOX, allow: undefined } };
    }
    return {
      provider: provider.name,
      label: provider.label,
      url,
      render: "iframe",
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
  return { provider: "", label: url.host, url: url.href, render: "iframe", frame: { src: url.href, sandbox: GENERIC_SANDBOX } };
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

export type SnippetEmbed = {
  resolved: ResolvedEmbed;
  /** The snippet's readable text, one line per paragraph; `""` when it's only the link. */
  fallback: string;
  size?: { height?: number; aspectRatio?: string };
};

const selectors = new WeakMap<EmbedRegistry, { all: string; scripts: string }>();

/** The enabled providers' snippet selectors, combined: `all` for the walk, `scripts` for script-only snippets. */
export function snippetSelectors(registry: EmbedRegistry) {
  let cached = selectors.get(registry);
  if (!cached) {
    const list = registry.providers.flatMap((p) => (p.snippet ? p.snippet.selector.split(",").map((s) => s.trim()) : []));
    cached = { all: list.join(", "), scripts: list.filter((s) => /^script\b/i.test(s)).join(", ") };
    selectors.set(registry, cached);
  }
  return cached;
}

const SKIP_TEXT = new Set(["script", "style", "svg", "noscript", "template", "iframe", "button"]);
const LINE_TAGS = new Set(["p", "div", "section", "article", "blockquote", "li", "ul", "ol", "figure", "figcaption", "header", "footer", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "table", "tr"]);
const MAX_LINES = 12;
const MAX_LINE = 500;

/** A snippet's visible text as lines: one per paragraph or `<br>`, whitespace collapsed, empty lines dropped. */
export function snippetLines(el: Element): string[] {
  const lines: string[] = [];
  let line = "";
  const end = () => {
    const text = line.replace(/\s+/g, " ").trim();
    if (text && lines.length < MAX_LINES) lines.push(text.slice(0, MAX_LINE));
    line = "";
  };
  const walk = (node: Node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) line += child.nodeValue ?? "";
      if (child.nodeType !== 1) continue;
      const tag = child.nodeName.toLowerCase();
      if (SKIP_TEXT.has(tag)) continue;
      if (tag === "br") {
        end();
        continue;
      }
      const block = LINE_TAGS.has(tag);
      if (block) end();
      walk(child);
      if (block) end();
    }
  };
  walk(el);
  end();
  return lines;
}

/** Stored fallback text: `""` when it only repeats the page URL. */
function fallbackText(lines: string[], url: string) {
  const same = (a: string) => a.replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#].*$/, "");
  if (!lines.length || (lines.length === 1 && /^https?:\/\/\S+$/.test(lines[0]) && same(lines[0]) === same(url))) return "";
  return lines.join("\n");
}

/** A site's embed code (blockquote, div, link or script-only snippet), or the deprecated `fromHTML` markup, as a provider embed. */
export function embedForSnippet(el: Element, registry: EmbedRegistry): SnippetEmbed | null {
  for (const provider of registry.providers) {
    const snippet = provider.snippet;
    let resolved: ResolvedEmbed | null = null;
    if (snippet && el.matches?.(snippet.selector)) {
      const url = snippet.url(el)?.trim();
      resolved = url ? fromProvider(provider, url) : null;
      const frame = !resolved ? snippet.frame?.(el)?.trim() : undefined;
      if (frame) resolved = embedForIframe(frame, registry);
      if (resolved) {
        const custom = el.nodeName.toLowerCase() === "script" ? "" : snippet.text?.(el)?.replace(/\s+/g, " ").trim();
        const lines = custom !== undefined ? (custom ? [custom.slice(0, MAX_LINE)] : []) : snippetLines(el);
        return { resolved, fallback: fallbackText(lines, resolved.url), size: snippet.size?.(el) };
      }
    }
    const page = !snippet ? provider.fromHTML?.(el) : null;
    resolved = page ? fromProvider(provider, page) : null;
    if (resolved) return { resolved, fallback: fallbackText(snippetLines(el), resolved.url) };
  }
  return null;
}

/** @deprecated Use `embedForSnippet`. */
export function embedForElement(el: Element, registry: EmbedRegistry): ResolvedEmbed | null {
  return embedForSnippet(el, registry)?.resolved ?? null;
}

export type MarkupEmbed = SnippetEmbed & { snippet: boolean; title?: string; aspectRatio?: string };

/** The first embed in pasted embed code: a site snippet (script-only ones included), else an `<iframe>`. Nothing is run. */
export function embedForMarkup(root: Element, registry: EmbedRegistry): MarkupEmbed | null {
  const { all } = snippetSelectors(registry);
  for (const el of Array.from(root.querySelectorAll(all ? `${all}, iframe` : "iframe"))) {
    const isFrame = el.nodeName.toLowerCase() === "iframe";
    const found = !isFrame ? embedForSnippet(el, registry) : null;
    if (found) return { ...found, snippet: true };
    const src = isFrame ? el.getAttribute("src") : null;
    const resolved = src ? embedForIframe(src, registry) : null;
    if (!resolved) continue;
    const width = Number(el.getAttribute("width"));
    const height = Number(el.getAttribute("height"));
    const sized = !resolved.provider || registry.providers.find((p) => p.name === resolved.provider)?.pastedSize;
    const aspectRatio = sized ? (width > 0 && height > 0 ? cleanAspectRatio(`${width}/${height}`) : resolved.provider ? undefined : "16/9") : undefined;
    return { resolved, fallback: "", snippet: false, title: el.getAttribute("title")?.trim() || undefined, aspectRatio };
  }
  return null;
}

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (value: string) => escapeText(value).replace(/"/g, "&quot;");

/** Fallback lines as `<p>`s, the last one linked to `url` (widget scripts look for that link). */
export function snippetBody(url: string, lines: readonly string[]) {
  const link = (text: string) => `<a href="${escapeAttr(url)}">${escapeText(text)}</a>`;
  if (!lines.length) return `<p>${link(url)}</p>`;
  return lines.map((line, i) => `<p>${i === lines.length - 1 ? link(line) : escapeText(line)}</p>`).join("");
}

function providerFor(resolved: ResolvedEmbed, registry: EmbedRegistry) {
  const provider = registry.providers.find((p) => p.name === resolved.provider);
  const match = provider?.match.map((pattern) => pattern.exec(resolved.url)).find(Boolean);
  return provider && match ? { provider, match } : null;
}

const linesOf = (fallback: string) => fallback.split("\n").map((line) => line.trim()).filter(Boolean);

/** The site's canonical snippet for an embed, without its script, or `null` when the provider has none. */
export function embedSnippetHTML(resolved: ResolvedEmbed, fallback: string, registry: EmbedRegistry): string | null {
  const found = providerFor(resolved, registry);
  const lines = linesOf(fallback);
  const body = snippetBody(resolved.url, lines);
  if (found?.provider.snippet?.toHTML) return found.provider.snippet.toHTML(resolved.url, body, found.match, lines);
  return resolved.render === "widget" ? body : null;
}

/** The provider's official script for an embed, validated as `https:`. */
export function embedScript(resolved: ResolvedEmbed, registry: EmbedRegistry): EmbedScript | null {
  const found = providerFor(resolved, registry);
  const script = found?.provider.snippet?.script;
  if (!found || !script) return null;
  const value = typeof script === "string" ? { src: script } : script(resolved.url, found.match);
  return parse(value.src)?.protocol === "https:" ? value : null;
}

/** `<script async src=…>` for an embed's official script, attributes escaped. */
export function embedScriptTag(script: EmbedScript) {
  const attrs = Object.entries(script.attrs ?? {})
    .filter(([name]) => /^[a-z][\w-]*$/i.test(name) && !/^on/i.test(name) && name.toLowerCase() !== "src")
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join("");
  return `<script async src="${escapeAttr(script.src)}"${attrs} charset="utf-8"></script>`;
}

/** Posts the document height to the parent; the editor matches it to the frame by `event.source`. */
const WIDGET_RESIZE =
  "new ResizeObserver(function(){parent.postMessage({genesisEmbedHeight:document.documentElement.scrollHeight},'*')}).observe(document.documentElement)";

/**
 * The `srcdoc` for a `render: "widget"` embed: the snippet rebuilt from the stored URL and text (never the
 * pasted markup), the provider's own script, and a height reporter. It must be framed with `WIDGET_SANDBOX`.
 */
export function widgetDocument(resolved: ResolvedEmbed, fallback: string, registry: EmbedRegistry): string | null {
  if (resolved.render !== "widget") return null;
  const script = embedScript(resolved, registry);
  if (!script) return null;
  // A script-only snippet (Gist) has no markup of its own; the export's readable link stays out of the frame.
  const markup = providerFor(resolved, registry)?.provider.snippet?.toHTML ? (embedSnippetHTML(resolved, fallback, registry) ?? "") : "";
  return (
    `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
    `<style>html,body{margin:0;font:14px/1.5 system-ui,sans-serif}body{overflow:auto}</style></head>` +
    `<body>${markup}${embedScriptTag(script).replace(" async", "")}<script>${WIDGET_RESIZE}</script></body></html>`
  );
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
  const origins = new Set(registry.providers.filter((p) => p.render !== "widget").flatMap((p) => p.frameOrigins));
  if (registry.generic) origins.add("https:");
  return [...origins];
}

/**
 * The CSP `script-src` origins widget embeds need. Their `srcdoc` frames inherit the app's policy, which
 * must also allow the frames' small inline height reporter (or the frame keeps its default height).
 */
export function getEmbedScriptSrc(options: EmbedOptions = {}, extra: readonly EmbedProvider[] = []): string[] {
  const registry = embedRegistry(options, extra, { origin: "" });
  return [...new Set(registry.providers.filter((p) => p.render === "widget").flatMap((p) => p.frameOrigins))];
}

export type EmbedExtras = {
  title?: string;
  caption?: string;
  aspectRatio?: string;
  height?: number;
  previewWidth?: number;
  /** The snippet's text, shown while the frame loads or when it can't. */
  fallback?: string;
  /** Came from the site's embed code; exported back as that code. */
  snippet?: boolean;
};

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
  if (extras.fallback) props.fallback = extras.fallback;
  const result: Record<string, string | number | boolean> = props;
  if (extras.snippet) result.snippet = true;
  return result;
}

/** A stored aspect ratio such as `"16/9"` or `"1.5/1"`, or `undefined` when it isn't one. */
export function cleanAspectRatio(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{1,5}(?:\.\d{1,3})?)\s*\/\s*(\d{1,5}(?:\.\d{1,3})?)$/);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) return undefined;
  return `${match[1]}/${match[2]}`;
}
