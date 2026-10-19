import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { parseHTML, toHTML } from "../src/parser";
import { linkedomDom } from "../src/parser/linkedom";
import { resolveEditorSetup } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";

const parse = (html: string, options = {}) => parseHTML(html, { dom: linkedomDom, ...options }).blocks;
const props = (html: string, options = {}) => parse(html, options)[0]?.props;

describe("image parsing", () => {
  it("keeps alt separate from the file name, and intrinsic size", () => {
    expect(props('<img src="https://x.com/a.png" alt="A cat" width="800" height="600">')).toEqual({
      url: "https://x.com/a.png", name: "A cat", alt: "A cat", width: 800, height: 600, previewWidth: 800,
    });
    expect(props('<img src="https://x.com/a.png" title="T" width="50%">')).toEqual({ url: "https://x.com/a.png", name: "T" });
  });

  it("keeps srcset and sizes, resolving relative candidates and dropping unusable ones", () => {
    const p = props('<img src="/a-1.png" srcset="/a-1.png 1x, /a-2.png 2x, /a-3.png huge" sizes="100vw">', { baseUrl: "https://x.com/" });
    expect(p).toMatchObject({ url: "https://x.com/a-2.png", srcset: "https://x.com/a-1.png 1x, https://x.com/a-2.png 2x", sizes: "100vw" });
    expect(props('<img src="https://x.com/a.png" srcset="https://x.com/a.png 1x" sizes="1px">')).not.toHaveProperty("srcset");
    // The sanitizer removes a srcset with any unsafe candidate.
    expect(props('<img src="https://x.com/a.png" srcset="https://x.com/a.png 1x, javascript:x 2x">')).not.toHaveProperty("srcset");
  });

  it("prefers a lazy-load srcset", () => {
    expect(props('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-srcset="https://x.com/s.png 300w, https://x.com/l.png 900w">')).toMatchObject({
      url: "https://x.com/l.png", srcset: "https://x.com/s.png 300w, https://x.com/l.png 900w",
    });
  });

  it("keeps a link around the image as href", () => {
    expect(props('<a href="https://x.com/page?utm_source=y"><img src="https://x.com/a.png"></a>')).toEqual({ url: "https://x.com/a.png", href: "https://x.com/page" });
    expect(props('<a href="https://x.com/"><img src="https://x.com/a.png"></a>', { tools: ["image"] })).toEqual({ url: "https://x.com/a.png" });
  });

  it("keeps a formatted caption as captionRich, and plain captions as text only", () => {
    const rich = props('<figure><img src="https://x.com/a.png"><figcaption>Photo by <a href="https://ada.example/"><b>Ada</b></a></figcaption></figure>');
    expect(rich?.caption).toBe("Photo by Ada");
    expect(JSON.parse(String(rich?.captionRich))).toEqual([
      { type: "text", text: "Photo by ", styles: {} },
      { type: "link", href: "https://ada.example/", content: [{ type: "text", text: "Ada", styles: { bold: true } }] },
    ]);
    expect(props('<figure><img src="https://x.com/a.png"><figcaption>Plain</figcaption></figure>')).not.toHaveProperty("captionRich");
  });
});

