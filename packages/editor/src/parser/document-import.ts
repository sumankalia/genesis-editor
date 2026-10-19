import { docxFilesToHtml } from "./docx-html";
import { parseHTML } from "./parse";
import type { ParseOptions, ParseResult } from "./types";

export type DocumentFormat = "html" | "markdown" | "txt" | "docx" | "odt" | "rtf";

export type DocumentSource = {
  name: string;
  type?: string;
  bytes: Uint8Array;
};

export class DocumentImportError extends Error {
  constructor(
    message: string,
    readonly code: "pages" | "unsupported" | "empty",
  ) {
    super(message);
    this.name = "DocumentImportError";
  }
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const decoder = new TextDecoder("utf-8");

function hasMagic(bytes: Uint8Array, magic: number[]) {
  return magic.length <= bytes.length && magic.every((b, i) => bytes[i] === b);
}

function extname(name: string) {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

function decodeText(bytes: Uint8Array) {
  return decoder.decode(bytes).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Sniff the file. `.pages` is rejected later with a specific error. */
export function detectDocumentFormat(source: DocumentSource): DocumentFormat | "pages" | "unknown" {
  const ext = extname(source.name);
  const type = (source.type ?? "").toLowerCase();
  if (ext === ".pages" || type.includes("vnd.apple.pages")) return "pages";
  if (ext === ".docx" || type.includes("wordprocessingml")) return "docx";
  if (ext === ".odt" || type.includes("opendocument.text")) return "odt";
  if (ext === ".rtf" || type === "application/rtf" || type === "text/rtf") return "rtf";
  if (ext === ".md" || ext === ".markdown" || type === "text/markdown") return "markdown";
  if (ext === ".html" || ext === ".htm" || type === "text/html") return "html";
  if (ext === ".txt" || type === "text/plain") return "txt";
  if (decodeText(source.bytes.slice(0, 16)).trimStart().startsWith("{\\rtf")) return "rtf";
  if (hasMagic(source.bytes, ZIP)) {
    const names = peekZipNames(source.bytes);
    if (names.some((n) => n.startsWith("word/"))) return "docx";
    if (names.includes("content.xml") || names.includes("mimetype")) return "odt";
    if (names.some((n) => n.endsWith(".iwa") || n === "Index.zip" || n.startsWith("Index/"))) return "pages";
  }
  const head = decodeText(source.bytes.slice(0, 256)).trimStart().slice(0, 64).toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<meta")) return "html";
  return "unknown";
}

function peekZipNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  let i = 0;
  while (i + 30 < bytes.length && names.length < 40) {
    if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04) break;
    const nameLen = bytes[i + 26] | (bytes[i + 27] << 8);
    const extraLen = bytes[i + 28] | (bytes[i + 29] << 8);
    const compSize = bytes[i + 18] | (bytes[i + 19] << 8) | (bytes[i + 20] << 16) | (bytes[i + 21] << 24);
    const name = decoder.decode(bytes.subarray(i + 30, i + 30 + nameLen));
    names.push(name);
    i += 30 + nameLen + extraLen + (compSize >>> 0);
  }
  return names;
}

async function unzip(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const { unzipSync } = await import("fflate");
  return unzipSync(bytes);
}

async function markdownToHTML(markdown: string): Promise<string> {
  const { Marked } = await import("marked");
  const marked = new Marked({ gfm: true, breaks: false, pedantic: false });
  const html = marked.parse(markdown.replace(/^\uFEFF/, ""), { async: false });
  return (typeof html === "string" ? html : "").trim();
}

const DOCX_WALK_NOTE = "Converted Word (.docx) to HTML with inline color and size, then parsed.";
const DOCX_MAMMOTH_NOTE = "Converted Word (.docx) to HTML with mammoth (BSD-2-Clause), then parsed.";

async function docxToHTML(bytes: Uint8Array): Promise<{ html: string; note: string }> {
  try {
    const files = await unzip(bytes);
    const walked = docxFilesToHtml(files);
    if (walked.trim()) return { html: walked, note: DOCX_WALK_NOTE };
  } catch {
    // Unusual packages still go through mammoth.
  }
  const loaded = await import("mammoth");
  const convertToHtml = loaded.convertToHtml ?? loaded.default.convertToHtml;
  // Node mammoth reads `buffer`; the browser build reads `arrayBuffer`.
  const copy = bytes.slice();
  const result = await convertToHtml({ buffer: copy, arrayBuffer: copy.buffer } as never);
  return { html: result.value ?? "", note: DOCX_MAMMOTH_NOTE };
}

function txtToHTML(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, "<br>")}</p>`);
  return blocks.join("") || "<p></p>";
}

function rtfToHTML(rtf: string): string {
  let i = 0;
  let html = "";
  let text = "";
  const flush = () => {
    if (!text) return;
    html += escapeHtml(text);
    text = "";
  };
  const skipGroup = () => {
    let depth = 1;
    i++;
    while (i < rtf.length && depth) {
      if (rtf[i] === "{") depth++;
      else if (rtf[i] === "}") depth--;
      i++;
    }
  };
  html += "<p>";
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === "{") {
      if (rtf.startsWith("{\\", i) && (rtf.startsWith("{\\*", i) || rtf.startsWith("{\\fonttbl", i) || rtf.startsWith("{\\colortbl", i) || rtf.startsWith("{\\stylesheet", i) || rtf.startsWith("{\\info", i))) {
        skipGroup();
        continue;
      }
      i++;
      continue;
    }
    if (ch === "}") {
      i++;
      continue;
    }
    if (ch === "\\") {
      if (rtf[i + 1] === "\\" || rtf[i + 1] === "{" || rtf[i + 1] === "}") {
        text += rtf[i + 1];
        i += 2;
        continue;
      }
      i++;
      let word = "";
      while (i < rtf.length && /[a-zA-Z]/.test(rtf[i])) word += rtf[i++];
      let arg = "";
      if (rtf[i] === "-") arg += rtf[i++];
      while (i < rtf.length && /\d/.test(rtf[i])) arg += rtf[i++];
      if (rtf[i] === " ") i++;
      if (word === "par" || word === "line") {
        flush();
        html += "</p><p>";
      } else if (word === "tab") text += "\t";
      else if (word === "b") {
        flush();
        html += Number(arg) === 0 ? "</strong>" : "<strong>";
      } else if (word === "i") {
        flush();
        html += Number(arg) === 0 ? "</em>" : "<em>";
      } else if (word === "ul") {
        flush();
        html += Number(arg) === 0 ? "</u>" : "<u>";
      } else if (word === "u" && arg) {
        text += String.fromCharCode(Number(arg) & 0xffff);
      } else if (word === "uc") {
        /* skip following unicode fallback bytes */
      }
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    text += ch;
    i++;
  }
  flush();
  html += "</p>";
  return html.replace(/<p><\/p>/g, "");
}

function attr(tag: string, name: string) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return match?.[1];
}

async function odtToHTML(bytes: Uint8Array): Promise<string> {
  const files = await unzip(bytes);
  const mime = files.mimetype ? decodeText(files.mimetype).trim() : "";
  if (mime && mime !== "application/vnd.oasis.opendocument.text") {
    throw new DocumentImportError("This OpenDocument file isn't a text document (.odt).", "unsupported");
  }
  const xml = files["content.xml"] ? decodeText(files["content.xml"]) : "";
  if (!xml.trim()) throw new DocumentImportError("The OpenDocument file has no content.xml.", "empty");
  const dataUrl = (href: string) => {
    const path = href.replace(/^\.\//, "");
    const file = files[path];
    if (!file) return "";
    const ext = extname(path);
    const type = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".gif" ? "image/gif" : "application/octet-stream";
    let binary = "";
    for (const b of file) binary += String.fromCharCode(b);
    const encoded = typeof btoa === "function" ? btoa(binary) : Buffer.from(file).toString("base64");
    return `data:${type};base64,${encoded}`;
  };
  let html = xml
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<office:automatic-styles[\s\S]*?<\/office:automatic-styles>/g, "")
    .replace(/<office:scripts[\s\S]*?<\/office:scripts>/g, "")
    .replace(/<text:h\b([^>]*)>([\s\S]*?)<\/text:h>/g, (_, a, inner) => {
      const level = Math.min(6, Math.max(1, Number(attr(a, "text:outline-level")) || 1));
      return `<h${level}>${inner}</h${level}>`;
    })
    .replace(/<text:p\b[^>]*>/g, "<p>")
    .replace(/<\/text:p>/g, "</p>")
    .replace(/<text:list(?!-item)\b[^>]*>/g, "<ul>")
    .replace(/<\/text:list(?!-item)>/g, "</ul>")
    .replace(/<text:list-item\b[^>]*>/g, "<li>")
    .replace(/<\/text:list-item>/g, "</li>")
    .replace(/<table:table(?!-)\b[^>]*>/g, "<table>")
    .replace(/<\/table:table(?!-)>/g, "</table>")
    .replace(/<table:table-row\b[^>]*>/g, "<tr>")
    .replace(/<\/table:table-row>/g, "</tr>")
    .replace(/<table:table-cell\b[^>]*>/g, "<td>")
    .replace(/<\/table:table-cell>/g, "</td>")
    .replace(/<text:line-break\b[^/]*\/>/g, "<br>")
    .replace(/<text:s\b[^/]*\/>/g, " ")
    .replace(/<text:tab\b[^/]*\/>/g, "\t")
    .replace(/<draw:image\b([^>]*)\/?>/g, (_, a) => {
      const href = attr(a, "xlink:href");
      const src = href ? dataUrl(href) : "";
      return src ? `<img src="${src}">` : "";
    });
  html = html.replace(/<\/?[\w:.-]+[^>]*>/g, (tag) => (/^<\/?(h[1-6]|p|ul|ol|li|table|tr|td|th|br|img|strong|em|u|a)\b/i.test(tag) ? tag : ""));
  return html.trim();
}

const FORMAT_NOTE: Record<DocumentFormat, string> = {
  html: "Imported HTML through the genesis engine.",
  markdown: "Converted Markdown to HTML with marked (MIT), then parsed.",
  txt: "Imported plain text as paragraphs.",
  docx: DOCX_WALK_NOTE,
  odt: "Converted OpenDocument text to HTML, then parsed.",
  rtf: "Converted RTF to HTML, then parsed.",
};

/** Convert a file to HTML, then run `parseHTML`. */
export async function importDocument(source: DocumentSource, options?: ParseOptions): Promise<ParseResult & { format: DocumentFormat }> {
  if (!source.bytes.length) throw new DocumentImportError("The file is empty.", "empty");
  const format = detectDocumentFormat(source);
  if (format === "pages") {
    throw new DocumentImportError("Apple Pages files can't be imported here. Export as Word (.docx) and import that.", "pages");
  }
  if (format === "unknown") {
    throw new DocumentImportError(`Can't import "${source.name}". Use Word (.docx), OpenDocument (.odt), RTF, HTML, Markdown, or plain text.`, "unsupported");
  }
  let html = "";
  let note = FORMAT_NOTE[format];
  if (format === "html") html = decodeText(source.bytes);
  else if (format === "txt") html = txtToHTML(decodeText(source.bytes));
  else if (format === "markdown") html = await markdownToHTML(decodeText(source.bytes));
  else if (format === "rtf") html = rtfToHTML(decodeText(source.bytes));
  else if (format === "docx") {
    const converted = await docxToHTML(source.bytes);
    html = converted.html;
    note = converted.note;
  } else html = await odtToHTML(source.bytes);
  const result = parseHTML(html, options);
  result.report.warnings.unshift(note);
  return { ...result, format };
}
