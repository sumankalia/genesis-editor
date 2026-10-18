import { headingOutline, mediaBlocks, visibleText, wordDiff, type SampleResult } from "./harness";

export type BaselineDiff = { status: "new" | "same" | "changed"; scoreBefore?: number; blocksBefore?: number; lines?: string[] };

const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLE = `
body{font:14px/1.5 system-ui,sans-serif;margin:0;color:#1f1f1f;background:#fafafa}
header{padding:16px 24px;background:#fff;border-bottom:1px solid #e5e5e5;display:flex;gap:24px;align-items:baseline;flex-wrap:wrap}
h1{font-size:18px;margin:0}h2{font-size:15px;margin:24px 0 8px}
main{padding:0 24px 48px}section{background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:12px 16px;margin-top:16px}
.score{font-size:28px;font-weight:600}.ok{color:#137333}.bad{color:#c5221f}.muted{color:#777}
.panes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.panes iframe{width:100%;height:520px;border:1px solid #ddd;border-radius:6px;background:#fff}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:4px 8px;text-align:left;vertical-align:top}
.diff{white-space:pre-wrap;line-height:1.8}.removed{background:#fce8e6;text-decoration:line-through}.added{background:#e6f4ea}
pre{background:#f4f4f4;padding:8px;border-radius:6px;overflow:auto;max-height:400px;font-size:12px}
a{color:#0b57d0}`;

function page(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

function rows(items: string[][], head: string[]) {
  if (!items.length) return '<p class="muted">None.</p>';
  return `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${items.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
}

export function renderReport(sample: SampleResult, baseline: BaselineDiff) {
  const { report } = sample.result;
  const diff = wordDiff(visibleText(sample.input), visibleText(sample.output));
  const lost = diff.filter((d) => d.op === "removed").reduce((n, d) => n + d.text.split(" ").length, 0);
  const sandbox = (html: string) => `<iframe sandbox="" srcdoc="${esc(html)}"></iframe>`;
  const checks = rows(
    sample.checks.map((c) => [c.ok ? '<span class="ok">pass</span>' : '<span class="bad">fail</span>', esc(c.name), esc(c.detail ?? "")]),
    ["", "Check", "Detail"],
  );
  const outline = headingOutline(sample.result.blocks)
    .map((h) => `<div style="padding-left:${(h.level - 1) * 16}px">H${h.level} ${esc(h.text)}</div>`)
    .join("") || '<p class="muted">No headings.</p>';
  const media = rows(
    mediaBlocks(sample.result.blocks).map((b) => [esc(b.type), `<a href="${esc(b.props?.url)}">${esc(b.props?.url)}</a>`, esc(b.props?.name ?? ""), esc(b.props?.caption ?? "")]),
    ["Type", "URL", "Name", "Caption"],
  );
  const baselineHtml =
    baseline.status === "new"
      ? '<p class="muted">No baseline yet. Run with <code>--update</code> to record one.</p>'
      : baseline.status === "same"
        ? '<p class="ok">Same blocks as the baseline.</p>'
        : `<p class="bad">Changed: score ${baseline.scoreBefore?.toFixed(3)} → ${report.score.toFixed(3)}, blocks ${baseline.blocksBefore} → ${report.blocks}.</p><pre>${esc((baseline.lines ?? []).join("\n"))}</pre>`;

  const body = `
<header><h1>${esc(sample.name)}</h1><span class="muted">${esc(sample.meta.source ?? "")}</span>
<span class="score ${sample.ok ? "ok" : "bad"}">${report.score.toFixed(3)}</span>
<span>${report.blocks} blocks · ${sample.ms.toFixed(1)} ms · ${report.mode} · ${(sample.input.length / 1024).toFixed(1)} KB</span>
<a href="../index.html">All samples</a> <a href="blocks.json">blocks.json</a> <a href="output.html">output.html</a></header>
<main>
<section><h2>Checks</h2>${checks}</section>
<section><h2>Source vs round trip</h2><p class="muted">Both panes are sandboxed: no scripts, no same-origin access.</p><div class="panes"><div>Source${sandbox(sample.input)}</div><div>parseHTML → toHTML${sandbox(sample.output)}</div></div></section>
<section><h2>Text diff</h2><p>${lost ? `<span class="bad">${lost} words removed</span>` : '<span class="ok">No text lost.</span>'}</p><div class="diff">${diff.map((d) => (d.op === "same" ? esc(d.text) : `<span class="${d.op}">${esc(d.text)}</span>`)).join(" ")}</div></section>
<section><h2>Removed</h2>${rows(report.dropped.map((d) => [esc(d.reason), `<code>${esc(d.tag)}</code>`, String(d.count), esc(d.preview ?? "")]), ["Reason", "Element", "Count", "Preview"])}
<h2>Unwrapped</h2>${rows(report.unwrapped.map((u) => [`<code>${esc(u.tag)}</code>`, String(u.count)]), ["Element", "Count"])}
<h2>Downgrades</h2>${rows(report.downgrades.map((d) => [esc(d.from), esc(d.to), String(d.count)]), ["From", "To", "Count"])}</section>
<section><h2>Heading outline</h2>${outline}<p class="muted">Promoted ${report.headings.promoted}, dropped ${report.headings.dropped}.</p></section>
<section><h2>Images and media</h2>${media}<p class="muted">Total ${report.images.total}, resolved ${report.images.resolved}, unresolved ${report.images.unresolved}, failed ${report.images.failed}.</p></section>
<section><h2>Unsupported styles</h2>${rows(report.unsupportedStyles.map((s) => [`<code>${esc(s.prop)}</code>`, String(s.count), s.visual ? "visual" : ""]), ["Property", "Elements", ""])}
<p class="muted">Colours: ${report.colors.palette} palette, ${report.colors.hex} hex.</p>${report.warnings.length ? `<h2>Warnings</h2><ul>${report.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}</section>
<section><h2>Baseline</h2>${baselineHtml}</section>
</main>`;
  return page(`${sample.name} – fixture report`, body);
}

export function renderIndex(samples: { result: SampleResult; baseline: BaselineDiff }[]) {
  const failed = samples.filter((s) => !s.result.ok).length;
  const table = rows(
    samples.map(({ result: s, baseline }) => [
      `<a href="${encodeURIComponent(s.name)}/report.html">${esc(s.name)}</a>`,
      `<span class="${s.ok ? "ok" : "bad"}">${s.ok ? "pass" : `${s.checks.filter((c) => !c.ok).length} failed`}</span>`,
      s.result.report.score.toFixed(3),
      String(s.result.report.blocks),
      String(s.result.report.dropped.reduce((n, d) => n + d.count, 0)),
      `${s.ms.toFixed(1)} ms`,
      baseline.status === "changed" ? '<span class="bad">changed</span>' : esc(baseline.status),
      esc(s.meta.source ?? ""),
    ]),
    ["Sample", "Checks", "Score", "Blocks", "Removed", "Parse", "Baseline", "Source"],
  );
  return page("Parser fixtures", `<header><h1>Parser fixtures</h1><span class="${failed ? "bad" : "ok"}">${samples.length - failed}/${samples.length} passing</span><span class="muted">${new Date().toISOString()}</span></header><main><section>${table}</section></main>`);
}
