import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPasteHandler, exportHTML } from "../src/html";
import { fetchLinkPreview, LinkPreviewController, registerLinkPreviews, type LinkPreviewConfig } from "../src/lib/link-preview";
import { embedRegistry } from "../src/parser/embeds";
import { linkPreviewProps } from "../src/parser/link-preview";
import { parseHTML } from "../src/parser/parse";
import { toHTML } from "../src/parser/serialize";
import type { HtmlBlock } from "../src/parser/types";
import { registerEmbedRegistry } from "../src/plugins/embed";
import { resolveEditorSetup, type ToolSelection } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";

const PAGE = "https://blog.example.com/post";
const CARD = {
  url: PAGE,
  title: "A post",
  description: "What it's about",
  image: "https://blog.example.com/og.png",
  siteName: "Example Blog",
  favicon: "https://blog.example.com/favicon.ico",
};

function mounted(options: { tools?: ToolSelection; content?: PartialBlock[]; linkPreview?: LinkPreviewConfig; editable?: boolean } = {}) {
  const setup = resolveEditorSetup(options.tools, []);
  const support = schemaSupport(setup.schema);
  const editor = BlockNoteEditor.create({ schema: setup.schema, extensions: setup.extensions, initialContent: options.content as never }) as unknown as BlockNoteEditor;
  registerEmbedRegistry(editor, embedRegistry({}, [], { origin: "http://localhost:3000" }));
  registerLinkPreviews(editor, new LinkPreviewController(() => options.linkPreview));
  editor.isEditable = options.editable ?? true;
  const root = document.createElement("div");
  document.body.append(root);
  editor.mount(root);
  const sanitize = (blocks: PartialBlock[]) => toEditorBlocks(blocks, support) as PartialBlock[];
  return { editor, root, sanitize };
}

