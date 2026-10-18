"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const swatches = [
  { name: "brand", hex: "#ff5a1f" },
  { name: "ink", hex: "#1e3a8a" },
];

const article = `<h3>Release notes</h3>
<p><span data-text-color="red">Palette red</span> and <span data-background-color="yellow">a yellow highlight</span> follow the theme.</p>
<p><span style="color:#1f6feb">Exact #1f6feb</span>, <span style="background-color:#d1fae5">#d1fae5 behind it</span>, and <span style="color:#3b0764">a dark purple</span> stay exact.</p>
<p><span data-text-color="brand" style="color:#ff5a1f">Brand orange</span> comes from the integrator's swatches.</p>
<p style="background-color:#fef3c7">A whole paragraph can have a colour too, here #fef3c7.</p>`;

const pasted = `<p>From a web page: <span style="color: rgb(225, 62, 62)">almost palette red</span>, <span style="color: hsl(330, 100%, 45%)">hot pink</span>, <span style="background: rgba(16, 185, 129, 0.25)">a translucent green</span> and <span style="color:#222">near-black</span>.</p>`;

/** Dispatches a real paste event, the same one ⌘V / Ctrl+V produces, on a new empty line. */
function pasteInto(editor: BlockEditorHandle, html: string) {
  const doc = editor.editor.document;
  const [line] = editor.editor.insertBlocks([{ type: "paragraph" }], doc[doc.length - 1], "after");
  editor.editor.setTextCursorPosition(line, "start");
  editor.focus();
  const transfer = new DataTransfer();
  transfer.setData("text/html", html);
  transfer.setData("text/plain", html.replace(/<[^>]+>/g, ""));
  editor.editor.domElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
}

export default function ColorsExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [custom, setCustom] = useState(true);
  const [contrast, setContrast] = useState(false);
  const [html, setHtml] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-15 text-sm">
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => editor.current && pasteInto(editor.current, pasted)}>
          Paste colored HTML
        </button>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} data-testid="custom-toggle" />
          Custom colors
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={contrast} onChange={(e) => setContrast(e.target.checked)} data-testid="contrast-toggle" />
          colorContrast=&quot;auto&quot;
        </label>
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => setHtml(editor.current?.getHTML() ?? "")}>
          Export HTML
        </button>
      </div>
      <BlockEditor
        key={String(custom)}
        ref={editor}
        theme={theme} // hide
        format="html"
        defaultValue={article}
        tools={{ colors: { custom, swatches }, fontSize: true, bold: true, italic: true, heading: true, link: true }}
        colorContrast={contrast ? "auto" : "off"}
      />
      {html && (
        <pre className="mx-15 overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap" data-testid="colors-html">
          {html}
        </pre>
      )}
    </div>
  );
}
