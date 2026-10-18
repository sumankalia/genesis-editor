import { createExtension, defaultBlockSpecs } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";

import type { RehostQueue, RehostStatus } from "../lib/rehost";
import type { AnyBlockSpec } from "./types";

type PropSpec = { default: string | number | boolean } | { default: undefined; type: "string" | "number" | "boolean" };

/** Adds props to a `createBlockSpec` block; its node is built from `config.propSchema` when the schema is created. */
export function extendProps<S extends AnyBlockSpec>(spec: S, props: Record<string, PropSpec>): S {
  const config = spec.config as { propSchema: Record<string, unknown> };
  return { ...spec, config: { ...spec.config, propSchema: { ...config.propSchema, ...props } } } as S;
}

/**
 * BlockNote's quote plus `cite` (the `<blockquote cite>` source URL). Its children — further
 * paragraphs and the attribution paragraph (`meta.source.tag = "cite"`) — are drawn inside the
 * quote by the stylesheet and exported inside `<blockquote>`.
 */
export const quoteSpec = extendProps(defaultBlockSpecs.quote, {
  cite: { default: "" },
});

type ImageProps = { alt?: string; srcset?: string; sizes?: string; originalUrl?: string; url?: string };
type ImageBlock = { id: string; props: ImageProps };
type Rendered = { dom: HTMLElement; destroy?: () => void };
type RenderFn = (this: unknown, block: ImageBlock, ...rest: unknown[]) => Rendered;

/** Applies the props BlockNote's image doesn't know to its `<img>`. */
function decorateImage(rendered: Rendered, props: ImageProps) {
  const img = rendered.dom.tagName === "IMG" ? (rendered.dom as HTMLImageElement) : rendered.dom.querySelector("img");
  if (!img) return rendered;
  if (props.alt) img.alt = props.alt;
  // After re-hosting, `srcset` still points at the original host.
  if (props.srcset && !props.originalUrl) {
    img.srcset = props.srcset;
    if (props.sizes) img.sizes = props.sizes;
  }
  return rendered;
}

const rehostQueues = new WeakMap<object, RehostQueue>();

/** Lets image blocks of this editor show its re-upload progress. */
export function registerRehostQueue(editor: object, queue: RehostQueue) {
  rehostQueues.set(editor, queue);
}

function renderBadge(badge: HTMLElement, status: RehostStatus | undefined, retry: () => void) {
  badge.hidden = !status;
  badge.replaceChildren();
  if (!status) return badge.removeAttribute("data-state");
  badge.dataset.state = status.state;
  if (status.state === "failed") {
    const label = document.createElement("span");
    label.textContent = "Not re-uploaded";
    label.title = status.message;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Retry";
    button.dataset.testid = "rehost-retry";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      retry();
    });
    badge.append(label, document.createTextNode(" · "), button);
    return;
  }
  const spinner = document.createElement("span");
  spinner.className = "genesis-rehost-spinner";
  const progress = status.state === "uploading" && status.progress !== undefined ? ` ${Math.round(status.progress * 100)}%` : "";
  badge.append(spinner, status.state === "queued" ? "Waiting to re-upload" : `Re-uploading${progress}`);
}

/** A badge over the image while it's queued, uploading, or failed to re-upload. Not part of the document or its HTML. */
function withRehostBadge(rendered: Rendered, block: ImageBlock, editor: unknown) {
  const queue = editor && typeof editor === "object" ? rehostQueues.get(editor) : undefined;
  if (!queue || !block.props.url) return rendered;
  const host = rendered.dom.querySelector<HTMLElement>(".bn-visual-media-wrapper") ?? rendered.dom;
  const badge = document.createElement("div");
  badge.className = "genesis-rehost-badge";
  badge.contentEditable = "false";
  badge.dataset.testid = "rehost-badge";
  badge.setAttribute("role", "status");
  host.appendChild(badge);
  let shown: RehostStatus | undefined;
  const update = () => {
    const status = queue.statuses.get(block.id);
    if (status === shown) return;
    shown = status;
    renderBadge(badge, status, () => queue.retry(block.id));
  };
  update();
  if (!shown) badge.hidden = true;
  const unsubscribe = queue.statuses.subscribe(update);
  const destroy = rendered.destroy;
  return {
    ...rendered,
    destroy: () => {
      unsubscribe();
      destroy?.();
    },
  };
}

const baseImage = defaultBlockSpecs.image;
const imageImplementation = baseImage.implementation as unknown as { render: RenderFn; toExternalHTML?: RenderFn };

/**
 * BlockNote's image plus the source attributes it drops (design §2): `alt`, `srcset`/`sizes`,
 * intrinsic `width`/`height`, `captionRich` (the caption's inline content as JSON, used on export
 * while it still matches `caption`), `href` (a link around the image) and `originalUrl` (set after
 * re-hosting). `name` stays the file name and the alt fallback.
 */
export const imageSpec = extendProps(
  {
    ...baseImage,
    implementation: {
      ...baseImage.implementation,
      render(this: unknown, block: ImageBlock, ...rest: unknown[]) {
        return withRehostBadge(decorateImage(imageImplementation.render.call(this, block, ...rest), block.props), block, rest[0]);
      },
      toExternalHTML(this: unknown, block: ImageBlock, ...rest: unknown[]) {
        return decorateImage(imageImplementation.toExternalHTML!.call(this, block, ...rest), block.props);
      },
    },
  } as typeof baseImage,
  {
    alt: { default: "" },
    srcset: { default: "" },
    sizes: { default: "" },
    width: { default: undefined, type: "number" },
    height: { default: undefined, type: "number" },
    captionRich: { default: "" },
    href: { default: "" },
    originalUrl: { default: "" },
  },
);

type PMNode = EditorState["doc"];

function imagesById(doc: PMNode) {
  const images = new Map<string, { node: PMNode; pos: number }>();
  doc.descendants((node, pos) => {
    if (node.type.name !== "blockContainer") return true;
    const content = node.firstChild;
    if (content?.type.name === "image") images.set(String(node.attrs.id), { node: content, pos: pos + 1 });
    return true;
  });
  return images;
}

/** Set on the transaction that swaps in a re-hosted URL, so the source's `srcset` and size are kept. */
export const REHOST_META = "genesis-rehost";

// Attribute changes come from `setNodeMarkup` (a ReplaceAroundStep) or an AttrStep; typing never does.
const changesAttributes = (tr: Transaction) => tr.steps.some((step) => "gapFrom" in step || "attr" in step);

/**
 * A new `url` from the user (upload, file panel) makes the source's `srcset`, `sizes` and intrinsic
 * size stale, so they're cleared. Re-hosting sets `originalUrl` in the same update and keeps them.
 */
export const imageSourceExtension = createExtension({
  key: "genesis-image-source",
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey("genesis-image-source"),
      appendTransaction(transactions, oldState, state) {
        if (!transactions.some((tr) => tr.docChanged && changesAttributes(tr) && !tr.getMeta(REHOST_META))) return null;
        const before = imagesById(oldState.doc);
        const tr = state.tr;
        for (const [id, { node, pos }] of imagesById(state.doc)) {
          const old = before.get(id)?.node;
          if (!old || old.attrs.url === node.attrs.url || old.attrs.originalUrl !== node.attrs.originalUrl) continue;
          if (!node.attrs.srcset && !node.attrs.sizes && node.attrs.width == null && node.attrs.height == null) continue;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, srcset: "", sizes: "", width: undefined, height: undefined });
        }
        return tr.docChanged ? tr : null;
      },
    }),
  ],
});
