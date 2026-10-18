import {
  cleanAspectRatio,
  cleanFallback,
  embedScript,
  embedScriptTag,
  embedSnippetHTML,
  resolveEmbedBlock,
  type EmbedRegistry,
} from "./embeds";
import { escapeAttr, escapeText, type Props } from "./serialize-inline";

export type EmbedEnv = {
  embeds: "auto" | "iframe" | "link";
  registry: EmbedRegistry;
  /** Official script `src`s already written, when `embedScripts` is on. */
  scripts?: Set<string>;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const positiveInt = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined);
const paragraphs = (lines: readonly string[]) => lines.map((line) => `<p>${escapeText(line)}</p>`).join("");

/**
 * `<figure data-genesis-embed>` in one of three forms: the site's own embed code (`"snippet"`, rebuilt from
 * the stored URL and text, never the pasted markup), our iframe (provider frames rebuilt from the page URL),
 * or a link with the fallback text for email and RSS. Unusable embeds become a link paragraph.
 */
export function serializeEmbed(props: Props, attrs: string, env: EmbedEnv) {
  const { registry } = env;
  const resolved = resolveEmbedBlock({ provider: str(props.provider), url: str(props.url), embedUrl: str(props.embedUrl) }, registry);
  const title = str(props.title);
  const fallback = cleanFallback(str(props.fallback));
  const lines = fallback ? fallback.split("\n") : [];
  const caption = str(props.caption) ? `<figcaption>${escapeText(str(props.caption))}</figcaption>` : "";
  if (!resolved) {
    const url = str(props.url);
    if (!/^https?:\/\//i.test(url)) return "";
    return `${paragraphs(lines)}<p${attrs}><a href="${escapeAttr(url)}">${escapeText(title || url)}</a></p>${caption ? `<p>${escapeText(str(props.caption))}</p>` : ""}`;
  }
  const height = positiveInt(props.height);
  const aspectRatio = height ? undefined : cleanAspectRatio(str(props.aspectRatio)) ?? resolved.frame.aspectRatio ?? "16/9";
  const width = positiveInt(props.previewWidth) ?? resolved.frame.maxWidth;
  const snippet =
    env.embeds !== "link" && (resolved.render === "widget" || (env.embeds === "auto" && props.snippet === true))
      ? embedSnippetHTML(resolved, fallback, registry)
      : null;
  const form = env.embeds === "link" ? "link" : snippet !== null ? "snippet" : "";
  const data =
    ` data-genesis-embed${form ? `="${form}"` : ""} data-provider="${escapeAttr(resolved.provider)}" data-url="${escapeAttr(resolved.url)}"` +
    (height ? ` data-height="${height}"` : ` data-aspect-ratio="${escapeAttr(aspectRatio!)}"`) +
    (positiveInt(props.previewWidth) ? ` data-preview-width="${props.previewWidth}"` : "") +
    (title ? ` data-title="${escapeAttr(title)}"` : "") +
    (fallback && snippet === null ? ` data-fallback="${escapeAttr(fallback)}"` : "") +
    (props.snippet === true && snippet === null ? " data-snippet" : "");
  const style = width ? ` style="max-width:${width}px"` : "";
  if (snippet !== null) return `<figure${attrs}${data}${style}>${snippet}${caption}</figure>${scriptFor(resolved, env)}`;
  if (form === "link") {
    const quote = lines.length ? `<blockquote>${paragraphs(lines)}</blockquote>` : "";
    return `<figure${attrs}${data}${style}>${quote}<a href="${escapeAttr(resolved.url)}">${escapeText(title || `${resolved.label}: ${resolved.url}`)}</a>${caption}</figure>`;
  }
  const generic = !resolved.provider;
  const frame =
    `<iframe src="${escapeAttr(resolved.frame.src)}" title="${escapeAttr(title || `${resolved.label} embed`)}" loading="lazy"` +
    ` referrerpolicy="${generic ? "no-referrer" : "strict-origin-when-cross-origin"}" sandbox="${escapeAttr(resolved.frame.sandbox)}"` +
    (resolved.frame.allow ? ` allow="${escapeAttr(resolved.frame.allow)}" allowfullscreen` : "") +
    (generic ? " credentialless" : "") +
    ` style="width:100%;border:0;${height ? `height:${height}px` : `aspect-ratio:${aspectRatio}`}"></iframe>`;
  return `<figure${attrs}${data}${style}>${frame}${caption}</figure>`;
}

/** The provider's official script, once per document per `src`, when `embedScripts` is on. */
function scriptFor(resolved: Parameters<typeof embedScript>[0], env: EmbedEnv) {
  if (!env.scripts) return "";
  const script = embedScript(resolved, env.registry);
  // Scripts with per-embed attributes (Telegram) are written for every embed.
  const key = script && !script.attrs ? script.src : undefined;
  if (!script || (key && env.scripts.has(key))) return "";
  if (key) env.scripts.add(key);
  return embedScriptTag(script);
}
