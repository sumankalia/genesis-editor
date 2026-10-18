"use client";

import { useEffect, useRef, useState } from "react";
import { BlockEditor, type BlockEditorHandle } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

/** Another host for the sample images, so they count as remote: 127.0.0.1 for localhost and back. */
function remoteOrigin() {
  const { protocol, hostname, port } = window.location;
  const other = hostname === "localhost" ? "127.0.0.1" : hostname === "127.0.0.1" ? "localhost" : hostname;
  return `${protocol}//${other}${port ? `:${port}` : ""}`;
}

function articleHtml(origin: string) {
  return `<h3>Field notes</h3>
<p>Two photos from another site:</p>
<figure><img src="${origin}/examples/dunes.png" alt="Dunes at sunset"><figcaption>Dunes at sunset</figcaption></figure>
<figure><img src="${origin}/examples/lake.png" alt="A mountain lake"><figcaption>A mountain lake</figcaption></figure>
<p>The same photo again, uploaded once:</p>
<img src="${origin}/examples/dunes.png#again" alt="Dunes again">`;
}

/** Dispatches a real paste event, the same one ⌘V / Ctrl+V produces. */
function pasteInto(editor: BlockEditorHandle, html: string) {
  const doc = editor.editor.document;
  editor.editor.setTextCursorPosition(doc[doc.length - 1], "end");
  editor.focus();
  const data = new DataTransfer();
  data.setData("text/html", html);
  data.setData("text/plain", html.replace(/<[^>]+>/g, ""));
  editor.editor.domElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}

export default function ImageRehostExample() {
  const theme = useSiteTheme(); // hide
  const editor = useRef<BlockEditorHandle>(null);
  const [failing, setFailing] = useState(false);
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);

  // `pendingUploads` isn't reactive; poll it for the counter.
  useEffect(() => {
    const timer = setInterval(() => setPending(editor.current?.pendingUploads ?? 0), 150);
    return () => clearInterval(timer);
  }, []);

  const save = async () => {
    setSaved("Waiting for uploads…");
    await editor.current?.uploadsSettled();
    setSaved(editor.current?.getHTML() ?? "");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-15 text-sm">
        <button
          className="rounded-md border px-2.5 py-1 hover:bg-muted"
          onClick={() => editor.current && pasteInto(editor.current, articleHtml(remoteOrigin()))}
        >
          Paste an article with remote images
        </button>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={failing} onChange={(e) => setFailing(e.target.checked)} data-testid="rehost-fail" />
          Make the server fail
        </label>
        <button className="rounded-md border px-2.5 py-1 hover:bg-muted" onClick={save}>
          Save when uploads finish
        </button>
        <span className="text-xs text-muted-foreground" data-testid="rehost-pending">
          {pending ? `${pending} uploading` : "Nothing uploading"}
        </span>
      </div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        ref={editor}
        uploadUrl="/api/mock-upload"
        uploadFromUrl={`/api/mock-upload-from-url?delay=1500${failing ? "&fail=1" : ""}`}
      />
      {saved !== null && (
        <pre className="mx-15 max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap" data-testid="rehost-saved">
          {saved}
        </pre>
      )}
    </div>
  );
}
