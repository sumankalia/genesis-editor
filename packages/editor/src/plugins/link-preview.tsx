import { createBlockSpec, type Block, type BlockNoteEditor } from "@blocknote/core";
import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { PanelTop } from "lucide-react";
import { closeHistory } from "prosemirror-history";

import { linkPreviewsOf } from "../lib/link-preview";
import { embedBlockProps, embedForUrl } from "../parser/embeds";
import { cleanPreviewUrl, previewDomain, type LinkPreviewProps } from "../parser/link-preview";
import { bareUrl, el, embedRegistryOf, isolate, linkBlock, type LooseBlock } from "./embed";
import type { AnyEditor, SlashMenuItem } from "./types";

const hasMeta = (props: LinkPreviewProps) => Boolean(props.title || props.description || props.image);

/** Metadata fills in, or the card falls back to a link, outside the undo history: undo goes back to the paste. */
function quietly(editor: AnyEditor, change: () => void) {
  editor.transact((tr) => {
    tr.setMeta("addToHistory", false);
    change();
  });
}

function fetchInto(block: LooseBlock, editor: AnyEditor, url: string) {
  linkPreviewsOf(editor)
    ?.load(url)
    .then(
      (card) => {
        const current = editor.getBlock(block.id) as unknown as LooseBlock | undefined;
        const props = current?.props as LinkPreviewProps | undefined;
        if (!current || props?.url !== url || hasMeta(props)) return;
        quietly(editor, () => editor.updateBlock(block.id, { props: { ...card, url } } as never));
      },
      () => {
        const current = editor.getBlock(block.id) as unknown as LooseBlock | undefined;
        const props = current?.props as LinkPreviewProps | undefined;
        if (!current || props?.url !== url || hasMeta(props) || !editor.isEditable) return;
        quietly(editor, () => editor.replaceBlocks([block.id], [linkBlock(editor, url, url)] as never));
      },
    );
}

function renderEmpty(block: LooseBlock, editor: AnyEditor, dom: HTMLElement) {
  dom.dataset.state = "empty";
  if (!editor.isEditable) return;
  const form = el("form", "genesis-embed-form genesis-link-preview-form");
  const input = el("input", "genesis-embed-input genesis-link-preview-input");
  input.placeholder = "Paste a link";
  input.setAttribute("aria-label", "Link to preview");
  const button = el("button", "genesis-embed-submit genesis-link-preview-submit", "Preview");
  button.type = "submit";
  const error = el("p", "genesis-embed-error genesis-link-preview-error");
  error.setAttribute("role", "alert");
  form.append(input, button, error);
  input.addEventListener("input", () => (error.textContent = ""));
  isolate(form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = input.value.trim();
    const url = cleanPreviewUrl(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!raw || !url) {
      error.textContent = "Enter an http or https link.";
      return;
    }
    // A link an embed provider handles shows as the embed instead.
    const resolved = "embed" in editor.schema.blockSchema ? embedForUrl(url, embedRegistryOf(editor)) : null;
    if (resolved) editor.replaceBlocks([block.id], [{ type: "embed", props: embedBlockProps(resolved) }] as never);
    else editor.updateBlock(block.id, { props: { url } } as never);
  });
  dom.append(form);
  if (editor.domElement?.contains(document.activeElement)) requestAnimationFrame(() => input.focus());
}

function render(block: LooseBlock, editor: AnyEditor) {
  const props = block.props as unknown as LinkPreviewProps;
  const dom = el("div", "genesis-link-preview");
  dom.contentEditable = "false";
  const url = cleanPreviewUrl(props.url);
  if (!url) {
    renderEmpty(block, editor, dom);
    return { dom };
  }
  const domain = previewDomain(url);
  const controller = linkPreviewsOf(editor);
  const loading = !hasMeta(props) && editor.isEditable && !!controller?.configured;
  dom.dataset.state = loading ? "loading" : hasMeta(props) ? "ready" : "plain";
  if (loading) fetchInto(block, editor, url);

  const body = el("div", "genesis-link-preview-body");
  if (props.image && !loading) {
    const image = el("img", "genesis-link-preview-image");
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = props.image;
    body.append(image);
  }
  const text = el("div", "genesis-link-preview-text");
  text.append(el("strong", "genesis-link-preview-title", loading ? "Loading preview…" : props.title || url));
  if (props.description && !loading) text.append(el("p", "genesis-link-preview-description", props.description));
  const site = el("div", "genesis-link-preview-site");
  if (props.favicon && !loading) {
    const icon = el("img", "genesis-link-preview-favicon");
    icon.alt = "";
    icon.referrerPolicy = "no-referrer";
    icon.addEventListener("error", () => icon.remove(), { once: true });
    icon.src = props.favicon;
    site.append(icon);
  }
  const siteName = props.siteName && props.siteName !== domain ? props.siteName : "";
  site.append(el("span", "genesis-link-preview-domain", [siteName, domain].filter(Boolean).join(" · ")));
  text.append(site);
  body.append(text);
  if (loading) body.setAttribute("aria-busy", "true");
  dom.append(body);

  const bar = el("div", "genesis-embed-bar genesis-link-preview-bar");
  bar.append(el("span", "genesis-embed-spacer"));
  const open = el("a", "genesis-embed-open", "Open ↗");
  open.href = url;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  bar.append(open);
  if (editor.isEditable) {
    const toLink = el("button", "genesis-embed-to-link", "Convert to link");
    toLink.type = "button";
    toLink.addEventListener("click", () => editor.replaceBlocks([block.id], [linkBlock(editor, url, url)] as never));
    bar.append(toLink);
  }
  isolate(bar);
  dom.append(bar);
  return { dom };
}

