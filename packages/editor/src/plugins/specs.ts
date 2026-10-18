import { createExtension, defaultBlockSpecs } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";

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

type ImageProps = { alt?: string; srcset?: string; sizes?: string; originalUrl?: string };
type Rendered = { dom: HTMLElement };
type RenderFn = (this: unknown, block: { props: ImageProps }, ...rest: unknown[]) => Rendered;

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
      render(this: unknown, block: { props: ImageProps }, ...rest: unknown[]) {
        return decorateImage(imageImplementation.render.call(this, block, ...rest), block.props);
      },
      toExternalHTML(this: unknown, block: { props: ImageProps }, ...rest: unknown[]) {
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
        if (!transactions.some((tr) => tr.docChanged && changesAttributes(tr))) return null;
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
