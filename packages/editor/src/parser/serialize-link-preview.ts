import { linkPreviewProps, previewDomain } from "./link-preview";
import { escapeAttr, escapeText, type Props } from "./serialize-inline";

/**
 * A link preview as one `<a>` that other apps read as a link (with its image and text), and `parseHTML`
 * reads back from its `data-*` attributes. Every value is cleaned again on the way out.
 */
export function serializeLinkPreview(props: Props, attrs = "") {
  const card = linkPreviewProps(props.url, props);
  if (!card) return "";
  const data = (name: string, value: string) => (value ? ` data-${name}="${escapeAttr(value)}"` : "");
  const domain = previewDomain(card.url);
  const site = [card.siteName, domain].filter((part, i, all) => part && all.indexOf(part) === i).join(" · ");
  const parts = [
    card.image ? `<img src="${escapeAttr(card.image)}" alt="">` : "",
    `<strong>${escapeText(card.title || card.url)}</strong>`,
    card.description ? `<span>${escapeText(card.description)}</span>` : "",
    site ? `<small>${escapeText(site)}</small>` : "",
  ];
  return (
    `<a${attrs} href="${escapeAttr(card.url)}" data-genesis-link-preview` +
    data("title", card.title) +
    data("description", card.description) +
    data("image", card.image) +
    data("site-name", card.siteName) +
    data("favicon", card.favicon) +
    `>${parts.filter(Boolean).join(" ")}</a>`
  );
}
