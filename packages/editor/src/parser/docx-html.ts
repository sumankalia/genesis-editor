/**
 * Walk a .docx package (unzipped OOXML) to HTML that already has inline `color` and
 * `font-size` in pt, so `parseHTML` can treat it like a Google Docs paste.
 *
 * Mammoth never emits CSS color/font-size and never reads `w:color`. Google Docs / Word
 * often put those on the style, the paragraph mark (`w:pPr/w:rPr`), or `docDefaults`.
 *
 * Portable: no DOMParser (Node 18 CJS). Inheritance:
 * docDefaults → paragraph style (basedOn chain) → pPr/rPr → run rPr.
 * No font-family is copied.
 */

export type DocxFiles = Record<string, Uint8Array>;

type XmlEl = { name: string; attrs: Record<string, string>; children: Array<XmlEl | string> };

type RunStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  sizePt?: number;
};

type ParaStyle = {
  styleId?: string;
  heading?: number;
  numId?: string;
  ilvl?: number;
  align?: string;
  run: RunStyle;
};

type StyleDef = {
  basedOn?: string;
  name?: string;
  heading?: number;
  run: RunStyle;
};

type ListFrame = { numId: string; ilvl: number; tag: "ul" | "ol" };

const IMAGE_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

/** Convert unzipped OOXML parts to HTML. Empty string if there is nothing to walk. */
export function docxFilesToHtml(files: DocxFiles): string {
  const document = xmlFile(files, "word/document.xml");
  if (!document) return "";
  const root = parseXml(document);
  const body = root && find(root, "body");
  if (!body) return "";

  const styles = loadStyles(xmlFile(files, "word/styles.xml"));
  const numbering = loadNumbering(xmlFile(files, "word/numbering.xml"));
  const rels = loadRels(xmlFile(files, "word/_rels/document.xml.rels"));
  const ctx: WalkCtx = { files, styles, numbering, rels };
  const lists: ListFrame[] = [];
  let html = "";
  for (const child of elements(body)) {
    html += blockHtml(child, ctx, lists);
  }
  html += closeLists(lists, 0);
  return html.trim();
}

type WalkCtx = {
  files: DocxFiles;
  styles: { defaults: RunStyle; byId: Map<string, StyleDef> };
  numbering: Map<string, Map<number, "ul" | "ol">>;
  rels: Map<string, { target: string; type: string; external: boolean }>;
};

function blockHtml(el: XmlEl, ctx: WalkCtx, lists: ListFrame[]): string {
  const name = local(el.name);
  if (name === "tbl") return closeLists(lists, 0) + tableHtml(el, ctx);
  if (name === "sdt") {
    const content = find(el, "sdtContent");
    return content ? elements(content).map((c) => blockHtml(c, ctx, lists)).join("") : "";
  }
  if (name !== "p") return elements(el).map((c) => blockHtml(c, ctx, lists)).join("");

  const para = paragraphProps(el, ctx.styles);
  const inner = runsHtml(el, para.run, ctx);
  if (!inner.trim() && !inner.includes("<img")) return closeLists(lists, 0);
  const align = para.align ? ` style="text-align:${para.align}"` : "";
  if (para.numId) {
    const tag = listTag(ctx.numbering, para.numId, para.ilvl ?? 0);
    return emitListItem(lists, para.numId, para.ilvl ?? 0, tag, inner);
  }
  const closed = closeLists(lists, 0);
  if (para.heading) return `${closed}<h${para.heading}${align}>${inner}</h${para.heading}>`;
  return `${closed}<p${align}>${inner}</p>`;
}

