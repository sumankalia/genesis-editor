"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";
import { toHTML, type HtmlBlock } from "genesis-editor/parser";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const article = `<h3>Weekend watch list</h3>
<p>A video, a song, and a poll from a site the editor doesn't know:</p>
<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ" title="Big Buck Bunny" width="560" height="315"></iframe>
<iframe src="https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT"></iframe>
<iframe src="https://example.com/" title="Example widget" width="600" height="300"></iframe>`;

const samples = {
  url: { label: "Paste a YouTube link", text: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  iframe: {
    label: "Paste Vimeo iframe code",
    html: '<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e" width="640" height="360" allow="autoplay; camera" sandbox="allow-same-origin allow-top-navigation"></iframe>',
  },
  unknown: { label: "Paste an unknown iframe", html: '<iframe src="https://example.org/" width="800" height="400" title="Some page"></iframe>' },
  sentence: { label: "Paste a link inside a sentence", html: '<p>Have you seen <a href="https://youtu.be/dQw4w9WgXcQ">https://youtu.be/dQw4w9WgXcQ</a> yet?</p>' },
};

/** Dispatches a real paste event, the same one ⌘V / Ctrl+V produces, on a new empty line. */
function pasteInto(editor: BlockEditorHandle, data: { html?: string; text?: string }) {
  const doc = editor.editor.document;
  const last = doc[doc.length - 1];
  const [line] = editor.editor.insertBlocks([{ type: "paragraph" }], last, "after");
  editor.editor.setTextCursorPosition(line, "start");
  editor.focus();
  const transfer = new DataTransfer();
  if (data.html) transfer.setData("text/html", data.html);
  transfer.setData("text/plain", data.text ?? (data.html ?? "").replace(/<[^>]+>/g, ""));
  editor.editor.domElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
}

export default function EmbedsExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [policy, setPolicy] = useState<"open" | "allowlist">("open");
  const [clickToLoad, setClickToLoad] = useState(false);
  const [form, setForm] = useState<"iframe" | "link" | null>(null);
  const [html, setHtml] = useState("");

  const show = (next: "iframe" | "link") => {
    setForm(next);
    const blocks = editor.current?.getBlocks() as unknown as HtmlBlock[];
    setHtml(toHTML(blocks ?? [], { embeds: next }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => editor.current && pasteInto(editor.current, { text: samples.url.text })}>
          {samples.url.label}
        </button>
        {(["iframe", "unknown", "sentence"] as const).map((key) => (
          <button
            key={key}
            className="rounded-md border px-2.5 py-1 hover:bg-muted"
            onClick={() => editor.current && pasteInto(editor.current, { html: samples[key].html })}
          >
            {samples[key].label}
          </button>
        ))}
        <label className="inline-flex items-center gap-1.5">
          Policy
          <select
            className="rounded-md border bg-background px-1.5 py-1"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as "open" | "allowlist")}
            data-testid="embed-policy"
          >
            <option value="open">open</option>
            <option value="allowlist">allowlist</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={clickToLoad}
            onChange={(e) => setClickToLoad(e.target.checked)}
            data-testid="embed-click-to-load"
          />
          Wait for click
        </label>
      </div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        key={`${policy}-${clickToLoad}`}
        ref={editor}
        format="html"
        defaultValue={article}
        embeds={{ policy, clickToLoad }}
      />
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => show("iframe")}>
          Export HTML
        </button>
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => show("link")}>
          Export for email (links)
        </button>
      </div>
      {form && (
        <pre className="mx-15 max-h-56 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap" data-testid="embed-html">
          {html}
        </pre>
      )}
    </div>
  );
}
