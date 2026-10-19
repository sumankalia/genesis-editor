import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/styles/article.css"), "utf8");

describe("article.css", () => {
  it("is exported as genesis-editor/article.css", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { exports: Record<string, string> };
    expect(pkg.exports["./article.css"]).toBe("./dist/article.css");
  });

  it("is a published-article stylesheet, not editor chrome", () => {
    expect(css).toContain(".genesis-article");
    expect(css).not.toContain(".genesis-editor");
    expect(css).not.toContain("Inter");
  });

  it("gives blocks the editor's padding rhythm", () => {
    expect(css).toMatch(/\.genesis-article p[\s\S]*padding-block:\s*3px/);
    expect(css).toMatch(/\.genesis-article h1[\s\S]*padding-top:\s*18px/);
    expect(css).toContain(".genesis-article blockquote");
    expect(css).toContain(".genesis-article table");
    expect(css).toContain("[data-genesis-embed]");
  });

  it("styles links and code so they are not body text", () => {
    expect(css).toContain("LinkText");
    expect(css).toContain("text-decoration: underline");
    expect(css).toContain("ui-monospace");
    expect(css).toContain("rgb(22 22 22)");
  });
});
