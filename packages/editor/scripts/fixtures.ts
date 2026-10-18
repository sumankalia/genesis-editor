/**
 * Runs every HTML sample through parseHTML → toHTML and writes an HTML report per sample.
 *
 *   pnpm fixtures [--dir <folder>]... [--only <text>] [--update] [--watch] [--trace] [--out <folder>]
 *
 * Samples are `*.html` files in `fixtures/samples/` and the git-ignored `fixtures/private/`, plus any
 * `--dir`. An optional `<name>.meta.json` beside a sample adds checks (see `SampleMeta`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSample, type SampleMeta, type SampleResult } from "../fixtures/harness";
import { renderIndex, renderReport, type BaselineDiff } from "../fixtures/render";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../fixtures");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const values = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));

const dirs = [join(root, "samples"), join(root, "private"), ...values("dir").map((d) => resolve(d))];
const only = values("only");
const outDir = resolve(values("out")[0] ?? join(root, "out"));
const baselineDir = join(root, ".baseline");

if (flag("screenshots")) console.warn("--screenshots is not implemented yet: the reports embed both renderings side by side instead.");

function samplesIn(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.html?$/i.test(f) && !f.split(/[\\/]/).includes("out"))
    .map((f) => ({ file: join(dir, f), name: f.replace(/\.html?$/i, "").replace(/[\\/]/g, "__") }));
}

function baselineFor(sample: SampleResult): BaselineDiff {
  const file = join(baselineDir, `${sample.name}.json`);
  const current = JSON.stringify(sample.result.blocks, null, 1);
  if (flag("update")) {
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(file, JSON.stringify({ score: sample.result.report.score, blocks: sample.result.blocks }, null, 1));
  }
  if (!existsSync(file)) return { status: "new" };
  const before = JSON.parse(readFileSync(file, "utf8")) as { score: number; blocks: unknown[] };
  const previous = JSON.stringify(before.blocks, null, 1);
  if (previous === current) return { status: "same" };
  const a = previous.split("\n");
  const b = current.split("\n");
  const lines: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && lines.length < 200; i++) {
    if (a[i] !== b[i]) lines.push(`${i + 1}: - ${a[i] ?? ""}`, `${i + 1}: + ${b[i] ?? ""}`);
  }
  return { status: "changed", scoreBefore: before.score, blocksBefore: before.blocks.length, lines };
}

function run() {
  const samples = dirs.flatMap(samplesIn).filter((s) => !only.length || only.some((o) => s.name.includes(o)));
  const results: { result: SampleResult; baseline: BaselineDiff }[] = [];
  for (const { file, name } of samples) {
    const metaFile = file.replace(/\.html?$/i, ".meta.json");
    const meta: SampleMeta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
    const result = runSample(name, readFileSync(file, "utf8"), meta);
    const baseline = baselineFor(result);
    const dir = join(outDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "report.html"), renderReport(result, baseline));
    writeFileSync(join(dir, "blocks.json"), JSON.stringify(result.result.blocks, null, 2));
    writeFileSync(join(dir, "report.json"), JSON.stringify(result.result.report, null, 2));
    writeFileSync(join(dir, "output.html"), result.output);
    results.push({ result, baseline });
    const failed = result.checks.filter((c) => !c.ok);
    console.log(`${failed.length ? "FAIL" : "ok  "} ${name.padEnd(32)} score ${result.result.report.score.toFixed(3)}  ${String(result.result.report.blocks).padStart(4)} blocks  ${result.ms.toFixed(1).padStart(7)} ms  ${baseline.status}`);
    for (const c of failed) console.log(`       ✗ ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    if (flag("trace")) console.log(JSON.stringify(result.result.report, null, 2));
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), renderIndex(results));
  const failed = results.filter((r) => !r.result.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passing. Report: ${join(outDir, "index.html")}`);
  return failed;
}

if (flag("watch")) {
  // Each run is a fresh process so parser source edits are picked up, not just sample edits.
  const once = () => spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...args.filter((a) => a !== "--watch")], { stdio: "inherit" });
  once();
  console.log("Watching samples and src/parser for changes…");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rerun = (_event: string, file: string | null) => {
    if (file && /(^|[\\/])out[\\/]|\.baseline/.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(once, 200);
  };
  for (const dir of [...dirs, resolve(here, "../src/parser")]) if (existsSync(dir)) watch(dir, { recursive: true }, rerun);
} else process.exitCode = run() ? 1 : 0;
