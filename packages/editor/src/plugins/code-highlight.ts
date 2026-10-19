import type { ExtensionFactoryInstance } from "@blocknote/core";
import { SyntaxHighlightingExtension } from "@blocknote/core/extensions";

const STARTER_LANGS = ["javascript", "typescript", "json", "html", "css", "python", "markdown", "shellscript"];

/** Lazy Shiki highlighter. `import("shiki")` runs the first time a code block is highlighted. */
export function genesisSyntaxHighlighting(): ExtensionFactoryInstance {
  return SyntaxHighlightingExtension({
    createHighlighter: async () => {
      const { createHighlighter } = await import("shiki");
      return createHighlighter({
        themes: ["github-light", "github-dark"],
        langs: STARTER_LANGS,
      });
    },
  });
}
