import { parseHTML } from "linkedom";

import { asDocument, type DomAdapter } from "./dom";

/** linkedom-backed DOM for Node, edge runtimes, and workers. Requires the `linkedom` package. */
export const linkedomDom: DomAdapter = {
  parse(html) {
    return parseHTML(asDocument(html)).document as unknown as Document;
  },
};
