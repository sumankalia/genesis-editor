import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseHTML, toHTML, type HtmlBlock, type HtmlInline, type HtmlStyles } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";

const styles: fc.Arbitrary<HtmlStyles> = fc
  .record(
    {
      bold: fc.constant(true as const),
      italic: fc.constant(true as const),
      underline: fc.constant(true as const),
      strike: fc.constant(true as const),
      code: fc.constant(true as const),
      textColor: fc.constantFrom("red", "blue", "#123456"),
      backgroundColor: fc.constantFrom("yellow", "green", "#345678"),
    },
    { requiredKeys: [] },
  );

const text = fc.stringMatching(/^[a-zA-Z0-9 <>&"'\n\t.,é—]{1,12}$/);

/** Merges equal-styled neighbours, as the parser does, so generated content is canonical. */
function canonical(nodes: HtmlInline[]): HtmlInline[] {
  const out: HtmlInline[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === "text" && last?.type === "text" && JSON.stringify(last.styles) === JSON.stringify(node.styles)) last.text += node.text;
    else if (node.type === "link" && last?.type === "link" && last.href === node.href) last.content.push(...node.content);
    else out.push(node);
  }
  for (const node of out) if (node.type === "link") node.content = canonical(node.content) as typeof node.content;
  return out;
}

const textNode = fc.record({ type: fc.constant("text" as const), text, styles });
const inline = fc
  .array(
    fc.oneof(
      { weight: 4, arbitrary: textNode },
      { weight: 1, arbitrary: fc.record({ type: fc.constant("link" as const), href: fc.constantFrom("https://a.example/", "https://b.example/x?y=1"), content: fc.array(textNode, { minLength: 1, maxLength: 2 }) }) },
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((nodes) => canonical(structuredClone(nodes)))
  // Whitespace-only content is canonically empty (`<p>&nbsp;</p>` is a spacer).
  .filter((nodes) => nodes.some((n) => (n.type === "link" ? n.content.some((t) => t.text.trim()) : n.type === "text" && n.text.trim())));

const props = fc.record({ textAlignment: fc.constantFrom("center", "right"), textColor: fc.constantFrom("red", "gray"), backgroundColor: fc.constantFrom("blue", "pink") }, { requiredKeys: [] });

const leaf: fc.Arbitrary<HtmlBlock> = fc.oneof(
  fc.record({ type: fc.constant("paragraph"), props, content: inline }),
  fc.record({
    type: fc.constant("heading"),
    props: props.chain((p) => fc.integer({ min: 1, max: 6 }).map((level) => ({ ...p, level }))),
    // §6 drops whole-heading bold, so an all-bold heading is not canonical.
    content: inline.filter((nodes) => !nodes.flatMap((n) => (n.type === "link" ? n.content : n.type === "text" ? [n] : [])).every((t) => t.styles.bold || !t.text.trim())),
  }),
  fc.record({ type: fc.constant("bulletListItem"), props, content: inline }),
  fc.record({ type: fc.constant("checkListItem"), props: props.chain((p) => fc.boolean().map((checked) => (checked ? { ...p, checked } : p))), content: inline }),
  fc.record({ type: fc.constant("quote"), props: fc.record({ textColor: fc.constantFrom("red") }, { requiredKeys: [] }), content: inline }),
);

const block: fc.Arbitrary<HtmlBlock> = fc.oneof(
  { weight: 3, arbitrary: leaf },
  { weight: 1, arbitrary: fc.tuple(leaf, fc.array(leaf, { minLength: 1, maxLength: 2 })).map(([b, children]) => ({ ...b, children })) },
);

const clean = (b: HtmlBlock): HtmlBlock => {
  const out: HtmlBlock = { ...b };
  if (out.props && !Object.keys(out.props).length) delete out.props;
  if (out.children) out.children = out.children.map(clean);
  return out;
};

describe("property: parse(toHTML(blocks)) == blocks", () => {
  it("holds for generated documents", () => {
    fc.assert(
      fc.property(fc.array(block, { minLength: 1, maxLength: 6 }), (generated) => {
        const blocks = generated.map(clean);
        const html = toHTML(blocks);
        expect(parseHTML(html, { dom: linkedomDom }).blocks).toEqual(blocks);
      }),
      { numRuns: 300 },
    );
  });
});
