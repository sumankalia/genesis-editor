import type { HtmlInline, HtmlStyles, HtmlText } from "./types";

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
};

const COLLAPSIBLE = /[ \t\n\r\f]+/g;
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
 * (browsers don't render it), then turn `&nbsp;` into spaces. Returns `undefined` when only
 * whitespace is left.
 */
export function finalizeRuns(runs: Run[]): Run[] | undefined {
  const out: Run[] = [];
  let lineStart = true;
  let lastSpace = false;
  const trimEnd = () => {
    for (let i = out.length - 1; i >= 0; i--) {
      const run = out[i];
      if (run.pre) break;
      run.text = run.text.replace(/ +$/, "");
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
      if (lineStart || lastSpace) text = text.replace(/^ /, "");
      if (!text) continue;
      out.push({ ...run, text });
      lineStart = false;
      lastSpace = text.endsWith(" ");
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
    if (prev && prev.link === run.link && sameStyles(prev.styles, run.styles)) prev.text += run.text;
    else merged.push({ ...run, styles: { ...run.styles } });
  }
  const content: HtmlInline[] = [];
  for (const run of merged) {
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

export function inlineText(content: HtmlInline[] | undefined) {
  return (content ?? []).map((node) => (node.type === "link" ? node.content.map((t) => t.text).join("") : node.text)).join("");
}

/** Applies `fn` to every text node's styles. */
export function mapStyles(content: HtmlInline[], fn: (styles: HtmlStyles) => HtmlStyles): HtmlInline[] {
  const map = (text: HtmlText): HtmlText => ({ ...text, styles: fn({ ...text.styles }) });
  return runsToInline(
    inlineToRuns(
      content.map((node) => (node.type === "link" ? { ...node, content: node.content.map(map) } : map(node))),
    ),
  );
}
