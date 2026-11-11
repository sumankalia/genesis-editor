import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "prosemirror-state";

type PMNode = EditorState["doc"];

/**
 * Keeps every `columnList` well-formed, whatever edit produced the broken shape (Backspace, Shift+Tab,
 * drag and drop, cut/paste, deleting a column's last block):
 *
 *  - a `columnList` holds only `column` blocks, and every column holds at least one block;
 *  - blocks that end up directly inside a `columnList` are lifted out, after it;
 *  - empty columns are removed;
 *  - a list left with fewer than two columns is dissolved into ordinary full-width blocks.
 *
 * Runs as `appendTransaction`, so the repair joins the same undo step as the edit that caused it.
 */

/** The block's content node: "columnList", "column", "paragraph", ... */
const contentTypeOf = (container: PMNode) => container.firstChild?.type.name;

const isColumn = (container: PMNode) => contentTypeOf(container) === "column";

/** The child blocks of a block (the `blockContainer`s in its `blockGroup`). */
function childrenOf(container: PMNode): PMNode[] {
  const group = container.childCount > 1 ? container.child(1) : null;
  const out: PMNode[] = [];
  if (group?.type.name === "blockGroup") {
    group.forEach((child) => out.push(child));
  }
  return out;
}

const hasBlocks = (column: PMNode) => childrenOf(column).length > 0;

/** The blocks that should replace a `columnList` block, or `null` when it is already well-formed. */
export function repairedColumnList(list: PMNode): PMNode[] | null {
  const kids = childrenOf(list);
  if (
    kids.length >= 2 &&
    kids.every((kid) => isColumn(kid) && hasBlocks(kid))
  ) {
    return null;
  }

  const columns = kids.filter((kid) => isColumn(kid) && hasBlocks(kid));
  if (columns.length >= 2) {
    // Keep the section; drop empty columns and lift stray blocks out, after it.
    const group = list.child(1);
    const kept = list.type.create(list.attrs, [
      list.child(0),
      group.type.create(group.attrs, columns),
    ]);
    return [kept, ...kids.filter((kid) => !isColumn(kid))];
  }

  // One column or none is not a layout: dissolve the section, keeping document order.
  const out: PMNode[] = [];
  for (const kid of kids) {
    if (isColumn(kid)) out.push(...childrenOf(kid));
    else out.push(kid);
  }
  return out;
}

/**
 * Repairs the first malformed `columnList` in the transaction's document. Returns whether it changed
 * anything, so callers loop until it returns `false`.
 */
export function repairColumns(tr: Transaction): boolean {
  const found: { pos: number; node: PMNode; replacement: PMNode[] }[] = [];
  tr.doc.descendants((node, pos) => {
    if (found.length) return false;
    if (
      node.type.name !== "blockContainer" ||
      contentTypeOf(node) !== "columnList"
    ) {
      return true;
    }
    const replacement = repairedColumnList(node);
    if (replacement) found.push({ pos, node, replacement });
    return true;
  });
  const hit = found[0];
  if (!hit) return false;

  let { replacement } = hit;
  // A block group needs at least one child: never leave an emptied parent behind.
  if (!replacement.length && tr.doc.resolve(hit.pos).parent.childCount === 1) {
    const { blockContainer, paragraph } = tr.doc.type.schema.nodes;
    replacement = [blockContainer.create(null, paragraph.create())];
  }
  tr.replaceWith(hit.pos, hit.pos + hit.node.nodeSize, replacement);
  return true;
}

export function columnsNormalizePlugin() {
  return new Plugin({
    key: new PluginKey("genesis-columns-normalize"),
    appendTransaction(transactions, _oldState, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const tr = state.tr;
      let changed = false;
      // One repair per pass; the cap only guards against a repair that never converges.
      for (let pass = 0; pass < 500 && repairColumns(tr); pass++)
        changed = true;
      return changed ? tr : null;
    },
  });
}
