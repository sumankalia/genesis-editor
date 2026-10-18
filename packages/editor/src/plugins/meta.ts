import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";

import { encodeMeta, metaWithoutId, migrateMeta } from "../parser/meta";
import type { AnyBlockSpec } from "./types";

type PMNode = EditorState["doc"];
type TiptapNode = { extend(config: object): TiptapNode };

/**
 * Adds the string `meta` prop to a block spec. `createBlockSpec` blocks build their node from
 * `config.propSchema` when the schema is created; blocks that ship a ready-made node (the table, and
 * plugin blocks built the same way) also get the attribute on that node.
 */
export function withMeta<S extends AnyBlockSpec>(spec: S): S {
  const config = spec.config as { propSchema: Record<string, unknown> };
  if ("meta" in config.propSchema) return spec;
  const implementation = spec.implementation as { node?: TiptapNode };
  const node = implementation.node?.extend({
    addAttributes(this: { parent?: () => object }) {
      return {
        ...this.parent?.(),
        meta: {
          default: "",
          // The table node parses from `<table>`, but the block's data attributes sit on its wrapper.
          parseHTML: (element: HTMLElement) =>
            element.getAttribute("data-meta") ?? element.closest("[data-meta]")?.getAttribute("data-meta") ?? "",
          renderHTML: (attributes: Record<string, unknown>) => (attributes.meta ? { "data-meta": String(attributes.meta) } : {}),
        },
      };
    },
  });
  return {
    ...spec,
    config: { ...spec.config, propSchema: { ...config.propSchema, meta: { default: "" } } },
    implementation: node ? { ...spec.implementation, node } : spec.implementation,
  } as S;
}

type ReplaceLike = { from: number; to: number; slice?: { openStart: number; openEnd: number; content: { childCount: number; descendants(fn: (node: PMNode) => boolean | void): void } } };

const hasMetaId = (node: PMNode) => typeof node.attrs.meta === "string" && node.attrs.meta.includes('"id"');

/** Positions of the two content nodes of every block split, mapped to the final document. */
function splits(transactions: readonly Transaction[]) {
  const found: { first: number; second: number }[] = [];
  transactions.forEach((tr, t) => {
    tr.steps.forEach((raw, i) => {
      const step = raw as unknown as ReplaceLike;
      const slice = step.slice;
      if (!slice || step.from !== step.to || slice.openStart < 2 || slice.openEnd < 2 || slice.content.childCount !== 2) return;
      const doc = tr.docs[i + 1] ?? tr.doc;
      const $at = doc.resolve(step.from);
      if ($at.depth < 1) return;
      let first = $at.before();
      let second = step.from + 3;
      const later = tr.mapping.slice(i + 1);
      first = later.map(first, -1);
      second = later.map(second, 1);
      for (const next of transactions.slice(t + 1)) {
        first = next.mapping.map(first, -1);
        second = next.mapping.map(second, 1);
      }
      found.push({ first, second });
    });
  });
  return found;
}

function insertsMetaId(transactions: readonly Transaction[]) {
  return transactions.some((tr) =>
    tr.steps.some((raw) => {
      let hit = false;
      (raw as unknown as ReplaceLike).slice?.content.descendants((node) => {
        if (hit) return false;
        if (hasMetaId(node)) hit = true;
        return !hit;
      });
      return hit;
    }),
  );
}

/**
 * Edit semantics for `meta` (§16): the second half of a split gets the first half's meta without
 * `attrs.id`, and an inserted `attrs.id` that collides with an earlier one in the document is removed.
 * Merges keep the first block's meta, which is what ProseMirror does already.
 */
function appendMetaTransaction(transactions: readonly Transaction[], state: EditorState) {
  if (!transactions.some((tr) => tr.docChanged)) return null;
  const tr = state.tr;
  for (const { first, second } of splits(transactions)) {
    const head = state.doc.nodeAt(first);
    const tail = state.doc.nodeAt(second);
    if (!head || !tail || typeof head.attrs.meta !== "string" || !head.attrs.meta || !("meta" in tail.attrs)) continue;
    if (tail.attrs.meta && tail.attrs.meta !== head.attrs.meta) continue;
    const meta = encodeMeta(metaWithoutId(migrateMeta(head.attrs.meta)));
    if (tail.attrs.meta !== meta) tr.setNodeMarkup(second, undefined, { ...tail.attrs, meta });
  }
  if (insertsMetaId(transactions)) {
    const seen = new Set<string>();
    tr.doc.descendants((node, pos) => {
      if (!hasMetaId(node)) return;
      const meta = migrateMeta(node.attrs.meta);
      const id = meta?.attrs?.id;
      if (!id) return;
      if (!seen.has(id)) seen.add(id);
      else tr.setNodeMarkup(pos, undefined, { ...node.attrs, meta: encodeMeta(metaWithoutId(meta)) });
    });
  }
  return tr.docChanged ? tr : null;
}

export const metaExtension = createExtension({
  key: "genesis-meta",
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey("genesis-meta"),
      appendTransaction: (transactions, _old, state) => appendMetaTransaction(transactions, state),
    }),
  ],
});
