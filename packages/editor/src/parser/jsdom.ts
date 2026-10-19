import { JSDOM } from "jsdom";

import type { DomAdapter, DOMParserLike } from "./dom";

let parser: DOMParserLike | undefined;

/**
 * jsdom-backed DOM for Node: a spec HTML parser, slower than linkedom. Requires the `jsdom` package.
 * One window's `DOMParser` is reused; it runs no scripts and loads no resources.
 */
export const jsdomDom: DomAdapter = {
  parse(html) {
    const instance = (parser ??= new new JSDOM("").window.DOMParser());
    return instance.parseFromString(html, "text/html");
  },
};
