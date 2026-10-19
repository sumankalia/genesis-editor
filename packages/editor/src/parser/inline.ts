import type { HtmlInline, HtmlInlineImage, HtmlStyles, HtmlText } from "./types";

/** The text an inline image stands for in runs and whitespace offsets. */
export const IMAGE_CHAR = "\uFFFC";

/** A run of source text with the formatting in effect, before whitespace processing. */
export type Run = {
  text: string;
  styles: HtmlStyles;
  link?: string;
  /** Whitespace is significant (`<pre>`, `white-space: pre*`, or already-normalized text). */
  pre: boolean;
  /** A `<br>`. */
  br?: boolean;
  /** The `\n` a `<br>` became. */
  fromBr?: boolean;
  /** Effective source font size in px, for heading promotion. */
  size: number;
  /** The size came from `data-font-size` (the editor's own export) and isn't normalized. */
  literalSize?: boolean;
  /** Bold in the source, even when the bold tool is off. */
  sourceBold: boolean;
  /** An inline image; `text` is `IMAGE_CHAR`. */
  image?: HtmlInlineImage["props"];
};

/**
 * A whitespace run with at least one collapsible character, or two or more `&nbsp;`s. Pasted HTML
 * pads with `&nbsp;` next to ordinary spaces (`Land,&nbsp; some`, `seasons.&nbsp;&nbsp; &nbsp;`),
 * which would otherwise survive as double and trailing spaces.
 */
const COLLAPSIBLE = /[ \t\n\r\f\u00a0]*[ \t\n\r\f][ \t\n\r\f\u00a0]*|\u00a0{2,}/g;
const NBSP = /\u00a0/g;

/** Splits runs at `<br><br>` (only whitespace between), for loose text that has no `<p>`. */
export function splitAtDoubleBreaks(runs: Run[]): Run[][] {
  const groups: Run[][] = [[]];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.br) {
      let j = i + 1;
      while (j < runs.length && !runs[j].br && !runs[j].pre && runs[j].text.trim() === "") j++;
      if (j < runs.length && runs[j].br) {
        groups.push([]);
        i = j;
        continue;
      }
    }
    groups[groups.length - 1].push(run);
  }
  return groups;
}

/**
 * HTML whitespace rules: collapse runs of spaces, trim at line starts and ends, drop a final `<br>`
 * (browsers don't render it), then turn `&nbsp;` into spaces. Unlike a browser, `&nbsp;` collapses
 * too, unless it stands alone between words: intentional spacing is kept only through
 * `white-space: pre*`, which is what `toHTML` writes. Returns `undefined` when only whitespace is left.
 */
export function finalizeRuns(runs: Run[]): Run[] | undefined {
  const out: Run[] = [];
  let lineStart = true;
  let lastSpace = false;
  const trimEnd = () => {
    for (let i = out.length - 1; i >= 0; i--) {
      const run = out[i];
      if (run.pre) break;
      run.text = run.text.replace(/[ \u00a0]+$/, "");
      if (run.text) break;
      out.splice(i, 1);
    }
  };
  for (const run of runs) {
    if (run.br) {
      trimEnd();
      out.push({ ...run, text: "\n", pre: true, br: false, fromBr: true });
      lineStart = true;
      lastSpace = false;
    } else if (run.pre) {
      if (!run.text) continue;
      out.push({ ...run });
      lineStart = run.text.endsWith("\n");
      lastSpace = false;
    } else {
      let text = run.text.replace(COLLAPSIBLE, " ");
      if (lineStart || lastSpace) text = text.replace(/^[ \u00a0]/, "");
      if (!text) continue;
      out.push({ ...run, text });
      lineStart = false;
      lastSpace = / $|\u00a0$/.test(text);
    }
  }
  trimEnd();
  if (out[out.length - 1]?.fromBr) out.pop();
  for (const run of out) run.text = run.text.replace(NBSP, " ");
  if (out.every((run) => run.text.trim() === "")) return undefined;
  return out;
}

function sameStyles(a: HtmlStyles, b: HtmlStyles) {
  const ka = Object.keys(a) as (keyof HtmlStyles)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

/** Merges neighbouring runs with identical formatting and groups linked runs into link nodes. */
export function runsToInline(runs: Run[]): HtmlInline[] {
  const merged: Run[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && !prev.image && !run.image && prev.link === run.link && sameStyles(prev.styles, run.styles)) prev.text += run.text;
    else merged.push({ ...run, styles: { ...run.styles } });
  }
  const content: HtmlInline[] = [];
  for (const run of merged) {
    if (run.image) {
      content.push({ type: "inlineImage", props: { ...run.image } });
      continue;
    }
    const text: HtmlText = { type: "text", text: run.text, styles: run.styles };
    const prev = content[content.length - 1];
    if (run.link) {
      if (prev?.type === "link" && prev.href === run.link) prev.content.push(text);
      else content.push({ type: "link", href: run.link, content: [text] });
    } else content.push(text);
  }
  return content;
}

/** Inline content back to runs, e.g. to flatten a block into a table cell. */
export function inlineToRuns(content: HtmlInline[] | undefined, extra: Partial<HtmlStyles> = {}): Run[] {
  const runs: Run[] = [];
  for (const node of content ?? []) {
    if (node.type === "inlineImage") {
      runs.push({ text: IMAGE_CHAR, styles: {}, pre: true, size: 16, sourceBold: false, image: { ...node.props } });
      continue;
    }
    const texts = node.type === "link" ? node.content : [node];
    for (const text of texts) {
      runs.push({
        text: text.text,
        styles: { ...text.styles, ...extra },
        link: node.type === "link" ? node.href : undefined,
        pre: true,
        size: 16,
        sourceBold: !!text.styles.bold,
      });
    }
  }
  return runs;
}

/** The text of inline content; images count as nothing. */
export function inlineText(content: HtmlInline[] | undefined) {
  return (content ?? []).map((node) => (node.type === "link" ? node.content.map((t) => t.text).join("") : node.type === "text" ? node.text : "")).join("");
}

/** Whether content has an image or text other than whitespace. */
export function hasInlineContent(content: HtmlInline[] | undefined) {
  return (content ?? []).some((node) => node.type === "inlineImage") || /\S/.test(inlineText(content).replace(/\u00a0/g, " "));
}

/** Text nodes, links' included; images left out. */
export function inlineTexts(content: HtmlInline[]): HtmlText[] {
  return content.flatMap((node) => (node.type === "link" ? node.content : node.type === "text" ? [node] : []));
}

/** Applies `fn` to every text node's styles. */
export function mapStyles(content: HtmlInline[], fn: (styles: HtmlStyles) => HtmlStyles): HtmlInline[] {
  const map = (text: HtmlText): HtmlText => ({ ...text, styles: fn({ ...text.styles }) });
  return runsToInline(
    inlineToRuns(
      content.map((node) => (node.type === "link" ? { ...node, content: node.content.map(map) } : node.type === "text" ? map(node) : node)),
    ),
  );
}
