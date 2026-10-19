import { parseHTML } from "linkedom";

import { docsNav, site } from "@/lib/site";

/**
 * Markdown versions of the docs for /llms.txt, /llms-full.txt and /docs/<page>.md. They're made from
 * each page's own rendered article, so they can't drift from what the site shows: the API tables come
 * from the package's types, and examples from their source files.
 */

export type DocsPage = { section: string; title: string; href: string; description: string; markdown: string };

const SKIP = new Set(["BUTTON", "SVG", "NAV", "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "IMG"]);
const HEADING = /^H([1-6])$/;

const absolute = (href: string) => {
  if (href.startsWith("#")) return href;
  try {
    return new URL(href, site.url).toString();
  } catch {
    return href;
  }
};

function codeSpan(text: string) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return longest ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

function fenced(code: string, language = "") {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${language}\n${code.replace(/\n+$/, "")}\n${fence}`;
}

const inline = (node: Node, links = true) => inlineNodes(Array.from(node.childNodes), links);

function inlineNodes(nodes: Node[], links = true): string {
  let out = "";
  for (const child of nodes) {
    if (child.nodeType === 3) {
      out += (child.textContent ?? "").replace(/\s+/g, " ");
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.tagName;
    if (SKIP.has(tag) || tag === "TEMPLATE") continue;
    if (tag === "BR") out += "\n";
    else if (tag === "CODE" || tag === "KBD") out += codeSpan(el.textContent ?? "");
    else if (tag === "STRONG" || tag === "B") out += wrap(inline(el, links), "**");
    else if (tag === "EM" || tag === "I") out += wrap(inline(el, links), "_");
    else if (tag === "A") {
      const text = inline(el, links).trim();
      const href = el.getAttribute("href");
      out += links && href && text ? `[${text}](${absolute(href)})` : text;
    } else out += inline(el, links);
  }
  return out;
}

function wrap(text: string, mark: string) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const lead = text.match(/^\s*/)![0];
  const tail = text.match(/\s*$/)![0];
  return `${lead}${mark}${trimmed}${mark}${tail}`;
}

function list(el: Element, depth: number): string {
  const ordered = el.tagName === "OL";
  const indent = "  ".repeat(depth);
  const items = Array.from(el.children).filter((c) => c.tagName === "LI");
  return items
    .map((li, i) => {
      const marker = ordered ? `${i + 1}.` : "-";
      const nested = Array.from(li.children).filter((c) => c.tagName === "UL" || c.tagName === "OL");
      const own = blocksOf(li, new Set(nested)).replace(/\n/g, `\n${indent}  `);
      const children = nested.map((n) => list(n, depth + 1)).join("\n");
      return `${indent}${marker} ${own}${children ? `\n${children}` : ""}`;
    })
    .join("\n");
}

function table(el: Element) {
  const rows = Array.from(el.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children).map((cell) => inline(cell).trim().replace(/\|/g, "\\|").replace(/\n/g, " ")),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (row: string[]) => [...row, ...Array(width - row.length).fill("")];
  const [head, ...body] = rows;
  return [pad(head), Array(width).fill("---"), ...body.map(pad)].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

/** Converts block content to Markdown; `exclude` children are left out (nested lists handled by `list`). */
function blocksOf(root: Element, exclude = new Set<Element>()): string {
  const blocks: string[] = [];
  let paragraph = "";
  const flush = () => {
    if (paragraph.trim()) blocks.push(paragraph.trim());
    paragraph = "";
  };
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 3) {
      paragraph += (child.textContent ?? "").replace(/\s+/g, " ");
      continue;
    }
    if (child.nodeType !== 1 || exclude.has(child as Element)) continue;
    const el = child as Element;
    const tag = el.tagName;
    if (SKIP.has(tag) || el.getAttribute("role") === "tablist" || el.classList.contains("example-preview")) continue;
    const heading = tag.match(HEADING);
    if (heading) {
      flush();
      blocks.push(`${"#".repeat(Number(heading[1]))} ${inline(el, false).replace(/#\s*$/, "").trim()}`);
    } else if (tag === "P") {
      flush();
      blocks.push(inline(el).trim());
    } else if (tag === "UL" || tag === "OL") {
      flush();
      blocks.push(list(el, 0));
    } else if (tag === "PRE") {
      flush();
      blocks.push(fenced(el.textContent ?? "", el.closest("[data-language]")?.getAttribute("data-language") ?? ""));
    } else if (tag === "TEMPLATE" && el.hasAttribute("data-source")) {
      flush();
      const code = (el as HTMLTemplateElement).content?.textContent || el.textContent || "";
      blocks.push(`${codeSpan(el.getAttribute("data-source")!)}:\n\n${fenced(code, el.getAttribute("data-language") ?? "")}`);
    } else if (tag === "TABLE") {
      flush();
      blocks.push(table(el));
    } else if (tag === "BLOCKQUOTE" || el.hasAttribute("data-callout")) {
      flush();
      blocks.push(blocksOf(el).replace(/^/gm, "> ").replace(/^> $/gm, ">"));
    } else if (/^(CODE|KBD|A|STRONG|B|EM|I|SPAN|SMALL|BR)$/.test(tag)) {
      paragraph += inlineNodes([el]);
    } else {
      flush();
      const inner = blocksOf(el);
      if (inner) blocks.push(inner);
    }
  }
  flush();
  return blocks.filter(Boolean).join("\n\n");
}

/** The Markdown of a rendered docs page's `<article>`. */
export function articleMarkdown(html: string) {
  const article = parseHTML(html).document.querySelector("article");
  if (!article) throw new Error("No <article> on the page.");
  return blocksOf(article as unknown as Element).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export const docsPages = docsNav.flatMap((section) => section.items.map((item) => ({ section: section.title, ...item })));

export const markdownHref = (href: string) => `${href}.md`;

/** Renders a docs page through the site itself (`origin`) and converts it. */
export async function loadDocsPage(origin: string, href: string): Promise<DocsPage> {
  const meta = docsPages.find((page) => page.href === href);
  if (!meta) throw new Error(`Not a docs page: ${href}`);
  const response = await fetch(new URL(href, origin), { headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`${href} answered ${response.status}`);
  const markdown = articleMarkdown(await response.text());
  const description = markdown.split("\n\n")[1]?.startsWith("#") ? "" : (markdown.split("\n\n")[1] ?? "");
  return { ...meta, description: description.replace(/\s+/g, " ").trim(), markdown };
}

export const loadAllDocs = (origin: string) => Promise.all(docsPages.map((page) => loadDocsPage(origin, page.href)));

export function llmsIndex(pages: DocsPage[]) {
  const sections = [...new Set(pages.map((page) => page.section))];
  const link = (title: string, url: string, note: string) => `- [${title}](${url})${note ? `: ${note}` : ""}`;
  return [
    `# ${site.name}`,
    "",
    `> ${site.description} React 18 and 19; the HTML parser also runs on Node 18+ with linkedom or jsdom.`,
    "",
    `Install with \`${site.installCommand}\` and import \`genesis-editor/style.css\` once. Each page below is the Markdown version of the docs page at the same path without \`.md\`.`,
    ...sections.flatMap((section) => [
      "",
      `## ${section === "Guide" ? "Docs" : section}`,
      "",
      ...pages.filter((page) => page.section === section).map((page) => link(page.title, `${site.url}${markdownHref(page.href)}`, page.description)),
    ]),
    "",
    "## Optional",
    "",
    link("Full docs", `${site.url}/llms-full.txt`, "every page above in one Markdown file"),
    link("Playground", `${site.url}/playground`, "try the props live, load your own HTML and see the import report"),
    link("npm package", site.npmUrl, "README, changelog and versions"),
    link("Source on GitHub", site.repoUrl, "issues, CONTRIBUTING and the changelog"),
    "",
  ].join("\n");
}

function demoteHeadings(markdown: string) {
  let fence = "";
  return markdown
    .split("\n")
    .map((line) => {
      const open = line.match(/^(`{3,})/);
      if (open && (!fence || (open[1].length >= fence.length && line.trim() === open[1]))) {
        fence = fence ? "" : open[1];
        return line;
      }
      return !fence && /^#{1,5} /.test(line) ? `#${line}` : line;
    })
    .join("\n");
}

export function llmsFull(pages: DocsPage[]) {
  const header = [`# ${site.name}`, "", `> ${site.description}`, "", `Source: ${site.url}/docs`, ""].join("\n");
  const body = pages.map((page) => {
    return `<!-- ${site.url}${page.href} -->\n\n${demoteHeadings(page.markdown).trim()}`;
  });
  return `${header}\n${body.join("\n\n---\n\n")}\n`;
}

export const markdownHeaders = (type: "text/plain" | "text/markdown") => ({
  "Content-Type": `${type}; charset=utf-8`,
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
});