describe("image serialization", () => {
  const html = '<figure><a href="https://x.com/"><img src="https://x.com/a2.png" alt="A" srcset="https://x.com/a.png 1x, https://x.com/a2.png 2x" width="800" height="600" style="width:400px"></a><figcaption>By <strong>Ada</strong></figcaption></figure>';

  it("writes every image prop and round-trips", () => {
    const blocks = parse(html);
    expect(blocks[0].props).toMatchObject({ previewWidth: 400, width: 800, height: 600, href: "https://x.com/" });
    expect(toHTML(blocks)).toBe(html);
    expect(parse(toHTML(blocks))).toEqual(blocks);
  });

  it("falls back to the plain caption once it no longer matches captionRich", () => {
    const [block] = parse(html);
    const edited = toHTML([{ ...block, props: { ...block.props, caption: "Edited" } }]);
    expect(edited).toContain("<figcaption>Edited</figcaption>");
  });

  it("writes the display width as a style, so it isn't read back as the intrinsic width", () => {
    const out = toHTML([{ type: "image", props: { url: "https://x.com/a.png", previewWidth: 320 } }]);
    expect(out).toBe('<img src="https://x.com/a.png" alt="" style="width:320px">');
    expect(parse(out)[0].props).toEqual({ url: "https://x.com/a.png", previewWidth: 320 });
  });

  it("leaves out srcset after re-hosting", () => {
    const out = toHTML([{ type: "image", props: { url: "https://cdn.me/a.png", originalUrl: "https://x.com/a.png", srcset: "https://x.com/a.png 1x, https://x.com/a2.png 2x" } }]);
    expect(out).not.toContain("srcset");
  });
});

describe("image block", () => {
  it("renders alt and srcset in the editor", () => {
    const setup = resolveEditorSetup(undefined);
    const blocks = parse('<img src="https://x.com/a.png" alt="A cat" srcset="https://x.com/a.png 1x, https://x.com/a2.png 2x" sizes="50vw">');
    const editor = BlockNoteEditor.create({ schema: setup.schema, initialContent: toEditorBlocks(blocks, schemaSupport(setup.schema)) as never });
    const root = document.createElement("div");
    editor.mount(root);
    const img = root.querySelector("img.bn-visual-media") as HTMLImageElement;
    expect(img.alt).toBe("A cat");
    expect(img.getAttribute("srcset")).toBe("https://x.com/a.png 1x, https://x.com/a2.png 2x");
    expect(img.getAttribute("sizes")).toBe("50vw");
    expect(editor.document[0].props).toMatchObject({ alt: "A cat", name: "A cat" });
  });

  it("clears srcset and intrinsic size when the user replaces the image, but not on re-hosting", () => {
    const setup = resolveEditorSetup(undefined);
    const blocks = parse('<img src="https://x.com/a.png" srcset="https://x.com/a.png 1x, https://x.com/a2.png 2x" width="800" height="600">');
    const editor = BlockNoteEditor.create({ schema: setup.schema, extensions: setup.extensions, initialContent: toEditorBlocks([...blocks, ...blocks], schemaSupport(setup.schema)) as never });
    editor.mount(document.createElement("div"));
    const [first, second] = editor.document;
    editor.updateBlock(first, { props: { url: "https://me.example/upload.png" } as never });
    editor.updateBlock(second, { props: { url: "https://cdn.me/a.png", originalUrl: "https://x.com/a2.png" } as never });
    const [replaced, rehosted] = editor.document as unknown as { props: Record<string, unknown> }[];
    expect(replaced.props).toMatchObject({ url: "https://me.example/upload.png", srcset: "", sizes: "" });
    expect(replaced.props.width).toBeUndefined();
    expect(rehosted.props).toMatchObject({ srcset: "https://x.com/a.png 1x, https://x.com/a2.png 2x", width: 800, height: 600 });
  });

  it("stores alt separately from the file name, and alignment on the block", () => {
    const setup = resolveEditorSetup(undefined);
    const editor = BlockNoteEditor.create({
      schema: setup.schema,
      initialContent: toEditorBlocks(parse('<img src="https://x.com/a.png" alt="A cat">'), schemaSupport(setup.schema)) as never,
    });
    const root = document.createElement("div");
    editor.mount(root);
    editor.updateBlock(editor.document[0], { props: { alt: "A tabby cat", textAlignment: "center" } as never });
    const block = root.querySelector("[data-content-type='image']")!;
    expect(editor.document[0].props).toMatchObject({ alt: "A tabby cat", name: "A cat", textAlignment: "center" });
    expect(root.querySelector("img.bn-visual-media")?.getAttribute("alt")).toBe("A tabby cat");
    expect(block.getAttribute("data-text-alignment")).toBe("center");
  });
});
