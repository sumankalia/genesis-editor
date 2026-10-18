import { createBlockSpec, type Block, type BlockNoteEditor } from "@blocknote/core";
import { SquarePlay } from "lucide-react";
import { closeHistory } from "prosemirror-history";

import {
  cleanAspectRatio,
  embedBlockProps,
  embedForIframe,
  embedForUrl,
  embedRegistry,
  resolveEmbedBlock,
  type EmbedRegistry,
  type ResolvedEmbed,
} from "../parser/embeds";
import type { AnyEditor } from "./types";

type LooseBlock = { id: string; type: string; props: Record<string, unknown>; content: unknown; children: unknown[] };

const registries = new WeakMap<object, EmbedRegistry>();

/** The providers and policy an editor's embed blocks are drawn with. */
export function registerEmbedRegistry(editor: object, registry: EmbedRegistry) {
  registries.set(editor, registry);
}

export const embedRegistryOf = (editor: object) => registries.get(editor) ?? embedRegistry();

type EmbedBlockProps = {
  provider: string;
  url: string;
  embedUrl: string;
  aspectRatio: string;
  height: number;
  title: string;
  caption: string;
  previewWidth: number;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

// ProseMirror listens on the editor root; controls inside the block keep their own keys and clicks.
function isolate(node: HTMLElement) {
  for (const type of ["keydown", "keypress", "beforeinput", "input", "mousedown", "paste", "drop"]) {
    node.addEventListener(type, (event) => event.stopPropagation());
  }
}

/** What the `/embed` input accepts: a provider URL, `<iframe>` code, or (with generic embeds on) any `https:` page. */
export function resolveEmbedInput(value: string, registry: EmbedRegistry): { resolved: ResolvedEmbed; aspectRatio?: string; title?: string } | null {
  const text = value.trim();
  if (text.startsWith("<")) {
    const frame = new DOMParser().parseFromString(text, "text/html").querySelector("iframe");
    const src = frame?.getAttribute("src");
    const resolved = src ? embedForIframe(src, registry) : null;
    if (!resolved || !frame) return null;
    const width = Number(frame.getAttribute("width"));
    const height = Number(frame.getAttribute("height"));
    const aspectRatio = !resolved.provider ? (width > 0 && height > 0 ? cleanAspectRatio(`${width}/${height}`) : "16/9") : undefined;
    return { resolved, aspectRatio, title: frame.getAttribute("title")?.trim() || undefined };
  }
  const resolved = embedForUrl(text, registry) ?? embedForIframe(text, registry);
  return resolved ? { resolved, aspectRatio: resolved.provider ? undefined : "16/9" } : null;
}

function linkBlock(editor: AnyEditor, url: string, label: string) {
  const hasLink = "link" in (editor.schema.inlineContentSchema as object);
  return { type: "paragraph", content: hasLink ? [{ type: "link", href: url, content: label }] : label };
}

function renderEmpty(block: LooseBlock, editor: AnyEditor, dom: HTMLElement) {
  dom.classList.add("genesis-embed--empty");
  if (!editor.isEditable) return;
  const form = el("form", "genesis-embed-form");
  const input = el("input", "genesis-embed-input");
  input.placeholder = "Paste a link or <iframe> code";
  input.setAttribute("aria-label", "Embed link or iframe code");
  const button = el("button", "genesis-embed-submit", "Embed");
  button.type = "submit";
  const error = el("p", "genesis-embed-error");
  error.setAttribute("role", "alert");
  form.append(input, button, error);
  input.addEventListener("input", () => (error.textContent = ""));
  isolate(form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const registry = embedRegistryOf(editor);
    const result = resolveEmbedInput(input.value, registry);
    if (!result) {
      error.textContent = registry.generic
        ? "That isn't an https link or iframe code we can embed."
        : "Only links from supported sites can be embedded here.";
      return;
    }
    editor.updateBlock(block.id, { props: embedBlockProps(result.resolved, { aspectRatio: result.aspectRatio, title: result.title }) } as never);
  });
  dom.append(form);
  // After "/embed" the editor has focus; on load it doesn't, so nothing is stolen.
  if (editor.domElement?.contains(document.activeElement)) requestAnimationFrame(() => input.focus());
}

