import { createStyleSpec } from "@blocknote/core";

import { isFontSize } from "../parser/font-size";

function sizedSpan(value: string | undefined, external: boolean) {
  const span = document.createElement("span");
  if (isFontSize(value)) {
    span.style.fontSize = value;
    if (external) span.dataset.fontSize = value;
  }
  return { dom: span, contentDOM: span };
}

/** `fontSize` (§5): one of the steps other than 16, e.g. `"14px"`. Other values render at the default size. */
export const fontSizeSpec = createStyleSpec(
  { type: "fontSize", propSchema: "string" },
  {
    render: (value) => sizedSpan(value, false),
    toExternalHTML: (value) => sizedSpan(value, true),
    parse: (element) => {
      const value = element.dataset.fontSize;
      return element.tagName === "SPAN" && isFontSize(value) ? value : undefined;
    },
  },
);
