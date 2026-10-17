/**
 * What the parser needs from a DOM implementation: turn an HTML string into a `Document` with a `body`.
 * The parser only reads `childNodes`, `nodeType`, `nodeName`, attributes, and text, and removes nodes,
 * so any spec-like DOM works.
 */
export type DomAdapter = {
  parse(html: string): Document;
};

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

/** The browser's `DOMParser`. */
export const browserDom: DomAdapter = {
  parse(html) {
    return new DOMParser().parseFromString(html, "text/html");
  },
};

export function defaultDom(): DomAdapter {
  if (typeof DOMParser === "undefined") {
    throw new Error(
      'genesis-editor/parser: no DOMParser here. Pass `dom`, e.g. `import { linkedomDom } from "genesis-editor/parser/linkedom"`.',
    );
  }
  return browserDom;
}

/**
 * Wraps a fragment in a full document. DOM implementations without the HTML5 tree builder's
 * implied `<html>`/`<body>` (linkedom) otherwise lose top-level text.
 */
export function asDocument(html: string) {
  if (/<body[\s>]/i.test(html)) return html;
  let head = "";
  const body = html
    .replace(/<head[\s>][\s\S]*?<\/head>/i, (match) => {
      head = match.replace(/^<head[^>]*>/i, "").replace(/<\/head>$/i, "");
      return "";
    })
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<!doctype[^>]*>/i, "");
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}