function tableHtml(tbl: XmlEl, ctx: WalkCtx): string {
  const rows: string[] = [];
  for (const tr of descendants(tbl, "tr")) {
    const cells: string[] = [];
    for (const tc of elements(tr).filter((c) => local(c.name) === "tc")) {
      const span = Number(wattr(find(find(tc, "tcPr") ?? tc, "gridSpan") ?? tc, "val") ?? 1);
      const nested: ListFrame[] = [];
      let inner = "";
      for (const child of elements(tc)) {
        if (local(child.name) === "tcPr") continue;
        inner += blockHtml(child, ctx, nested);
      }
      inner += closeLists(nested, 0);
      const colspan = span > 1 ? ` colspan="${span}"` : "";
      cells.push(`<td${colspan}>${inner || "<p></p>"}</td>`);
    }
    if (cells.length) rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return rows.length ? `<table>${rows.join("")}</table>` : "";
}

function runsHtml(para: XmlEl, inherited: RunStyle, ctx: WalkCtx): string {
  let html = "";
  const walk = (node: XmlEl, run: RunStyle, href?: string) => {
    const name = local(node.name);
    if (name === "hyperlink") {
      const id = rattr(node, "id");
      const rel = id ? ctx.rels.get(id) : undefined;
      const next = rel?.external && /^https?:/i.test(rel.target) ? rel.target : href;
      for (const child of elements(node)) walk(child, run, next);
      return;
    }
    if (name === "ins" || name === "moveTo") {
      for (const child of elements(node)) walk(child, run, href);
      return;
    }
    if (name === "del" || name === "moveFrom" || name === "commentRangeStart" || name === "commentRangeEnd" || name === "commentReference") {
      return;
    }
    if (name === "r") {
      html += runHtml(node, mergeRun(run, readRpr(find(node, "rPr"))), ctx, href);
      return;
    }
    for (const child of elements(node)) {
      if (local(child.name) === "pPr") continue;
      walk(child, run, href);
    }
  };
  for (const child of elements(para)) {
    if (local(child.name) === "pPr") continue;
    walk(child, inherited);
  }
  return html;
}

function runHtml(run: XmlEl, style: RunStyle, ctx: WalkCtx, href?: string): string {
  let html = "";
  for (const child of elements(run)) {
    const name = local(child.name);
    if (name === "t") html += escapeHtml(textOf(child));
    else if (name === "tab") html += "\t";
    else if (name === "br" || name === "cr") html += "<br>";
    else if (name === "drawing" || name === "pict" || name === "object") html += imageHtml(child, ctx);
    else if (name === "AlternateContent") html += alternateHtml(child, ctx);
    else html += imageHtml(child, ctx);
  }
  if (!html) return "";
  const css = styleAttr(style);
  if (css) html = `<span${css}>${html}</span>`;
  if (style.strike) html = `<s>${html}</s>`;
  if (style.underline) html = `<u>${html}</u>`;
  if (style.italic) html = `<em>${html}</em>`;
  if (style.bold) html = `<strong>${html}</strong>`;
  if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
  return html;
}

function alternateHtml(node: XmlEl, ctx: WalkCtx): string {
  const choice = find(node, "Choice");
  const fallback = find(node, "Fallback");
  return imageHtml(choice ?? fallback ?? node, ctx);
}

function imageHtml(node: XmlEl, ctx: WalkCtx): string {
  const blip = descendants(node, "blip")[0] ?? descendants(node, "imagedata")[0];
  if (!blip) return elements(node).map((c) => imageHtml(c, ctx)).join("");
  const id = rattr(blip, "embed") ?? rattr(blip, "id") ?? rattr(blip, "link");
  const rel = id ? ctx.rels.get(id) : undefined;
  if (!rel || rel.external) return "";
  const src = dataUrl(ctx.files, rel.target);
  if (!src) return "";
  const docPr = descendants(node, "docPr")[0];
  const alt = escapeHtml(docPr?.attrs.descr || docPr?.attrs.title || "");
  return `<img src="${src}" alt="${alt}">`;
}

function paragraphProps(para: XmlEl, styles: WalkCtx["styles"]): ParaStyle {
  const pPr = find(para, "pPr");
  const styleId = wattr(find(pPr ?? para, "pStyle") ?? para, "val");
  const resolved = resolveStyle(styleId, styles);
  const numPr = find(pPr ?? para, "numPr");
  const mark = readRpr(find(pPr ?? para, "rPr"));
  const jc = wattr(find(pPr ?? para, "jc") ?? para, "val");
  const outline = wattr(find(pPr ?? para, "outlineLvl") ?? para, "val");
  let heading = resolved.heading;
  if (!heading && outline !== undefined && outline !== "") heading = Math.min(6, Math.max(1, Number(outline) + 1));
  if (isTitle(styleId, resolved.name)) heading = 0;
  const align = jc === "center" || jc === "right" || jc === "both" ? (jc === "both" ? "justify" : jc) : undefined;
  return {
    styleId,
    heading: heading || undefined,
    numId: wattr(find(numPr ?? para, "numId") ?? para, "val"),
    ilvl: Number(wattr(find(numPr ?? para, "ilvl") ?? para, "val") ?? 0),
    align,
    run: mergeRun(styles.defaults, mergeRun(resolved.run, mark)),
  };
}

function resolveStyle(styleId: string | undefined, styles: WalkCtx["styles"]): { heading: number; name?: string; run: RunStyle } {
  if (!styleId) return { heading: headingFromId(styleId), run: {} };
  const seen = new Set<string>();
  const chain: StyleDef[] = [];
  let id: string | undefined = styleId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const def = styles.byId.get(id);
    if (!def) break;
    chain.push(def);
    id = def.basedOn;
  }
  let run: RunStyle = {};
  let heading = headingFromId(styleId);
  let name: string | undefined;
  for (const def of chain.reverse()) {
    run = mergeRun(run, def.run);
    name = def.name ?? name;
    if (def.heading) heading = def.heading;
  }
  if (!heading) heading = headingFromId(styleId) || headingFromName(name);
  if (isTitle(styleId, name)) heading = 0;
  return { heading, name, run };
}

