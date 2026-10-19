import { createInlineContentSpec } from "@blocknote/core";
import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { ImagePlus } from "lucide-react";
import { TextSelection, type Transaction } from "prosemirror-state";

import type { RehostQueue } from "../lib/rehost";
import { REHOST_META } from "./specs";
import { isSafeUrl } from "../parser/sanitize";
import type { AnyEditor, SlashMenuItem } from "./types";

export type InlineImageProps = {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  previewWidth?: number;
  href: string;
  openInNewTab: boolean;
  originalUrl: string;
  hosted: boolean;
};

/** What the inline image dialog edits. `apply(null)` removes the image. */
export type InlineImageRequest = {
  mode: "insert" | "edit";
  props: InlineImageProps;
  apply: (props: InlineImageProps | null) => void;
};

type InlineImageHooks = {
  open: (request: InlineImageRequest) => void;
  queue?: RehostQueue;
};

const hooksByEditor = new WeakMap<object, InlineImageHooks>();

/** Lets this editor's inline images open the dialog and show re-upload progress. */
export function registerInlineImages(editor: object, hooks: InlineImageHooks) {
  hooksByEditor.set(editor, hooks);
}

/** Re-upload jobs for inline images are per URL: every copy of the image is swapped together. */
export const inlineImageJobKey = (url: string) => `inline:${url}`;
export const isInlineImageJob = (key: string) => key.startsWith("inline:");

export const EMPTY_INLINE_IMAGE: InlineImageProps = { url: "", alt: "", href: "", openInNewTab: false, originalUrl: "", hosted: false };

const MIN_WIDTH = 24;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function linkHost(href: string) {
  try {
    return new URL(href, window.location.href).host || href;
  } catch {
    return href;
  }
}

