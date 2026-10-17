import { useEffect, useId, useRef, useState } from "react";

import { Button, Input } from "./ui";

type LinkDialogProps = {
  open: boolean;
  initialUrl: string;
  onClose: () => void;
  onSubmit: (url: string) => void;
};

export function LinkDialog({ open, initialUrl, onClose, onSubmit }: LinkDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="genesis-editor-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <LinkForm
          titleId={titleId}
          initialUrl={initialUrl}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      )}
    </dialog>
  );
}

function LinkForm({
  titleId,
  initialUrl,
  onCancel,
  onSubmit,
}: {
  titleId: string;
  initialUrl: string;
  onCancel: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = url.trim();
        if (trimmed) onSubmit(normalizeUrl(trimmed));
      }}
    >
      <div className="grid gap-1">
        <h2 id={titleId} className="text-base font-medium leading-none">
          Add link
        </h2>
        <p className="text-muted-foreground">Paste a URL to link the selected text.</p>
      </div>
      <Input
        autoFocus
        aria-label="URL"
        placeholder="https://example.com"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!url.trim()}>
          Apply
        </Button>
      </div>
    </form>
  );
}

export function normalizeUrl(url: string) {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("/") || url.startsWith("#")) {
    return url;
  }
  return `https://${url}`;
}
