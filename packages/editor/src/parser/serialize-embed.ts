import { cleanAspectRatio, resolveEmbedBlock, type EmbedRegistry } from "./embeds";
import { escapeAttr, escapeText, type Props } from "./serialize-inline";

const str = (value: unknown) => (typeof value === "string" ? value : "");
const positiveInt = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined);

/**
 * `<figure data-genesis-embed>` with our own iframe attributes (provider frames rebuilt from the
 * page URL), or with a link instead of the iframe for email and RSS. Unusable embeds become a link.
 */
export function serializeEmbed(props: Props, attrs: string, form: "iframe" | "link", registry: EmbedRegistry) {
  const resolved = resolveEmbedBlock({ provider: str(props.provider), url: str(props.url), embedUrl: str(props.embedUrl) }, registry);
  const title = str(props.title);
  const caption = str(props.caption) ? `<figcaption>${escapeText(str(props.caption))}</figcaption>` : "";
  if (!resolved) {
    const url = str(props.url);
    if (!/^https?:\/\//i.test(url)) return "";
    return `<p${attrs}><a href="${escapeAttr(url)}">${escapeText(title || url)}</a></p>${caption ? `<p>${escapeText(str(props.caption))}</p>` : ""}`;
  }
  const height = positiveInt(props.height);
  const aspectRatio = height ? undefined : cleanAspectRatio(str(props.aspectRatio)) ?? resolved.frame.aspectRatio ?? "16/9";
  const width = positiveInt(props.previewWidth) ?? resolved.frame.maxWidth;
  const data =
    ` data-genesis-embed${form === "link" ? '="link"' : ""} data-provider="${escapeAttr(resolved.provider)}" data-url="${escapeAttr(resolved.url)}"` +
    (height ? ` data-height="${height}"` : ` data-aspect-ratio="${escapeAttr(aspectRatio!)}"`) +
    (positiveInt(props.previewWidth) ? ` data-preview-width="${props.previewWidth}"` : "") +
    (title ? ` data-title="${escapeAttr(title)}"` : "");
  const style = width ? ` style="max-width:${width}px"` : "";
  if (form === "link") {
    return `<figure${attrs}${data}${style}><a href="${escapeAttr(resolved.url)}">${escapeText(title || `${resolved.label}: ${resolved.url}`)}</a>${caption}</figure>`;
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
