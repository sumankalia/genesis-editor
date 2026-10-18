"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle, type GenesisBlock, type MetaPolicy } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const html = `<h2 id="launch" lang="en">Launch notes</h2>
<p lang="fr">Le texte garde sa langue.</p>
<blockquote cite="https://example.com/interview"><p>Keep the source, drop the noise.</p><p>That was the brief.</p><cite>— The design doc</cite></blockquote>
<figure><a href="https://example.com/"><img src="/examples/gradient.svg" alt="A soft gradient" width="1200" height="400" style="width:480px"></a><figcaption>Photo by <strong>Genesis</strong></figcaption></figure>`;

const DEFAULTS = new Set(["", "default", "left"]);

/** Blocks without ids, default props and text runs, so the meta stands out. */
function compact(blocks: GenesisBlock[]): unknown[] {
  return blocks.map((block) => {
    const props = Object.fromEntries(
      Object.entries(block.props as Record<string, unknown>).filter(([k, v]) => v !== undefined && !DEFAULTS.has(String(v)) && !(k === "showPreview" && v === true)),
    );
    const content = Array.isArray(block.content) ? block.content.map((n) => ("text" in n ? n.text : "")).join("") : undefined;
    return {
      type: block.type,
      ...(content ? { content } : {}),
      ...(Object.keys(props).length ? { props } : {}),
      ...(block.meta ? { meta: block.meta } : {}),
      ...(block.children.length ? { children: compact(block.children as GenesisBlock[]) } : {}),
    };
  });
}

export default function BlockMetaExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [policy, setPolicy] = useState<MetaPolicy>("keep");
  const [json, setJson] = useState("");
  const refresh = useCallback(() => {
    if (editor.current) setJson(JSON.stringify(compact(editor.current.getBlocks()), null, 2));
  }, []);
  useEffect(refresh, [refresh, policy]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        ref={editor}
        format="html"
        defaultValue={html}
        meta={{ policy }}
        onChange={refresh}
      />
      <div className="flex flex-col gap-2 px-4 lg:px-0 lg:pr-4">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>getBlocks()</span>
          <span className="inline-flex overflow-hidden rounded-md border">
            {(["keep", "strip-on-export"] as const).map((value) => (
              <button
                key={value}
                data-testid={`meta-policy-${value}`}
                aria-pressed={policy === value}
                className="px-2 py-0.5 hover:bg-muted aria-pressed:bg-muted aria-pressed:text-foreground"
                onClick={() => setPolicy(value)}
              >
                {value}
              </button>
            ))}
          </span>
        </div>
        <pre data-testid="meta-json" className="max-h-96 min-h-64 flex-1 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {json}
        </pre>
      </div>
    </div>
  );
}