/** Drags the right edge to set `previewWidth`, never wider than the cell or line it sits in. */
function resizeHandle(wrap: HTMLElement, img: HTMLImageElement, commit: (width: number) => void) {
  const handle = el("span", "genesis-inline-image-handle");
  handle.dataset.testid = "inline-image-resize";
  handle.contentEditable = "false";
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const start = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const box = wrap.closest("td, th, .bn-inline-content") as HTMLElement | null;
    const max = box ? box.clientWidth : Infinity;
    let width = startWidth;
    const move = (e: PointerEvent) => {
      width = Math.round(Math.max(MIN_WIDTH, Math.min(max, startWidth + e.clientX - start)));
      img.style.width = `${width}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (Math.abs(width - startWidth) >= 1) commit(width);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  return handle;
}

function imageElement(props: InlineImageProps) {
  const img = document.createElement("img");
  if (props.url && isSafeUrl(props.url, true)) img.src = props.url;
  img.alt = props.alt;
  img.draggable = false;
  if (props.previewWidth) img.style.width = `${props.previewWidth}px`;
  if (props.width && props.height) img.style.aspectRatio = `${props.width} / ${props.height}`;
  return img;
}

/**
 * An image inside text, mostly in table cells (BlockNote cells hold inline content only). It's capped to the
 * cell's width, resized from its right edge, and edited (URL or upload, alt text, link) from its dialog.
 */
export const inlineImageSpec = createInlineContentSpec(
  {
    type: "inlineImage",
    propSchema: {
      url: { default: "" },
      alt: { default: "" },
      width: { default: undefined, type: "number" },
      height: { default: undefined, type: "number" },
      previewWidth: { default: undefined, type: "number" },
      href: { default: "" },
      openInNewTab: { default: false },
      originalUrl: { default: "" },
      hosted: { default: false },
    },
    content: "none",
  },
  {
    render(inlineContent, updateInlineContent, editor, node, getPos) {
      const props = inlineContent.props as InlineImageProps;
      const wrap = el("span", "genesis-inline-image");
      wrap.dataset.testid = "inline-image";
      const img = imageElement(props);
      wrap.append(img);
      const hooks = hooksByEditor.get(editor);
      const cleanups: (() => void)[] = [];

      if (props.href && isSafeUrl(props.href)) {
        const badge = el("a", "genesis-inline-image-link");
        badge.contentEditable = "false";
        badge.dataset.testid = "inline-image-link";
        badge.href = props.href;
        badge.target = "_blank";
        badge.rel = "noopener noreferrer";
        badge.title = `Link · ${linkHost(props.href)}${props.openInNewTab ? " (new tab)" : ""}`;
        badge.textContent = "↗";
        badge.addEventListener("mousedown", (event) => event.stopPropagation());
        wrap.append(badge);
      }

      const queue = hooks?.queue;
      if (queue && props.url) {
        const badge = el("span", "genesis-inline-image-status");
        badge.contentEditable = "false";
        badge.dataset.testid = "inline-rehost-badge";
        badge.setAttribute("role", "status");
        const key = inlineImageJobKey(props.url);
        const update = () => {
          const status = queue.statuses.get(key);
          badge.hidden = !status;
          badge.dataset.state = status?.state ?? "";
          badge.title = status?.state === "failed" ? `Not re-uploaded: ${status.message}` : status ? "Re-uploading" : "";
          badge.textContent = status?.state === "failed" ? "!" : "";
        };
        update();
        cleanups.push(queue.statuses.subscribe(update));
        wrap.append(badge);
      }

      if (editor.isEditable && hooks) {
        const edit = el("button", "genesis-inline-image-edit");
        edit.type = "button";
        edit.contentEditable = "false";
        edit.textContent = "Edit";
        edit.setAttribute("aria-label", "Edit image");
        edit.dataset.testid = "inline-image-edit";
        edit.addEventListener("mousedown", (event) => event.preventDefault());
        edit.addEventListener("click", (event) => {
          event.preventDefault();
          hooks.open({
            mode: "edit",
            props,
            apply: (next) => {
              if (next) return updateInlineContent({ type: "inlineImage", props: next } as never);
              const pos = getPos();
              if (pos !== undefined) editor.transact((tr) => tr.delete(pos, pos + node.nodeSize));
            },
          });
        });
        wrap.append(edit, resizeHandle(wrap, img, (previewWidth) => updateInlineContent({ type: "inlineImage", props: { ...props, previewWidth } } as never)));
      }
      return { dom: wrap, destroy: () => cleanups.forEach((fn) => fn()) };
    },
    toExternalHTML(inlineContent) {
      const props = inlineContent.props as InlineImageProps;
      const img = imageElement(props);
      if (!props.href || !isSafeUrl(props.href)) return { dom: img };
      const link = document.createElement("a");
      link.href = props.href;
      if (props.openInNewTab) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      link.append(img);
      return { dom: link };
    },
  },
);

type Doc = { descendants: (fn: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => boolean | void) => void };

/** Whether the document still shows an inline image with this URL. */
export function hasInlineImage(editor: AnyEditor, url: string) {
  let found = false;
  editor.transact((tr) =>
    (tr.doc as unknown as Doc).descendants((node) => {
      if (node.type.name === "inlineImage" && node.attrs.url === url) found = true;
      return !found;
    }),
  );
  return found;
}

/** Swaps a re-hosted URL into every inline image showing `from`, outside the undo history. */
export function swapInlineImageUrl(editor: AnyEditor, from: string, to: string) {
  let swapped = 0;
  editor.transact((tr) => {
    const hits: { pos: number; attrs: Record<string, unknown> }[] = [];
    (tr.doc as unknown as Doc).descendants((node, pos) => {
      if (node.type.name === "inlineImage" && node.attrs.url === from) hits.push({ pos, attrs: node.attrs });
    });
    if (!hits.length) return;
    tr.setMeta("addToHistory", false);
    tr.setMeta(REHOST_META, true);
    for (const { pos, attrs } of hits) {
      tr.setNodeMarkup(pos, undefined, { ...attrs, url: to, ...(/^https?:/i.test(from) ? { originalUrl: from } : {}), hosted: true });
    }
    swapped = hits.length;
  });
  return swapped;
}

/** A TextSelection inside inline content near `at`, so insert still lands in a table cell after the dialog. */
function selectionNearInline(tr: Transaction, at: number) {
  const size = tr.doc.content.size;
  const clamp = (pos: number) => Math.max(1, Math.min(pos, size));
  for (const pos of [at, at - 1, at + 1, at - 2, at + 2]) {
    const $pos = tr.doc.resolve(clamp(pos));
    if ($pos.parent.inlineContent) return TextSelection.near($pos, 1);
  }
  const $at = tr.doc.resolve(clamp(at));
  for (let depth = $at.depth; depth > 0; depth--) {
    if ($at.node(depth).inlineContent) {
      return TextSelection.create(tr.doc, $at.start(depth) + Math.min($at.parentOffset, $at.node(depth).content.size));
    }
  }
  return TextSelection.near($at, 1);
}

/** Opens the dialog to insert an image at the cursor. */
export function openInsertInlineImage(editor: AnyEditor) {
  const hooks = hooksByEditor.get(editor);
  if (!hooks) return;
  // The modal dialog takes focus, and the editor's selection doesn't survive it.
  const at = editor.transact((tr) => tr.selection.from);
  hooks.open({
    mode: "insert",
    props: EMPTY_INLINE_IMAGE,
    apply: (props) => {
      if (!props) return;
      editor.focus();
      editor.transact((tr) => {
        tr.setSelection(selectionNearInline(tr, at));
      });
      editor.insertInlineContent([{ type: "inlineImage", props } as never, " "]);
    },
  });
}

const cursorInText = (editor: AnyEditor) => {
  const block = editor.getTextCursorPosition().block as { content?: unknown };
  return Array.isArray(block.content) || (block.content as { type?: string } | undefined)?.type === "tableContent";
};

export const inlineImageSlashItem: SlashMenuItem = {
  key: "inlineImage",
  title: "Inline image",
  subtext: "An image inside text or a table cell",
  aliases: ["image in text", "image in cell", "icon", "table image"],
  group: "Media",
  icon: <ImagePlus size={18} />,
  onItemClick: (editor) => openInsertInlineImage(editor),
};

/** Toolbar button: puts an image at the end of the selection, in a cell or a line of text. */
export function InlineImageButton() {
  const editor = useBlockNoteEditor() as unknown as AnyEditor;
  const Components = useComponentsContext()!;
  const show = useEditorState({ editor: editor as never, selector: () => editor.isEditable && hooksByEditor.has(editor) && cursorInText(editor) });
  if (!show) return null;
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label="Insert inline image"
      mainTooltip="Insert inline image"
      icon={<ImagePlus size={16} />}
      onClick={() => {
        editor.transact((tr) => tr.setSelection(TextSelection.create(tr.doc, tr.selection.to)));
        openInsertInlineImage(editor);
      }}
    />
  );
}