function paste(editor: BlockNoteEditor, sanitize: (b: PartialBlock[]) => PartialBlock[], data: Record<string, string>) {
  const handler = createPasteHandler(() => ({}), sanitize, () => {});
  const event = { clipboardData: { types: Object.keys(data), getData: (type: string) => data[type] ?? "" } } as unknown as ClipboardEvent;
  let fallback = false;
  const handled = handler({ event, editor: editor as never, defaultPasteHandler: () => ((fallback = true), true) });
  return { handled, fallback };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe("link preview metadata", () => {
  it("keeps http(s) only, resolves relative images against the page, and caps text", () => {
    const card = linkPreviewProps(PAGE, {
      title: `  Line\u0000one\n\ttwo  ${"x".repeat(400)}`,
      image: "/og.png",
      favicon: "javascript:alert(1)",
      siteName: 42,
    })!;
    expect(card.title.startsWith("Line one two x")).toBe(true);
    expect(card.title.length).toBe(300);
    expect(card.title.endsWith("…")).toBe(true);
    expect(card.image).toBe("https://blog.example.com/og.png");
    expect(card.favicon).toBe("");
    expect(card.siteName).toBe("");
    expect(linkPreviewProps("javascript:alert(1)")).toBeNull();
    expect(linkPreviewProps("/relative")).toBeNull();
    expect(linkPreviewProps(PAGE, { image: "data:image/png;base64,AAAA" })!.image).toBe("");
  });
});

describe("link preview HTML", () => {
  it("exports a semantic <a> card and reads it back losslessly", () => {
    const html = toHTML([{ type: "linkPreview", props: CARD }]);
    expect(html).toMatch(/^<a href="https:\/\/blog\.example\.com\/post" data-genesis-link-preview data-title="A post"/);
    expect(html).toContain('<img src="https://blog.example.com/og.png" alt="">');
    expect(html).toContain("<strong>A post</strong>");
    expect(html).toContain("<small>Example Blog · blog.example.com</small>");
    const { blocks } = parseHTML(html);
    expect(blocks).toEqual([{ type: "linkPreview", props: CARD }]);
    expect(toHTML(blocks)).toBe(html);
  });

  it("cleans hostile data attributes on import", () => {
    const html = `<a href="${PAGE}" data-genesis-link-preview data-title="<b>T</b>" data-image="javascript:alert(1)" data-favicon="//cdn.example.com/f.ico" onclick="x()"><strong>T</strong></a>`;
    const [block] = parseHTML(html).blocks;
    expect(block).toEqual({
      type: "linkPreview",
      props: { url: PAGE, title: "<b>T</b>", description: "", image: "", siteName: "", favicon: "https://cdn.example.com/f.ico" },
    });
    expect(toHTML([block])).toContain('data-title="&lt;b&gt;T&lt;/b&gt;"');
    expect(parseHTML(`<a href="javascript:alert(1)" data-genesis-link-preview data-title="x">x</a>`).blocks[0]?.type).not.toBe("linkPreview");
  });

  it("with the tool off, a card is a link paragraph; a plain <a> is never a card", () => {
    const html = toHTML([{ type: "linkPreview", props: CARD }]);
    expect(parseHTML(html, { tools: ["link"] }).blocks).toEqual([
      { type: "paragraph", content: [{ type: "link", href: PAGE, content: [{ type: "text", text: "A post", styles: {} }] }] },
    ]);
    expect(parseHTML(`<p><a href="${PAGE}">${PAGE}</a></p>`).blocks[0].type).toBe("paragraph");
  });

  it("the editor's document exports the card", () => {
    const { editor } = mounted({ content: [{ type: "linkPreview", props: CARD } as unknown as PartialBlock] });
    expect(exportHTML(editor)).toContain("data-genesis-link-preview");
  });
});

describe("image links", () => {
  it("exports target=_blank with rel, and reads it back", () => {
    const image: HtmlBlock = { type: "image", props: { url: "https://cdn.example.com/a.png", href: "https://example.com/", openInNewTab: true } };
    const html = toHTML([image]);
    expect(html).toBe('<a href="https://example.com/" target="_blank" rel="noopener noreferrer"><img src="https://cdn.example.com/a.png" alt=""></a>');
    expect(parseHTML(html).blocks[0].props).toMatchObject({ href: "https://example.com/", openInNewTab: true });
    expect(parseHTML('<a href="https://example.com/"><img src="https://cdn.example.com/a.png"></a>').blocks[0].props).not.toHaveProperty("openInNewTab");
  });

  it("never writes or reads a javascript: link", () => {
    expect(toHTML([{ type: "image", props: { url: "https://cdn.example.com/a.png", href: "javascript:alert(1)" } }])).toBe('<img src="https://cdn.example.com/a.png" alt="">');
    expect(parseHTML('<a href="javascript:alert(1)" target="_blank"><img src="https://cdn.example.com/a.png"></a>').blocks[0].props).not.toHaveProperty("href");
  });

  it("a linked image shows a badge in the editor", () => {
    const { root } = mounted({ content: [{ type: "image", props: { url: "https://cdn.example.com/a.png", href: "https://example.com/x" } } as unknown as PartialBlock] });
    const badge = root.querySelector<HTMLAnchorElement>("[data-testid=image-link-badge]");
    expect(badge?.href).toBe("https://example.com/x");
    expect(badge?.textContent).toBe("Link · example.com");
  });
});

describe("link preview block", () => {
  it("draws stored metadata without fetching", () => {
    const resolve = vi.fn();
    const { root } = mounted({ content: [{ type: "linkPreview", props: CARD } as unknown as PartialBlock], linkPreview: { resolve } });
    expect(resolve).not.toHaveBeenCalled();
    expect(root.querySelector(".genesis-link-preview")?.getAttribute("data-state")).toBe("ready");
    expect(root.querySelector(".genesis-link-preview-title")?.textContent).toBe("A post");
    expect(root.querySelector(".genesis-link-preview-domain")?.textContent).toBe("Example Blog · blog.example.com");
    expect(root.querySelector<HTMLAnchorElement>(".genesis-embed-open")?.href).toBe(PAGE);
  });

  it("fetches a card that has no metadata, then stores it outside the undo history", async () => {
    const resolve = vi.fn(async () => ({ title: "Fetched", image: "/i.png" }));
    const { editor, root } = mounted({ content: [{ type: "linkPreview", props: { url: PAGE } } as unknown as PartialBlock], linkPreview: { resolve } });
    expect(root.querySelector(".genesis-link-preview")?.getAttribute("data-state")).toBe("loading");
    await settle();
    expect(resolve).toHaveBeenCalledWith(PAGE, expect.objectContaining({ signal: expect.anything() }));
    expect(editor.document[0].props).toMatchObject({ url: PAGE, title: "Fetched", image: "https://blog.example.com/i.png" });
    expect(root.querySelector(".genesis-link-preview")?.getAttribute("data-state")).toBe("ready");
  });

  it("falls back to a link when the lookup fails or finds nothing", async () => {
    for (const resolve of [async () => null, async () => Promise.reject(new Error("down"))]) {
      const { editor } = mounted({ content: [{ type: "linkPreview", props: { url: PAGE } } as unknown as PartialBlock], linkPreview: { resolve } });
      await settle();
      await settle();
      expect(editor.document[0]).toMatchObject({ type: "paragraph", content: [{ type: "link", href: PAGE }] });
    }
  });

  it("without a source, or read-only, an empty card shows the URL and asks nothing", () => {
    for (const options of [{}, { editable: false, linkPreview: { resolve: vi.fn() } }]) {
      const { root } = mounted({ content: [{ type: "linkPreview", props: { url: PAGE } } as unknown as PartialBlock], ...options });
      expect(root.querySelector(".genesis-link-preview")?.getAttribute("data-state")).toBe("plain");
      expect(root.querySelector(".genesis-link-preview-title")?.textContent).toBe(PAGE);
    }
  });

  it("Convert to link swaps the card for a link paragraph", () => {
    const { editor, root } = mounted({ content: [{ type: "linkPreview", props: CARD } as unknown as PartialBlock] });
    root.querySelector<HTMLButtonElement>(".genesis-embed-to-link")!.click();
    expect(editor.document[0]).toMatchObject({ type: "paragraph", content: [{ type: "link", href: PAGE }] });
  });

  it("an empty card's form takes a link; a provider link becomes an embed", () => {
    const { editor, root } = mounted({ content: [{ type: "linkPreview" } as unknown as PartialBlock, { type: "linkPreview" } as unknown as PartialBlock] });
    const [first, second] = Array.from(root.querySelectorAll<HTMLFormElement>(".genesis-link-preview-form"));
    first.querySelector("input")!.value = "blog.example.com/post";
    first.requestSubmit();
    second.querySelector("input")!.value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    second.requestSubmit();
    expect(editor.document[0]).toMatchObject({ type: "linkPreview", props: { url: PAGE } });
    expect(editor.document[1]).toMatchObject({ type: "embed", props: { provider: "youtube" } });
  });
});

describe("pasting URLs", () => {
  it("with previews on, a bare URL paragraph becomes a card in its own undo step; inline links and providers don't", async () => {
    const resolve = vi.fn(async () => ({ title: "Fetched" }));
    const { editor, sanitize } = mounted({ linkPreview: { resolve } });
    paste(editor, sanitize, { "text/plain": PAGE });
    expect(editor.document[0]).toMatchObject({ type: "linkPreview", props: { url: PAGE } });
    await settle();
    expect(editor.document[0].props).toMatchObject({ title: "Fetched" });
    editor.undo();
    expect(editor.document[0]).toMatchObject({ type: "paragraph", content: [{ type: "link", href: PAGE }] });

    const html = mounted({ linkPreview: { resolve } });
    paste(html.editor, html.sanitize, { "text/html": `<p><a href="${PAGE}">${PAGE}</a></p><p>See <a href="${PAGE}">this</a>.</p><p>https://www.youtube.com/watch?v=dQw4w9WgXcQ</p>` });
    expect(html.editor.document.map((b) => b.type)).toEqual(["linkPreview", "paragraph", "embed"]);
  });

  it("without a source, or with the tool off, URLs stay what they are today", () => {
    const off = mounted();
    expect(paste(off.editor, off.sanitize, { "text/plain": PAGE }).fallback).toBe(true);
    const html = mounted({ tools: ["link"], linkPreview: { resolve: async () => ({ title: "x" }) } });
    paste(html.editor, html.sanitize, { "text/html": `<p><a href="${PAGE}">${PAGE}</a></p>` });
    expect(html.editor.document[0].type).toBe("paragraph");
  });
});

describe("fetchLinkPreview", () => {
  it("GETs endpoint?url= with headers, or POSTs JSON", async () => {
    const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ title: "T" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await fetchLinkPreview({ endpoint: "/api/preview", headers: { Authorization: "x" } }, PAGE);
    expect(fetch.mock.calls[0][0]).toBe(`/api/preview?url=${encodeURIComponent(PAGE)}`);
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "x" });
    await fetchLinkPreview({ endpoint: "/api/preview?k=1", method: "POST", headers: async () => ({ A: "b" }) }, PAGE);
    expect(fetch.mock.calls[1][0]).toBe("/api/preview?k=1");
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ url: PAGE }), headers: { A: "b" } });
  });

  it("rejects on an error status or an empty answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await expect(fetchLinkPreview({ endpoint: "/p" }, PAGE)).rejects.toThrow(/500/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await expect(fetchLinkPreview({ endpoint: "/p" }, PAGE)).rejects.toThrow(/no preview/);
  });
});
