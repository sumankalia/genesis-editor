import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { Link2 } from "lucide-react";

import { isSafeUrl } from "../parser/sanitize";
import type { AnyEditor } from "../plugins/types";
import { normalizeUrl } from "./link-dialog";
import { Button, Input } from "./ui";

export type ImageLinkTarget = { blockId: string; href: string; openInNewTab: boolean };

/** Opens the image link dialog for an image block. */
export const ImageLinkContext = createContext<(target: ImageLinkTarget) => void>(() => {});

type ImageBlockLike = { id: string; type: string; props: { url?: string; href?: string; openInNewTab?: boolean } };

function selectedImage(editor: AnyEditor): ImageLinkTarget | null {
  const blocks = (editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]) as unknown as ImageBlockLike[];
  const [block] = blocks;
  if (blocks.length !== 1 || block.type !== "image" || !block.props.url) return null;
  return { blockId: block.id, href: block.props.href ?? "", openInNewTab: block.props.openInNewTab === true };
}

/** Image toolbar button: add, edit or remove the link around the image. */
export function ImageLinkButton() {
  const editor = useBlockNoteEditor() as unknown as AnyEditor;
  const Components = useComponentsContext()!;
  const open = useContext(ImageLinkContext);
  const target = useEditorState({
    editor: editor as never,
    selector: () => (editor.isEditable ? selectedImage(editor) : null),
    equalityFn: (a, b) => a?.blockId === b?.blockId && a?.href === b?.href && a?.openInNewTab === b?.openInNewTab,
  });
  if (!target) return null;
  const label = target.href ? "Edit image link" : "Link image";
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label={label}
      mainTooltip={label}
      icon={<Link2 size={16} />}
      isSelected={!!target.href}
      onClick={() => open(target)}
    />
  );
}

type ImageLinkDialogProps = {
  target: ImageLinkTarget | null;
  onClose: () => void;
  onSubmit: (target: ImageLinkTarget) => void;
};

export function ImageLinkDialog({ target, onClose, onSubmit }: ImageLinkDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
  }, [target]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid="image-link-dialog"
      className="genesis-editor-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {target && <ImageLinkForm key={target.blockId} titleId={titleId} target={target} onCancel={onClose} onSubmit={onSubmit} />}
    </dialog>
  );
}

function ImageLinkForm({
  titleId,
  target,
  onCancel,
  onSubmit,
}: {
  titleId: string;
  target: ImageLinkTarget;
  onCancel: () => void;
  onSubmit: (target: ImageLinkTarget) => void;
}) {
  const [url, setUrl] = useState(target.href);
  const [newTab, setNewTab] = useState(target.openInNewTab);
  const [error, setError] = useState("");
  const checkboxId = useId();

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const href = normalizeUrl(url.trim());
        if (!url.trim() || !isSafeUrl(href)) {
          setError("Use an http, https, mailto or tel link.");
          return;
        }
        onSubmit({ blockId: target.blockId, href, openInNewTab: newTab });
      }}
    >
      <div className="grid gap-1">
        <h2 id={titleId} className="text-base font-medium leading-none">
          {target.href ? "Edit image link" : "Link image"}
        </h2>
        <p className="text-muted-foreground">Readers who click the image go to this address.</p>
      </div>
      <Input
        autoFocus
        aria-label="Image link URL"
        placeholder="https://example.com"
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
          setError("");
        }}
      />
      <label htmlFor={checkboxId} className="flex items-center gap-2">
        <input id={checkboxId} type="checkbox" checked={newTab} onChange={(event) => setNewTab(event.target.checked)} />
        Open in a new tab
      </label>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {target.href && (
          <Button variant="ghost" onClick={() => onSubmit({ blockId: target.blockId, href: "", openInNewTab: false })}>
            Remove link
          </Button>
        )}
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
