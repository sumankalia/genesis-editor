/**
 * What the parser needs from a DOM implementation: turn an HTML string into a `Document` with a `body`.
 * The parser only reads `childNodes`, `nodeType`, `nodeName`, attributes, and text, and removes nodes,
 * so any spec-like DOM works.
 */
export type DomAdapter = {
  parse(html: string): Document;
};

/** Turns HTML into a `Document`, e.g. `(html) => linkedom.parseHTML(html).document`. Fragments arrive wrapped in a full document. */
export type DocumentFactory = (html: string) => Document;

/** A `DOMParser` instance, e.g. `new (new JSDOM().window.DOMParser)()`. */
export type DOMParserLike = { parseFromString(html: string, type: "text/html"): Document };

/** What `ParseOptions.dom` takes: an adapter, a document factory, or a `DOMParser` instance or class. */
export type DomOption = DomAdapter | DocumentFactory | DOMParserLike | (new () => DOMParserLike);

const isParserClass = (dom: DocumentFactory | (new () => DOMParserLike)): dom is new () => DOMParserLike =>
  typeof (dom as { prototype?: { parseFromString?: unknown } }).prototype?.parseFromString === "function";

/** Normalizes `ParseOptions.dom`; without it, the browser's `DOMParser`. */
export function toDomAdapter(dom: DomOption | undefined): DomAdapter {
  if (!dom) return defaultDom();
  if (typeof dom === "function") {
    if (isParserClass(dom)) {
      const parser = new dom();
      return { parse: (html) => parser.parseFromString(html, "text/html") };
    }
    return { parse: (html) => dom(asDocument(html)) };
  }
  if ("parse" in dom && typeof dom.parse === "function") return dom;
  if ("parseFromString" in dom && typeof dom.parseFromString === "function") {
    return { parse: (html) => dom.parseFromString(html, "text/html") };
  }
  throw new TypeError("genesis-editor/parser: `dom` must be an adapter ({ parse }), a function returning a Document, or a DOMParser.");
}

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
      'genesis-editor/parser: no DOMParser here. Pass `dom`: `linkedomDom` from "genesis-editor/parser/linkedom", `jsdomDom` from "genesis-editor/parser/jsdom", or a function returning a Document.',
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