function render(block: LooseBlock, editor: AnyEditor) {
  const props = block.props as unknown as EmbedBlockProps;
  const dom = el("div", "genesis-embed");
  dom.contentEditable = "false";
  if (!props.url && !props.embedUrl) {
    renderEmpty(block, editor, dom);
    return { dom };
  }
  const resolved = resolveEmbedBlock(props, embedRegistryOf(editor));
  const pageUrl = resolved?.url ?? props.url;
  const width = props.previewWidth || resolved?.frame.maxWidth;
  if (width) dom.style.maxWidth = `${width}px`;

  if (resolved) {
    const box = el("div", "genesis-embed-frame");
    const height = props.height || (props.aspectRatio ? 0 : resolved.frame.height ?? 0);
    if (height) box.style.height = `${height}px`;
    else box.style.aspectRatio = cleanAspectRatio(props.aspectRatio) ?? resolved.frame.aspectRatio ?? "16/9";
    const iframe = document.createElement("iframe");
    // Sandbox before src, so the frame never loads unsandboxed.
    iframe.setAttribute("sandbox", resolved.frame.sandbox);
    iframe.setAttribute("referrerpolicy", resolved.provider ? "strict-origin-when-cross-origin" : "no-referrer");
    iframe.setAttribute("loading", "lazy");
    iframe.title = props.title || `${resolved.label} embed`;
    if (resolved.frame.allow) {
      iframe.setAttribute("allow", resolved.frame.allow);
      iframe.setAttribute("allowfullscreen", "");
    }
    if (!resolved.provider) iframe.setAttribute("credentialless", "");
    iframe.src = resolved.frame.src;
    box.append(iframe);
    dom.append(box);
  } else {
    dom.classList.add("genesis-embed--blocked");
    dom.append(el("p", "genesis-embed-blocked", "This embed isn't allowed here."));
  }

  const bar = el("div", "genesis-embed-bar");
  let host = "";
  try {
    host = new URL(pageUrl).host;
  } catch {
    // An unparsable stored URL still shows the bar, without a host.
  }
  bar.append(el("span", "genesis-embed-host", resolved?.provider ? resolved.label : host));
  if (props.caption) bar.append(el("span", "genesis-embed-caption", props.caption));
  bar.append(el("span", "genesis-embed-spacer"));
  if (/^https?:\/\//i.test(pageUrl)) {
    const open = el("a", "genesis-embed-open", "Open ↗");
    open.href = pageUrl;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    bar.append(open);
    if (editor.isEditable) {
      const toLink = el("button", "genesis-embed-to-link", "Convert to link");
      toLink.type = "button";
      toLink.addEventListener("click", () => editor.replaceBlocks([block.id], [linkBlock(editor, pageUrl, props.title || pageUrl)] as never));
      bar.append(toLink);
    }
  }
  isolate(bar);
  dom.append(bar);
  return { dom };
}

/**
 * Embeds (design §8): provider frames are rebuilt from `url` on every render, generic ones are
 * validated again and sandboxed, and the editor's `embeds` policy decides which may show.
 */
export const embedSpec = createBlockSpec(
  {
    type: "embed",
    propSchema: {
      provider: { default: "" },
      url: { default: "" },
      embedUrl: { default: "" },
      aspectRatio: { default: "" },
      height: { default: 0 },
      title: { default: "" },
      caption: { default: "" },
      previewWidth: { default: 0 },
    },
    content: "none",
  },
  {
    render: (block, editor) => render(block as unknown as LooseBlock, editor as unknown as AnyEditor),
  },
)();

export const embedSlashItem = {
  key: "embed",
  title: "Embed",
  subtext: "YouTube, X, Figma, maps, or iframe code",
  aliases: ["iframe", "youtube", "video", "tweet", "twitter", "figma", "spotify", "map", "loom", "codepen"],
  group: "Media",
  icon: <SquarePlay size={18} />,
  block: { type: "embed" },
};

const linkText = (content: unknown) =>
  Array.isArray(content) ? content.map((part: { text?: string }) => part.text ?? "").join("") : "";

/** The provider URL when the block is a paragraph holding only a link to it, written as the URL. */
function bareProviderUrl(block: LooseBlock, registry: EmbedRegistry) {
  if (block.type !== "paragraph" || block.children.length) return null;
  const content = (block.content as unknown as { type: string; text?: string; href?: string; content?: unknown }[]).filter(
    (part) => part.type !== "text" || part.text?.trim(),
  );
  if (content.length !== 1) return null;
  const [part] = content;
  const url = part.type === "link" ? part.href : part.type === "text" ? part.text?.trim() : undefined;
  if (!url || !/^https?:\/\/\S+$/.test(url)) return null;
  if (part.type === "link") {
    const text = linkText(part.content).trim();
    const same = (a: string) => a.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    if (same(text) !== same(url)) return null;
  }
  return embedForUrl(url, registry);
}

/**
 * After a paste: paragraphs that are only a provider URL become embeds, in their own undo step, so
 * one undo turns the embed back into the link. A URL inside a sentence stays a link.
 */
export function convertBareEmbedLinks(editor: BlockNoteEditor, blocks: readonly Block[]) {
  if (!("embed" in editor.schema.blockSchema)) return [];
  const registry = embedRegistryOf(editor);
  const ids = [...new Set(blocks.map((block) => block.id))];
  const targets = ids.flatMap((id) => {
    const current = editor.getBlock(id);
    const resolved = current ? bareProviderUrl(current as unknown as LooseBlock, registry) : null;
    return current && resolved ? [{ id: current.id, resolved }] : [];
  });
  if (!targets.length) return [];
  editor.transact((tr) => {
    closeHistory(tr);
    for (const { id, resolved } of targets) editor.replaceBlocks([id], [{ type: "embed", props: embedBlockProps(resolved) }] as never);
  });
  return targets.map((target) => target.id);
}