function headingFromId(styleId: string | undefined) {
  const m = /^heading\s*([1-6])$/i.exec(styleId ?? "");
  return m ? Number(m[1]) : 0;
}

function headingFromName(name: string | undefined) {
  const m = /^heading\s*([1-6])$/i.exec(name ?? "");
  return m ? Number(m[1]) : 0;
}

function isTitle(styleId: string | undefined, name: string | undefined) {
  const id = (styleId ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  return id === "title" || id === "subtitle" || n === "title" || n === "subtitle";
}

function readRpr(el: XmlEl | undefined): RunStyle {
  if (!el) return {};
  const colorEl = find(el, "color");
  const sz = wattr(find(el, "sz") ?? el, "val") ?? wattr(find(el, "szCs") ?? el, "val");
  const color = hexColor(wattr(colorEl ?? el, "val"));
  const u = find(el, "u");
  const out: RunStyle = {};
  const bold = onOff(find(el, "b"));
  const italic = onOff(find(el, "i"));
  const strike = onOff(find(el, "strike"));
  if (bold !== undefined) out.bold = bold;
  if (italic !== undefined) out.italic = italic;
  if (strike !== undefined) out.strike = strike;
  if (u) out.underline = (wattr(u, "val") ?? "single").toLowerCase() !== "none";
  if (color) out.color = color;
  if (sz && /^\d+$/.test(sz)) out.sizePt = Number(sz) / 2;
  return out;
}

function onOff(el: XmlEl | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = (wattr(el, "val") ?? "true").toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

function hexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.replace(/^#/, "").toLowerCase();
  if (hex === "auto") return undefined;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return undefined;
}

function mergeRun(base: RunStyle, over: RunStyle): RunStyle {
  const next = { ...base };
  for (const key of ["bold", "italic", "underline", "strike", "color", "sizePt"] as const) {
    if (over[key] !== undefined) (next as Record<string, unknown>)[key] = over[key];
  }
  return next;
}

function styleAttr(run: RunStyle): string {
  const parts: string[] = [];
  if (run.color) parts.push(`color:${run.color}`);
  if (run.sizePt !== undefined) parts.push(`font-size:${run.sizePt}pt`);
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

function loadStyles(xml: string | undefined): WalkCtx["styles"] {
  const byId = new Map<string, StyleDef>();
  let defaults: RunStyle = {};
  const root = xml ? parseXml(xml) : null;
  if (!root) return { defaults, byId };
  const docDefaults = find(root, "docDefaults");
  defaults = readRpr(find(find(docDefaults ?? root, "rPrDefault") ?? root, "rPr"));
  for (const style of descendants(root, "style")) {
    if ((wattr(style, "type") ?? "paragraph") === "character") {
      // Character styles still contribute rPr if a paragraph uses them as basedOn; skip type=character-only ids.
    }
    const id = wattr(style, "styleId");
    if (!id) continue;
    const pPr = find(style, "pPr");
    const outline = wattr(find(pPr ?? style, "outlineLvl") ?? style, "val");
    byId.set(id, {
      basedOn: wattr(find(style, "basedOn") ?? style, "val"),
      name: wattr(find(style, "name") ?? style, "val"),
      heading: headingFromId(id) || headingFromName(wattr(find(style, "name") ?? style, "val")) || (outline !== undefined && outline !== "" ? Math.min(6, Number(outline) + 1) : 0),
      run: mergeRun(readRpr(find(style, "rPr")), readRpr(find(pPr ?? style, "rPr"))),
    });
  }
  return { defaults, byId };
}

function loadNumbering(xml: string | undefined): WalkCtx["numbering"] {
  const map = new Map<string, Map<number, "ul" | "ol">>();
  const root = xml ? parseXml(xml) : null;
  if (!root) return map;
  const abstracts = new Map<string, Map<number, "ul" | "ol">>();
  for (const abs of descendants(root, "abstractNum")) {
    const id = wattr(abs, "abstractNumId");
    if (!id) continue;
    const levels = new Map<number, "ul" | "ol">();
    for (const lvl of descendants(abs, "lvl")) {
      const ilvl = Number(wattr(lvl, "ilvl") ?? 0);
      const fmt = (wattr(find(lvl, "numFmt") ?? lvl, "val") ?? "bullet").toLowerCase();
      levels.set(ilvl, fmt === "bullet" || fmt === "none" ? "ul" : "ol");
    }
    abstracts.set(id, levels);
  }
  for (const num of descendants(root, "num")) {
    if (local(num.name) !== "num") continue;
    const id = wattr(num, "numId");
    const absId = wattr(find(num, "abstractNumId") ?? num, "val");
    if (id && absId && abstracts.has(absId)) map.set(id, abstracts.get(absId)!);
  }
  return map;
}

function loadRels(xml: string | undefined): WalkCtx["rels"] {
  const map = new Map<string, { target: string; type: string; external: boolean }>();
  const root = xml ? parseXml(xml) : null;
  if (!root) return map;
  for (const rel of descendants(root, "Relationship")) {
    const id = rel.attrs.Id ?? rel.attrs.id;
    const target = rel.attrs.Target ?? rel.attrs.target;
    if (!id || !target) continue;
    map.set(id, {
      target,
      type: rel.attrs.Type ?? rel.attrs.type ?? "",
      external: /External/i.test(rel.attrs.TargetMode ?? rel.attrs.targetMode ?? ""),
    });
  }
  return map;
}

function listTag(numbering: WalkCtx["numbering"], numId: string, ilvl: number): "ul" | "ol" {
  return numbering.get(numId)?.get(ilvl) ?? "ul";
}

function emitListItem(lists: ListFrame[], numId: string, ilvl: number, tag: "ul" | "ol", inner: string): string {
  let html = "";
  while (lists.length && lists[lists.length - 1]!.ilvl > ilvl) {
    const closed = lists.pop()!;
    html += `</li></${closed.tag}>`;
  }
  const top = lists[lists.length - 1];
  if (top && top.ilvl === ilvl) {
    if (top.numId !== numId || top.tag !== tag) {
      lists.pop();
      html += `</li></${top.tag}><${tag}><li>${inner}`;
      lists.push({ numId, ilvl, tag });
    } else {
      html += `</li><li>${inner}`;
    }
    return html;
  }
  html += `<${tag}><li>${inner}`;
  lists.push({ numId, ilvl, tag });
  return html;
}

function closeLists(lists: ListFrame[], ilvl: number): string {
  let html = "";
  while (lists.length && lists[lists.length - 1]!.ilvl >= ilvl) {
    const closed = lists.pop()!;
    html += `</li></${closed.tag}>`;
  }
  return html;
}

function dataUrl(files: DocxFiles, target: string): string {
  const path = normalizePart(target);
  const bytes = part(files, path) ?? part(files, `word/${path}`) ?? part(files, path.replace(/^\/+/, ""));
  if (!bytes) return "";
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const type = IMAGE_TYPE[ext] ?? "application/octet-stream";
  return `data:${type};base64,${toBase64(bytes)}`;
}

function normalizePart(target: string) {
  let path = target.replace(/\\/g, "/").replace(/^\.\//, "");
  if (path.startsWith("/")) path = path.slice(1);
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === ".." ) parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function xmlFile(files: DocxFiles, path: string): string | undefined {
  const bytes = part(files, path);
  return bytes ? decodeXml(bytes) : undefined;
}

function part(files: DocxFiles, path: string): Uint8Array | undefined {
  if (files[path]) return files[path];
  const lower = path.toLowerCase();
  for (const [name, value] of Object.entries(files)) {
    if (name.toLowerCase() === lower) return value;
  }
  return undefined;
}

function decodeXml(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function local(name: string) {
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(i + 1) : name;
}

function elements(node: XmlEl): XmlEl[] {
  return node.children.filter((c): c is XmlEl => typeof c === "object");
}

function find(node: XmlEl, name: string): XmlEl | undefined {
  for (const child of elements(node)) if (local(child.name) === name) return child;
  return undefined;
}

function descendants(node: XmlEl, name: string): XmlEl[] {
  const out: XmlEl[] = [];
  const walk = (el: XmlEl) => {
    if (local(el.name) === name) out.push(el);
    for (const child of elements(el)) walk(child);
  };
  for (const child of elements(node)) walk(child);
  return out;
}

function textOf(node: XmlEl): string {
  return node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}

function wattr(node: XmlEl, key: string): string | undefined {
  return node.attrs[`w:${key}`] ?? node.attrs[key] ?? namedAttr(node, key);
}

function rattr(node: XmlEl, key: string): string | undefined {
  return node.attrs[`r:${key}`] ?? node.attrs[key] ?? namedAttr(node, key);
}

function namedAttr(node: XmlEl, key: string): string | undefined {
  const suffix = `:${key}`;
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === key || name.endsWith(suffix)) return value;
  }
  return undefined;
}

function parseXml(xml: string): XmlEl | null {
  const src = xml.replace(/^\uFEFF/, "");
  let i = 0;
  const skipMisc = () => {
    while (i < src.length) {
      if (/\s/.test(src[i]!)) {
        i++;
        continue;
      }
      if (src.startsWith("<?", i)) {
        const end = src.indexOf("?>", i);
        i = end < 0 ? src.length : end + 2;
        continue;
      }
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i);
        i = end < 0 ? src.length : end + 3;
        continue;
      }
      if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) {
        const end = src.indexOf(">", i);
        i = end < 0 ? src.length : end + 1;
        continue;
      }
      break;
    }
  };
  const parseName = () => {
    const start = i;
    while (i < src.length && /[:A-Za-z_][\w:.-]*/.test(src[i]!) === false) break;
    while (i < src.length && /[:A-Za-z0-9_.-]/.test(src[i]!)) i++;
    return src.slice(start, i);
  };
  const decode = (value: string) =>
    value
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  const parseAttrs = () => {
    const attrs: Record<string, string> = {};
    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i]!)) i++;
      if (src[i] === "/" || src[i] === ">") break;
      const name = parseName();
      if (!name) {
        i++;
        continue;
      }
      while (i < src.length && /\s/.test(src[i]!)) i++;
      if (src[i] === "=") {
        i++;
        while (i < src.length && /\s/.test(src[i]!)) i++;
        const q = src[i];
        if (q === '"' || q === "'") {
          i++;
          const start = i;
          while (i < src.length && src[i] !== q) i++;
          attrs[name] = decode(src.slice(start, i));
          if (src[i] === q) i++;
        }
      } else attrs[name] = "";
    }
    return attrs;
  };
  const parseElement = (): XmlEl | null => {
    if (src[i] !== "<" || src.startsWith("</", i) || src.startsWith("<!", i) || src.startsWith("<?", i)) return null;
    i++;
    const name = parseName();
    const attrs = parseAttrs();
    while (i < src.length && /\s/.test(src[i]!)) i++;
    if (src[i] === "/") {
      i++;
      if (src[i] === ">") i++;
      return { name, attrs, children: [] };
    }
    if (src[i] === ">") i++;
    const children: Array<XmlEl | string> = [];
    while (i < src.length) {
      if (src.startsWith("</", i)) {
        i += 2;
        parseName();
        while (i < src.length && /\s/.test(src[i]!)) i++;
        if (src[i] === ">") i++;
        break;
      }
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i);
        i = end < 0 ? src.length : end + 3;
        continue;
      }
      if (src.startsWith("<![CDATA[", i)) {
        const end = src.indexOf("]]>", i);
        children.push(src.slice(i + 9, end < 0 ? src.length : end));
        i = end < 0 ? src.length : end + 3;
        continue;
      }
      if (src[i] === "<") {
        const child = parseElement();
        if (child) children.push(child);
        else break;
      } else {
        const start = i;
        while (i < src.length && src[i] !== "<") i++;
        children.push(decode(src.slice(start, i)));
      }
    }
    return { name, attrs, children };
  };
  skipMisc();
  return parseElement();
}
