"use client";

import { useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle, type HtmlExportOptions } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

// Each site's own "Copy embed code" output, script included. The scripts are never run.
const tweet = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://twitter.com/jack/status/20?ref_src=twsrc%5Etfw">March 21, 2006</a></blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`;

const bluesky = `<blockquote class="bluesky-embed" data-bluesky-uri="at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3my43eyfzs225"><p lang="en">no kings includes billionaires who think they’re kings</p>&mdash; <a href="https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur?ref_src=embed">Bluesky (@bsky.app)</a> <a href="https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3my43eyfzs225?ref_src=embed">October 17, 2026</a></blockquote><script async src="https://embed.bsky.app/static/embed.js" charset="utf-8"></script>`;

const threads = `<blockquote class="text-post-media" data-text-post-permalink="https://www.threads.net/@_edent_/post/C-3dQXkOq6Q" data-text-post-version="0"><a href="https://www.threads.net/@_edent_/post/C-3dQXkOq6Q" target="_blank" rel="noopener"><div>Post by @_edent_</div><div>View on Threads</div></a></blockquote>
<script async src="https://www.threads.net/embed.js"></script>`;

const article = `<h3>Posts worth reading</h3>
<p>Embed code from three sites, as their share dialogs give it:</p>
${tweet}
${bluesky}
${threads}`;

const samples = {
  imgur: {
    label: "Paste Imgur code (HTML)",
    html: `<blockquote class="imgur-embed-pub" lang="en" data-id="pva2rXL"><a href="https://imgur.com/pva2rXL">Never give up</a></blockquote><script async src="//s.imgur.com/min/embed.js" charset="utf-8"></script>`,
  },
  mastodon: {
    label: "Paste Mastodon code as text",
    text: `<blockquote class="mastodon-embed" data-embed-url="https://mastodon.social/@Gargron/117457641525342383/embed"><a href="https://mastodon.social/@Gargron/117457641525342383" target="_blank"><div>Post by @Gargron@mastodon.social</div><div>View on Mastodon</div></a></blockquote> <script data-allowed-prefixes="https://mastodon.social/" async src="https://mastodon.social/embed.js"></script>`,
  },
  gist: { label: "Paste a Gist script", text: `<script src="https://gist.github.com/mbostock/1353700.js"></script>` },
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

const exports: { label: string; options: HtmlExportOptions }[] = [
  { label: "Export HTML", options: {} },
  { label: "Export with scripts", options: { embedScripts: true } },
  { label: "Export as iframes", options: { embeds: "iframe" } },
  { label: "Export for email", options: { embeds: "link" } },
];

export default function EmbedCodeExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [html, setHtml] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        {(["imgur", "mastodon", "gist"] as const).map((key) => (
          <button
            key={key}
            className="rounded-md border px-2.5 py-1 hover:bg-muted"
            onClick={() => editor.current && pasteInto(editor.current, samples[key])}
          >
            {samples[key].label}
          </button>
        ))}
      </div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        ref={editor}
        format="html"
        defaultValue={article}
        embeds={{ clickToLoad: false }} // hide
      />
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        {exports.map(({ label, options }) => (
          <button key={label} className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={() => setHtml(editor.current?.getHTML(options) ?? "")}>
            {label}
          </button>
        ))}
      </div>
      {html !== null && (
        <pre className="mx-15 max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap" data-testid="embed-code-html">
          {html}
        </pre>
      )}
    </div>
  );
}
