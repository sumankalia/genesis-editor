import { parseHTML, toHTML, type HtmlBlock, type ParseOptions, type ParseResult } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";

/** Optional `<name>.meta.json` next to a sample. Every field is optional. */
export type SampleMeta = {
  source?: string;
  minScore?: number;
  /** Strings that must appear in the round-tripped HTML. */
  mustInclude?: string[];
  /** Strings that must not appear in the round-tripped HTML. */
  mustExclude?: string[];
  /** Shape checks: `path` is a dot path of block indexes, e.g. `"2.0"` for the first child of the third block. */
  expect?: { path: string; type?: string; props?: Record<string, unknown> }[];
  options?: Pick<ParseOptions, "mode" | "tools" | "baseUrl">;
};

export type Check = { name: string; ok: boolean; detail?: string };

export type SampleResult = {
  name: string;
  meta: SampleMeta;
  input: string;
  result: ParseResult;
  output: string;
  ms: number;
  checks: Check[];
  ok: boolean;
};

const UNSAFE_OUTPUT = /<script|\son[a-z]+\s*=|javascript:|vbscript:|data:text\//i;

export function runSample(name: string, input: string, meta: SampleMeta = {}, dom = linkedomDom): SampleResult {
  const options: ParseOptions = { dom, ...meta.options };
  const start = performance.now();
  const result = parseHTML(input, options);
  const ms = performance.now() - start;
  const output = toHTML(result.blocks);
  const again = parseHTML(output, options);
  const checks: Check[] = [];

  checks.push({ name: "output is safe", ok: !UNSAFE_OUTPUT.test(output), detail: UNSAFE_OUTPUT.exec(output)?.[0] });
  const idempotent = JSON.stringify(again.blocks) === JSON.stringify(result.blocks);
  checks.push({ name: "parse(toHTML(blocks)) equals blocks", ok: idempotent });
  checks.push({ name: "toHTML is stable", ok: toHTML(again.blocks) === output });
  if (meta.minScore !== undefined) {
    checks.push({ name: `score ≥ ${meta.minScore}`, ok: result.report.score >= meta.minScore, detail: result.report.score.toFixed(3) });
  }
  for (const text of meta.mustInclude ?? []) checks.push({ name: `includes ${JSON.stringify(text)}`, ok: output.includes(text) });
  for (const text of meta.mustExclude ?? []) checks.push({ name: `excludes ${JSON.stringify(text)}`, ok: !output.includes(text) });
  for (const want of meta.expect ?? []) {
    const block = blockAt(result.blocks, want.path);
    const typeOk = !want.type || block?.type === want.type;
    const propsOk = Object.entries(want.props ?? {}).every(([k, v]) => block?.props?.[k] === v);
    checks.push({
      name: `block ${want.path} is ${want.type ?? "?"}${want.props ? ` ${JSON.stringify(want.props)}` : ""}`,
      ok: !!block && typeOk && propsOk,
      detail: block ? `${block.type} ${JSON.stringify(block.props ?? {})}` : "missing",
    });
  }
  return { name, meta, input, result, output, ms, checks, ok: checks.every((c) => c.ok) };
}

export function blockAt(blocks: HtmlBlock[], path: string): HtmlBlock | undefined {
  let level: HtmlBlock[] | undefined = blocks;
  let block: HtmlBlock | undefined;
  for (const part of path.split(".")) {
    block = level?.[Number(part)];
    level = block?.children;
  }
  return block;
}

/** Visible text of an HTML string, for the word diff. */
export function visibleText(html: string) {
  const { body } = linkedomDom.parse(html);
  for (const el of Array.from(body.querySelectorAll("script, style, noscript, template, head"))) el.remove();
  return (body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export type DiffPart = { op: "same" | "removed" | "added"; text: string };

/** Word-level LCS diff. Long inputs fall back to a prefix/suffix diff to stay fast. */
export function wordDiff(a: string, b: string): DiffPart[] {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const xs = x.slice(pre, x.length - suf);
  const ys = y.slice(pre, y.length - suf);
  const parts: DiffPart[] = [];
  const push = (op: DiffPart["op"], words: string[]) => {
    if (!words.length) return;
    const last = parts[parts.length - 1];
    if (last?.op === op) last.text += ` ${words.join(" ")}`;
    else parts.push({ op, text: words.join(" ") });
  };
  push("same", x.slice(0, pre));
  if (xs.length * ys.length > 4_000_000) {
    push("removed", xs);
    push("added", ys);
  } else {
    const table = Array.from({ length: xs.length + 1 }, () => new Uint32Array(ys.length + 1));
    for (let i = xs.length - 1; i >= 0; i--) for (let j = ys.length - 1; j >= 0; j--) table[i][j] = xs[i] === ys[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < xs.length || j < ys.length) {
      if (i < xs.length && j < ys.length && xs[i] === ys[j]) {
        push("same", [xs[i]]);
        i++;
        j++;
      }
      else if (j < ys.length && (i === xs.length || table[i][j + 1] >= table[i + 1][j])) push("added", [ys[j++]]);
      else push("removed", [xs[i++]]);
    }
  }
  push("same", x.slice(x.length - suf));
  return parts;
}

export function headingOutline(blocks: HtmlBlock[], out: { level: number; text: string }[] = []) {
  for (const block of blocks) {
    if (block.type === "heading" && Array.isArray(block.content)) {
      const text = block.content.map((n) => (n.type === "link" ? n.content.map((t) => t.text).join("") : n.text)).join("");
      out.push({ level: Number(block.props?.level ?? 1), text });
    }
    if (block.children) headingOutline(block.children, out);
  }
  return out;
}

export function mediaBlocks(blocks: HtmlBlock[], out: HtmlBlock[] = []) {
  for (const block of blocks) {
    if (["image", "video", "audio", "file"].includes(block.type)) out.push(block);
    if (block.children) mediaBlocks(block.children, out);
  }
  return out;
}
