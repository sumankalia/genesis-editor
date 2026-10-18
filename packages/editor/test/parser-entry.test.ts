import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const parserDir = resolve(__dirname, "../src/parser");

function importsOf(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const [, spec] of source.matchAll(/^(?:import|export)\b[^;()]*?\bfrom\s+"([^"]+)"/gm)) {
    if (spec.startsWith(".")) {
      const base = resolve(dirname(file), spec);
      const target = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((p) => {
        try {
          readFileSync(p);
          return true;
        } catch {
          return false;
        }
      });
      if (target) importsOf(target, seen);
    } else seen.add(`pkg:${spec}`);
  }
  return seen;
}

describe("parser entry", () => {
  it("imports no React, BlockNote, or editor runtime", () => {
    const all = [...importsOf(join(parserDir, "index.ts"))];
    expect(all.filter((p) => p.startsWith("pkg:"))).toEqual([]);
    const outside = all.filter((p) => !p.startsWith("pkg:") && !p.startsWith(parserDir));
    // The re-host queue behind `parseHTMLAsync` is shared with the editor and is plain TypeScript too.
    expect(outside.map((p) => p.slice(p.indexOf("src/"))).sort()).toEqual(["src/lib/rehost.ts", "src/lib/uploads.ts", "src/plugins/tool-names.ts"]);
  });

  it("keeps linkedom out of the main parser entry", () => {
    const files = readdirSync(parserDir).filter((f) => f.endsWith(".ts") && f !== "linkedom.ts");
    for (const f of files) expect(readFileSync(join(parserDir, f), "utf8")).not.toMatch(/from "linkedom"/);
  });
});
