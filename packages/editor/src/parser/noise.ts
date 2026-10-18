import type { ReportBuilder } from "./report";
import {
  LANDMARKS,
  NEGATIVE_TOKENS,
  NOISE_PHRASES,
  POSITIVE_TOKENS,
  PROTECTED_CONTENT,
  SCORED_CONTAINERS,
} from "./rules/noise";
import type { CleanOptions, CleanupSummary } from "./types";

const BLOCK_ELEMENTS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table, figure, img, hr, dt, dd";
const MAIN_CANDIDATES = ["[itemprop=articleBody]", "article", "main, [role=main]"];
const SMALL_TEXT = 500;
const SMALL_BLOCKS = 3;

const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const NON_TEXT = new Set(["script", "style", "template"]);
const LEFT_TO_SANITIZER = new Set([...NON_TEXT, "link", "meta"]);

/** Visible text, without script and style contents (this runs before the sanitizer removes them). */
function textOf(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) out += node.nodeValue ?? "";
    else if (node.nodeType === 1 && !NON_TEXT.has(tagOf(node as Element))) out += ` ${textOf(node as Element)} `;
  }
  return normalize(out);
}
const tagOf = (el: Element) => el.tagName.toLowerCase();

function tokens(el: Element) {
  return `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function select(root: Element, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

class Removals {
  sections = 0;
  labels: string[] = [];
  constructor(
    private report: ReportBuilder,
    private keep: (el: Element) => boolean,
  ) {}

  remove(el: Element, label: string) {
    if (this.keep(el)) return false;
    const text = textOf(el);
    this.report.drop(tagOf(el), "noise", text);
    if (text || el.querySelector("img, svg, video, iframe")) {
      this.sections++;
      if (!this.labels.includes(label)) this.labels.push(label);
    }
    el.remove();
    return true;
  }

  summary(skipped?: CleanupSummary["skipped"]): CleanupSummary {
    return { sections: this.sections, labels: this.labels, ...(skipped ? { skipped } : {}) };
  }
}

/**
 * Cleanup layers 3–5 (§9): main-content scoping, landmarks, and container scoring. Small pastes
 * skip them, as do `keepSelectors` matches; `dropSelectors` always apply.
 */
export function removeNoise(body: Element, html: string, report: ReportBuilder, options: CleanOptions = {}): CleanupSummary {
  const keepSelectors = options.keepSelectors ?? [];
  const keep = (el: Element) =>
    keepSelectors.some((selector) => {
      try {
        return !!el.closest(selector) || !!el.querySelector(selector);
      } catch {
        return false;
      }
    });
  const removals = new Removals(report, keep);
  for (const selector of options.dropSelectors ?? []) {
    for (const el of select(body, selector)) if (body.contains(el)) removals.remove(el, "custom");
  }
  if (options.noise === false) return removals.summary("off");
  const text = textOf(body);
  if (text.length < SMALL_TEXT || select(body, BLOCK_ELEMENTS).length < SMALL_BLOCKS) return removals.summary("small");

  scopeToMainContent(body, html, text.length, removals);
  for (const el of select(body, LANDMARKS)) {
    if (!body.contains(el)) continue;
    const tag = tagOf(el);
    if ((tag === "header" || tag === "footer") && el.parentElement?.closest("article, blockquote, figure")) continue;
    removals.remove(el, labelOf(el));
  }
  scoreContainers(body, removals, [...NOISE_PHRASES, ...(options.phrases ?? []).map((p) => p.toLowerCase())]);
  return removals.summary();
}

/** What a piece of page furniture is, for the report: a landmark, a negative token, or `"page"`. */
function labelOf(el: Element) {
  const tag = tagOf(el);
  const role = el.getAttribute("role");
  if (tag === "nav" || role === "navigation") return "navigation";
  if (tag === "header" || tag === "footer") return tag;
  return tokens(el).find((t) => NEGATIVE_TOKENS.has(t)) ?? "page";
}

function isFullDocument(body: Element, html: string) {
  return /<(html|body)[\s>]/i.test(html) || select(body, "nav, header, footer, aside, main, [role]").length >= 2;
}

/** Layer 3: keep only the main content of a full page, plus its `h1` if that sits outside. */
function scopeToMainContent(body: Element, html: string, totalText: number, removals: Removals) {
  if (!isFullDocument(body, html)) return;
  let main: Element | undefined;
  for (const selector of MAIN_CANDIDATES) {
    const found = select(body, selector);
    if (!found.length) continue;
    main = found.reduce((a, b) => (textOf(b).length > textOf(a).length ? b : a));
    break;
  }
  // A small `article` is more likely a card in a list than the page's content.
  if (!main || textOf(main).length < totalText * 0.25) return;
  const h1 = main.querySelector("h1") ? null : (select(body, "h1").find((el) => !main.contains(el)) ?? null);
  h1?.remove();
  for (let node: Element = main; node !== body && node.parentElement; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling !== node && !LEFT_TO_SANITIZER.has(tagOf(sibling))) removals.remove(sibling, labelOf(sibling));
    }
  }
  if (h1) body.insertBefore(h1, body.firstChild);
}

/** Layer 5: removes containers scoring −2 or lower; protected content is never entered. */
function scoreContainers(el: Element, removals: Removals, phrases: string[]) {
  for (const child of Array.from(el.children)) {
    const tag = tagOf(child);
    if (child.matches(PROTECTED_CONTENT)) continue;
    if (SCORED_CONTAINERS.has(tag)) {
      const { score, label } = scoreOf(child, phrases);
      if (score <= -2 && removals.remove(child, label)) continue;
    }
    scoreContainers(child, removals, phrases);
  }
}

function scoreOf(el: Element, phrases: string[]) {
  let score = 0;
  const labels: string[] = [];
  const own = tokens(el);
  const negative = [...new Set(own.filter((t) => NEGATIVE_TOKENS.has(t)))];
  score -= Math.min(2, negative.length);
  labels.push(...negative);
  if (own.some((t) => POSITIVE_TOKENS.has(t))) score += 2;

  const text = textOf(el);
  const links = select(el, "a");
  const linkText = links.reduce((sum, a) => sum + textOf(a).length, 0);
  const density = text.length ? linkText / text.length : 0;
  if (links.length >= 3 && density > 0.5) {
    score--;
    labels.push("links");
  }
  const tag = tagOf(el);
  if (tag === "ul" || tag === "ol") {
    const items = Array.from(el.children).filter((c) => tagOf(c) === "li");
    const linkOnly = (li: Element) => {
      const anchors = select(li, "a");
      const itemText = textOf(li);
      return anchors.length === 1 && itemText === textOf(anchors[0]) && itemText.split(" ").length <= 5;
    };
    if (items.length >= 2 && items.every(linkOnly)) {
      score--;
      labels.push("links");
    }
  }
  const lower = text.toLowerCase();
  const phrase = phrases.find((p) => lower.includes(p) && p.length >= lower.length * 0.5);
  if (phrase) {
    score--;
    labels.push(phrase);
  }
  const iconOnly = select(el, "a, button").some((c) => !textOf(c) && c.querySelector("svg, img, i"));
  if (iconOnly && text.length < 40) {
    score--;
    labels.push("icons");
  }
  const paragraphs = select(el, "p").length;
  if ((text.length >= 200 && density < 0.25) || (el.querySelector("h1, h2, h3, h4, h5, h6") && paragraphs >= 2)) score += 3;
  return { score, label: labels[0] ?? "noise" };
}
