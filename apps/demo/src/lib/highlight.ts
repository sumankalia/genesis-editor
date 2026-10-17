import { cacheLife } from "next/cache";
import { codeToHtml } from "shiki";

export type CodeLanguage = "tsx" | "ts" | "css" | "bash" | "json" | "md";

/** Server-side syntax highlighting with light and dark themes as CSS variables. */
export async function highlight(code: string, lang: CodeLanguage) {
  "use cache";
  cacheLife("max");
  return codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}

/** Lines ending in `// hide` are site plumbing (theme wiring, mobile toolbar), not part of the example. */
export function stripHiddenLines(source: string) {
  return source
    .split("\n")
    .filter((line) => !/\/\/ hide\s*$/.test(line) && !/^"use client";?$/.test(line.trim()))
    .join("\n")
    .replace(/<(\w+)\n\s*\/>/g, "<$1 />")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trimEnd();
}
