import { cacheLife } from "next/cache";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ExampleTabs } from "@/components/site/example-tabs";
import { ExamplePreview, type ExampleName } from "@/components/examples/registry";
import { highlight, stripHiddenLines, type CodeLanguage } from "@/lib/highlight";

async function loadSources(name: ExampleName, extraFiles: string[]) {
  "use cache";
  cacheLife("max");
  const files = [`${name}.tsx`, ...extraFiles];
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(process.cwd(), "src/components/examples", file), "utf8");
      const lang = (file.split(".").pop() ?? "tsx") as CodeLanguage;
      const code = lang === "tsx" ? stripHiddenLines(raw) : raw.trimEnd();
      return { file, code, html: await highlight(code, lang) };
    }),
  );
}

/** A live example with Preview / Code tabs. The code is the example's real source. */
export async function Example({
  name,
  files = [],
  minHeight,
}: {
  name: ExampleName;
  /** Extra files from `src/components/examples` to show, such as a stylesheet. */
  files?: string[];
  minHeight?: number;
}) {
  const sources = await loadSources(name, files);
  return (
    <ExampleTabs
      name={name}
      sources={sources}
      preview={<ExamplePreview name={name} />}
      minHeight={minHeight}
    />
  );
}
