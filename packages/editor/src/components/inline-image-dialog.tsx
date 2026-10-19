import { useEffect, useId, useRef, useState } from "react";

import { isSafeUrl } from "../parser/sanitize";
import type { InlineImageProps, InlineImageRequest } from "../plugins/inline-image";
import { normalizeUrl } from "./link-dialog";
import { Button, Input } from "./ui";

type InlineImageDialogProps = {
  request: InlineImageRequest | null;
  onClose: () => void;
  /** Uploads a chosen file and returns its URL; left out when uploads aren't configured. */
  upload?: (file: File) => Promise<string>;
};

export function InlineImageDialog({ request, onClose, upload }: InlineImageDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid="inline-image-dialog"
      className="genesis-editor-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {request && <InlineImageForm key={`${request.mode}:${request.props.url}`} titleId={titleId} request={request} onClose={onClose} upload={upload} />}
    </dialog>
  );
}

function InlineImageForm({ titleId, request, onClose, upload }: { titleId: string; request: InlineImageRequest; onClose: () => void; upload?: (file: File) => Promise<string> }) {
  const [url, setUrl] = useState(request.props.url);
  const [alt, setAlt] = useState(request.props.alt);
  const [href, setHref] = useState(request.props.href);
  const [newTab, setNewTab] = useState(request.props.openInNewTab);
  const [hosted, setHosted] = useState(request.props.hosted);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const checkboxId = useId();
  const editing = request.mode === "edit";
  const committed = useRef(false);

  const finish = (props: InlineImageProps | null) => {
    committed.current = true;
    request.apply(props);
    onClose();
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const src = url.trim();
        if (!src || !(isSafeUrl(src, true) && /^(https?:|data:image\/|\/)/i.test(src))) return setError("Use an http or https image address.");
        const link = href.trim() ? normalizeUrl(href.trim()) : "";
        if (link && !isSafeUrl(link)) return setError("Use an http, https, mailto or tel link.");
        const changed = src !== request.props.url;
        finish({
          ...request.props,
          url: src,
          alt: alt.trim(),
          href: link,
          openInNewTab: link ? newTab : false,
          // A new source makes the old size and re-host record stale.
          ...(changed ? { width: undefined, height: undefined, originalUrl: "", hosted } : {}),
        });
      }}
    >
      <div className="grid gap-1">
        <h2 id={titleId} className="text-base font-medium leading-none">
          {editing ? "Edit image" : "Insert inline image"}
        </h2>
        <p className="text-muted-foreground">It sits in the text or table cell and never grows wider than it.</p>
      </div>
      <div className="flex gap-2">
        <Input
          autoFocus
          aria-label="Image URL"
          placeholder="https://example.com/image.png"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setHosted(false);
            setError("");
          }}
        />
        {upload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="inline-image-file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setUploading(true);
                setError("");
                try {
                  setUrl(await upload(file));
                  setHosted(true);
                  if (!alt) setAlt(file.name.replace(/\.[a-z0-9]+$/i, ""));
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Upload failed.");
                } finally {
                  setUploading(false);
                }
              }}
            />
            <Button variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </>
        )}
      </div>
      <Input aria-label="Alt text" placeholder="Describe the image for screen readers" value={alt} onChange={(event) => setAlt(event.target.value)} />
      <Input
        aria-label="Link URL"
        placeholder="Link (optional)"
        value={href}
        onChange={(event) => {
          setHref(event.target.value);
          setError("");
        }}
      />
      <label htmlFor={checkboxId} className="flex items-center gap-2">
        <input id={checkboxId} type="checkbox" checked={newTab} disabled={!href.trim()} onChange={(event) => setNewTab(event.target.checked)} />
        Open the link in a new tab
      </label>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {editing && (
          <Button variant="ghost" onClick={() => finish(null)}>
            Remove image
          </Button>
        )}
        <Button variant="ghost" onClick={() => (editing ? onClose() : finish(null))}>
          Cancel
        </Button>
        <Button type="submit" disabled={!url.trim() || uploading}>
          {editing ? "Apply" : "Insert"}
        </Button>
      </div>
    </form>
  );
}