/**
 * A third-party page as a card. The metadata is stored in the block, so a saved document draws without
 * fetching; only a card with none (just pasted or inserted) asks the configured `linkPreview` source.
 */
export const linkPreviewSpec = createBlockSpec(
  {
    type: "linkPreview",
    propSchema: {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      image: { default: "" },
      siteName: { default: "" },
      favicon: { default: "" },
    },
    content: "none",
  },
  {
    render: (block, editor) => render(block as unknown as LooseBlock, editor as unknown as AnyEditor),
  },
)();

const slashItem: SlashMenuItem = {
  key: "linkPreview",
  title: "Link preview",
  subtext: "A card with the page's title, description and image",
  aliases: ["bookmark", "card", "preview", "url", "og"],
  group: "Media",
  icon: <PanelTop size={18} />,
  block: { type: "linkPreview" },
};

/** Offered only while previews are configured: without a source the card couldn't fill in. */
export const linkPreviewSlashItems = (editor: AnyEditor) => (linkPreviewsOf(editor)?.configured ? [slashItem] : []);

/** The URL of a bare-link paragraph that would become a card (not an embed provider's link), or null. */
function previewableUrl(editor: AnyEditor, block: LooseBlock) {
  const url = bareUrl(block);
  if (!url || !cleanPreviewUrl(url)) return null;
  if ("embed" in editor.schema.blockSchema && embedForUrl(url, embedRegistryOf(editor))) return null;
  return url;
}

/** Toolbar button on a paragraph that is only a link: shows it as a preview card. */
export function LinkPreviewButton() {
  const editor = useBlockNoteEditor() as unknown as AnyEditor;
  const Components = useComponentsContext()!;
  const target = useEditorState({
    editor: editor as never,
    selector: () => {
      if (!linkPreviewsOf(editor)?.configured) return null;
      const block = editor.getTextCursorPosition().block as unknown as LooseBlock;
      const url = previewableUrl(editor, block);
      return url ? { id: block.id, url } : null;
    },
    equalityFn: (a, b) => a?.id === b?.id && a?.url === b?.url,
  });
  if (!target) return null;
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label="Show as preview card"
      mainTooltip="Show as preview card"
      icon={<PanelTop size={16} />}
      onClick={() => editor.replaceBlocks([target.id], [{ type: "linkPreview", props: { url: target.url } }] as never)}
    />
  );
}

/**
 * After a paste, with previews configured: paragraphs that are only a URL become cards, in their own undo
 * step, so one undo turns the card back into the link. A URL inside a sentence stays a link.
 */
export function convertBareLinkPreviews(editor: BlockNoteEditor, blocks: readonly Block[]) {
  const loose = editor as unknown as AnyEditor;
  if (!("linkPreview" in editor.schema.blockSchema) || !linkPreviewsOf(editor)?.configured) return [];
  const ids = [...new Set(blocks.map((block) => block.id))];
  const targets = ids.flatMap((id) => {
    const current = editor.getBlock(id) as unknown as LooseBlock | undefined;
    const url = current ? previewableUrl(loose, current) : null;
    return current && url ? [{ id: current.id, url }] : [];
  });
  if (!targets.length) return [];
  editor.transact((tr) => {
    closeHistory(tr);
    for (const { id, url } of targets) editor.replaceBlocks([id], [{ type: "linkPreview", props: { url } }] as never);
  });
  return targets.map((target) => target.id);
}
