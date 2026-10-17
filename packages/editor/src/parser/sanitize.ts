import { ELEMENT_NODE, TEXT_NODE } from "./dom";
import type { ReportBuilder } from "./report";
import { TRACKING_DATA_ATTRIBUTE } from "./rules/noise";
import { ALLOWED_ATTRIBUTES, DROP_REASONS, TAG_CLASSES, URL_ATTRIBUTES } from "./rules/tags";

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i;
const UNSAFE_STYLE = /expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|@import/i;

/**
 * Whether a URL is safe to keep. Relative URLs and `#fragments` are allowed; `data:` only for raster
 * images (`allowDataImage`). Control characters and whitespace are ignored when reading the scheme, so
 * `java\tscript:` is caught.
 */
export function isSafeUrl(url: string, allowDataImage = false) {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what browsers ignore in schemes
  const compact = url.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase();
  if (!scheme) return true;
  if (scheme === "data") return allowDataImage && SAFE_DATA_IMAGE.test(url.trim());
  return SAFE_SCHEMES.has(scheme);
}

function keepsInput(element: Element) {
  return element.getAttribute("type")?.toLowerCase() === "checkbox" && !!element.closest?.("li");
}

/**
 * Allow-list sanitizer that works on any DOM (browser or linkedom). Removes dangerous elements with
 * their content, comments, unknown attributes (every `on*` handler included), unsafe URLs, and unsafe
 * `style` values. Runs before mapping; `toHTML` re-checks everything it writes.
 *
 * DOMPurify isn't used: on linkedom it returns its input unchanged, scripts and handlers included.
 */
export function sanitizeTree(root: Element, report: ReportBuilder) {
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    for (let child = node.firstChild; child; ) {
      const next = child.nextSibling;
      if (child.nodeType === ELEMENT_NODE) {
        if (sanitizeElement(child as Element, report)) stack.push(child);
      } else if (child.nodeType !== TEXT_NODE) {
        node.removeChild(child);
      }
      child = next;
    }
  }
}

/** Returns false when the element was removed. */
function sanitizeElement(element: Element, report: ReportBuilder) {
  const tag = element.nodeName.toLowerCase();
  if (TAG_CLASSES[tag] === "drop" && !(tag === "input" && keepsInput(element))) {
    report.drop(tag, DROP_REASONS[tag] ?? "unsupported", DROP_REASONS[tag] ? undefined : element.textContent);
    element.parentNode?.removeChild(element);
    return false;
  }
  for (const { name, value } of Array.from(element.attributes)) {
    const attr = name.toLowerCase();
    if ((!ALLOWED_ATTRIBUTES.has(attr) && !attr.startsWith("data-")) || TRACKING_DATA_ATTRIBUTE.test(attr)) {
      element.removeAttribute(name);
      if (attr.startsWith("on")) report.drop(`${tag}[${attr}]`, "unsafe");
    } else if (URL_ATTRIBUTES.has(attr) && !isSafeUrl(value, attr === "src" || attr === "poster")) {
      element.removeAttribute(name);
      report.drop(`${tag}[${attr}]`, "unsafe");
    } else if (attr === "srcset" || attr.endsWith("srcset")) {
      if (value.split(",").some((candidate) => !isSafeUrl(candidate.trim().split(/\s+/)[0] ?? "", true))) {
        element.removeAttribute(name);
        report.drop(`${tag}[${attr}]`, "unsafe");
      }
    } else if (attr.startsWith("data-") && /src$/.test(attr) && !isSafeUrl(value, true)) {
      element.removeAttribute(name);
    } else if (attr === "style" && UNSAFE_STYLE.test(value)) {
      element.removeAttribute(name);
      report.drop(`${tag}[style]`, "unsafe");
    }
  }
  return true;
}
