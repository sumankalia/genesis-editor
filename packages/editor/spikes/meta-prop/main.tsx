/**
 * Spike (design §18 phase 1): does a per-block `meta` prop survive copy/paste, drag and Yjs sync?
 * Run with `node spikes/meta-prop/run.mjs`; it drives this page with Playwright.
 */
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/shadcn";
import { createRoot } from "react-dom/client";
import * as Y from "yjs";
import "../../dist/style.css";

type AnySpec = (typeof defaultBlockSpecs)[keyof typeof defaultBlockSpecs];

type Node = { extend(config: object): Node };
const META_PROP = { default: "" };

/**
 * Adds a string `meta` prop to a block spec. `createBlockSpec` blocks build their node from
 * `config.propSchema` inside `BlockNoteSchema.create`, so the config is enough for them; blocks that
 * ship a ready-made node (table) also need the attribute added to that node.
 */
function withMeta<S extends AnySpec>(spec: S): S {
  const impl = spec.implementation as { node?: Node };
  const node = impl.node?.extend({
    addAttributes(this: { parent?: () => object }) {
      return {
        ...this.parent?.(),
        meta: {
          default: "",
          keepOnSplit: true,
          // The table node parses from `<table>`, but the block's data attributes sit on its wrapper.
          parseHTML: (element: HTMLElement) => element.getAttribute("data-meta") ?? element.closest("[data-meta]")?.getAttribute("data-meta") ?? "",
          renderHTML: (attributes: Record<string, unknown>) => (attributes.meta ? { "data-meta": String(attributes.meta) } : {}),
        },
      };
    },
  });
  return {
    ...spec,
    config: { ...spec.config, propSchema: { ...spec.config.propSchema, meta: META_PROP } },
    implementation: node ? { ...spec.implementation, node } : spec.implementation,
  } as S;
}

const blockSpecs = Object.fromEntries(Object.entries(defaultBlockSpecs).map(([k, s]) => [k, withMeta(s as AnySpec)])) as unknown as typeof defaultBlockSpecs;
const schema = BlockNoteSchema.create({ blockSpecs });

const initial = [
  { id: "p1", type: "paragraph", props: { meta: "m-p1" }, content: "First paragraph" },
  { id: "h1", type: "heading", props: { level: 2, meta: "m-h1" }, content: "A heading" },
  { id: "l1", type: "bulletListItem", props: { meta: "m-l1" }, content: "List item", children: [{ id: "l2", type: "bulletListItem", props: { meta: "m-l2" }, content: "Child item" }] },
  { id: "t1", type: "table", props: { meta: "m-t1" }, content: { type: "tableContent", rows: [{ cells: ["a", "b"] }] } },
  { id: "i1", type: "image", props: { meta: "m-i1", url: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACw=" } },
  { id: "p2", type: "paragraph", props: { meta: "m-p2" }, content: "Last paragraph" },
];

const docC = new Y.Doc();
const docD = new Y.Doc();
docC.on("update", (u: Uint8Array, origin: unknown) => origin !== "relay" && Y.applyUpdate(docD, u, "relay"));
docD.on("update", (u: Uint8Array, origin: unknown) => origin !== "relay" && Y.applyUpdate(docC, u, "relay"));

const make = (opts: object) => BlockNoteEditor.create({ schema, ...opts } as never) as unknown as BlockNoteEditor;
const A = make({ initialContent: initial });
const B = make({ initialContent: [{ id: "b0", type: "paragraph", content: "Editor B" }] });
const collab = (doc: Y.Doc, name: string) => make(withCollaboration({ collaboration: { fragment: doc.getXmlFragment("doc"), user: { name, color: "#888" } } }));
const C = collab(docC, "C");
const D = collab(docD, "D");

function App() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: 24 }}>
      {(["A", "B", "C", "D"] as const).map((name) => (
        <section key={name} data-editor={name} style={{ border: "1px solid #ddd", padding: "8px 8px 8px 56px", minHeight: 200 }}>
          <strong>{name}</strong>
          <BlockNoteView editor={{ A, B, C, D }[name] as never} />
        </section>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

const metaOf = (editor: BlockNoteEditor) => {
  const out: Record<string, string> = {};
  const walk = (blocks: { id: string; props: Record<string, unknown>; children: never[] }[]) => {
    for (const b of blocks) {
      out[b.id] = String(b.props.meta ?? "");
      walk(b.children);
    }
  };
  walk(editor.document as never);
  return out;
};

Object.assign(window, { spike: { A, B, C, D, Y, docC, docD, schema, make, withCollaboration, metaOf, initial } });
