"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function RefExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [markdown, setMarkdown] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        ref={editor}
        initialContent={[
          { type: "heading", props: { level: 3 }, content: "Export me" },
          { type: "paragraph", content: [{ type: "text", text: "Bold", styles: { bold: true } }, " and plain text."] },
        ]}
      />
      <div className="px-[54px]">
        <button
          className="rounded-md border px-2.5 py-1 text-sm hover:bg-muted"
          onClick={() => setMarkdown(editor.current?.getMarkdown() ?? "")}
        >
          Get Markdown
        </button>
        {markdown && <pre className="mt-3 rounded-md bg-muted p-3 text-xs">{markdown}</pre>}
      </div>
    </div>
  );
}
