/**
 * Word clipboard HTML: `mso-list` paragraphs, VML images, and comment balloons.
 * Runs after sanitize, before the block walk. Synthetic tests only; no private corpus.
 */

import { ELEMENT_NODE } from "./dom";
import { isSafeUrl } from "./sanitize";

const LIST_CLASS = /msolistparagraph/i;
const COMMENT_CLASS = /msocomment|msocomtxt|msocomanchor|commenttext|commentrange/i;
const MSO_LIST = /mso-list\s*:\s*[^;]*level(\d+)/i;

function lower(el: Element) {
  return el.nodeName.toLowerCase();
}

function classes(el: Element) {
  return (el.getAttribute("class") ?? "").split(/\s+/);
}

function isListPara(el: Element) {
  if (lower(el) !== "p") return false;
  const style = el.getAttribute("style") ?? "";
  return MSO_LIST.test(style) || classes(el).some((c) => LIST_CLASS.test(c));
}

function listLevel(el: Element) {
  const match = MSO_LIST.exec(el.getAttribute("style") ?? "");
  return Math.max(1, Number(match?.[1] ?? 1));
}

function listTag(el: Element): "ul" | "ol" {
  const style = el.getAttribute("style") ?? "";
  if (/mso-list\s*:[^;]*(decimal|arabic|roman|alpha)/i.test(style)) return "ol";
  const prefix = (el.textContent ?? "").trimStart();
  return /^\d+[.)]/.test(prefix) ? "ol" : "ul";
}

function localName(el: Element) {
  return lower(el).replace(/^.*:/, "");
}

/** Drop Word comment chrome and turn VML / mso-list into regular HTML. */
export function rewriteWordHtml(body: Element) {
  dropComments(body);
  promoteVmlImages(body);
  rewriteLists(body);
}

function dropComments(root: Element) {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const className = el.getAttribute("class") ?? "";
    const id = el.getAttribute("id") ?? "";
    if (COMMENT_CLASS.test(className) || COMMENT_CLASS.test(id) || /^_com_/i.test(id)) {
      el.remove();
    }
  }
}

function promoteVmlImages(root: Element) {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (localName(el) !== "imagedata" && localName(el) !== "shape") continue;
    const src =
      el.getAttribute("src") ??
      el.getAttribute("o:href") ??
      el.getAttribute("href") ??
      nestedSrc(el);
    if (!src || !isSafeUrl(src, true) || /^file:/i.test(src)) continue;
    const img = root.ownerDocument!.createElement("img");
    img.setAttribute("src", src);
    const alt = el.getAttribute("o:title") ?? el.getAttribute("alt") ?? el.getAttribute("title") ?? "";
    if (alt) img.setAttribute("alt", alt);
    el.replaceWith(img);
  }
}

function nestedSrc(el: Element) {
  for (const child of Array.from(el.children)) {
    if (localName(child) === "imagedata") {
      return child.getAttribute("src") ?? child.getAttribute("o:href") ?? child.getAttribute("href") ?? "";
    }
  }
  return "";
}

function isIgnorable(node: Node) {
  return node.nodeType === 3 && !((node.nodeValue ?? "").trim());
}

function rewriteLists(parent: Element) {
  for (const child of Array.from(parent.children)) rewriteLists(child);
  const kids = Array.from(parent.childNodes);
  let i = 0;
  while (i < kids.length) {
    const node = kids[i]!;
    if (isIgnorable(node) || node.nodeType !== ELEMENT_NODE || !isListPara(node as Element)) {
      i++;
      continue;
    }
    const run: Element[] = [];
    let j = i;
    while (j < kids.length) {
      const next = kids[j]!;
      if (isIgnorable(next)) {
        j++;
        continue;
      }
      if (next.nodeType === ELEMENT_NODE && isListPara(next as Element)) {
        run.push(next as Element);
        j++;
        continue;
      }
      break;
    }
    const list = buildList(run, parent.ownerDocument!);
    parent.insertBefore(list, run[0]!);
    for (const p of run) p.remove();
    kids.splice(i, j - i, list);
    i++;
  }
}

function buildList(items: Element[], doc: Document): Element {
  const rootTag = listTag(items[0]!);
  const root = doc.createElement(rootTag);
  type Frame = { el: Element; level: number };
  const stack: Frame[] = [{ el: root, level: listLevel(items[0]!) }];
  for (const p of items) {
    const level = listLevel(p);
    const tag = listTag(p);
    while (stack.length > 1 && stack[stack.length - 1]!.level > level) stack.pop();
    let top = stack[stack.length - 1]!;
    if (level > top.level) {
      const nested = doc.createElement(tag);
      const lastLi = lastItem(top.el);
      (lastLi ?? top.el).append(nested);
      stack.push({ el: nested, level });
      top = stack[stack.length - 1]!;
    }
    stripListGlyph(p);
    const li = doc.createElement("li");
    while (p.firstChild) li.append(p.firstChild);
    top.el.append(li);
  }
  return root;
}

function lastItem(list: Element) {
  const kids = Array.from(list.children).filter((c) => c.nodeName.toLowerCase() === "li");
  return kids[kids.length - 1];
}

function stripListGlyph(p: Element) {
  const first = p.firstElementChild;
  if (!first) return;
  const style = first.getAttribute("style") ?? "";
  const className = first.getAttribute("class") ?? "";
  if (/mso-list/i.test(style) || /mso-list/i.test(className) || /Ignore|MsoList/i.test(className)) {
    first.remove();
  }
}
