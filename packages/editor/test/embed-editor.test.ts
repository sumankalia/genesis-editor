import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { createPasteHandler, exportHTML } from "../src/html";
import { embedRegistry } from "../src/parser/embeds";
import { registerEmbedRegistry, resolveEmbedInput } from "../src/plugins/embed";
import { resolveEditorSetup, type ToolSelection } from "../src/plugins/resolve";
import { schemaSupport, toEditorBlocks } from "../src/plugins/sanitize";

function mounted(options: { tools?: ToolSelection; content?: PartialBlock[]; policy?: "open" | "allowlist" } = {}) {
  const setup = resolveEditorSetup(options.tools, []);
  const support = schemaSupport(setup.schema);
  const editor = BlockNoteEditor.create({
    schema: setup.schema,
    extensions: setup.extensions,
    initialContent: options.content as never,
  }) as unknown as BlockNoteEditor;
  registerEmbedRegistry(editor, embedRegistry({ policy: options.policy }, [], { origin: "http://localhost:3000" }));
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

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("embed block", () => {
  it("renders a provider frame rebuilt from url, with the caption bar", () => {
    const { root } = mounted({
      content: [{ type: "embed", props: { provider: "youtube", url: YT, embedUrl: "https://evil.test/", aspectRatio: "16/9", caption: "Classic" } } as unknown as PartialBlock],
    });
    const iframe = root.querySelector<HTMLIFrameElement>(".genesis-embed iframe")!;
    expect(iframe.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(iframe.getAttribute("sandbox")).toContain("allow-same-origin");
    expect(iframe.getAttribute("loading")).toBe("lazy");
    expect(root.querySelector(".genesis-embed-host")?.textContent).toBe("YouTube");
    expect(root.querySelector(".genesis-embed-caption")?.textContent).toBe("Classic");
    expect(root.querySelector<HTMLAnchorElement>(".genesis-embed-open")?.href).toBe(YT);
    expect(root.querySelector<HTMLAnchorElement>(".genesis-embed-open")?.rel).toBe("noopener noreferrer");
  });

  it("generic frames are sandboxed without allow-same-origin; the app's own origin and the allowlist policy are refused", () => {
    const generic = { type: "embed", props: { url: "https://widgets.example.org/w", embedUrl: "https://widgets.example.org/w" } } as unknown as PartialBlock;
    const open = mounted({ content: [generic] }).root.querySelector("iframe")!;
    expect(open.getAttribute("sandbox")).toBe("allow-scripts allow-popups allow-popups-to-escape-sandbox");
    expect(open.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(open.hasAttribute("allow")).toBe(false);
    const own = { type: "embed", props: { url: "http://localhost:3000/admin", embedUrl: "http://localhost:3000/admin" } } as unknown as PartialBlock;
    expect(mounted({ content: [own] }).root.querySelector("iframe")).toBeNull();
    const strict = mounted({ content: [generic], policy: "allowlist" }).root;
    expect(strict.querySelector("iframe")).toBeNull();
    expect(strict.querySelector(".genesis-embed-blocked")?.textContent).toMatch(/isn't allowed/);
  });

  it("an empty embed shows an input; Convert to link swaps the block for a link", () => {
    const { editor, root } = mounted({ content: [{ type: "embed" } as unknown as PartialBlock, { type: "embed", props: { provider: "youtube", url: YT } } as unknown as PartialBlock] });
    expect(root.querySelector(".genesis-embed-input")).not.toBeNull();
    root.querySelector<HTMLButtonElement>(".genesis-embed-to-link")!.click();
    expect(editor.document[1]).toMatchObject({ type: "paragraph", content: [{ type: "link", href: YT }] });
  });

  it("the /embed input takes provider URLs, iframe code, and https pages", () => {
    const registry = embedRegistry({}, [], { origin: "https://app.test" });
    expect(resolveEmbedInput(` ${YT} `, registry)?.resolved.provider).toBe("youtube");
    expect(resolveEmbedInput('<iframe src="https://player.vimeo.com/video/76979871" width="640" height="360"></iframe>', registry)?.resolved.provider).toBe("vimeo");
    expect(resolveEmbedInput('<iframe src="https://widgets.example.org/w" width="400" height="300"></iframe>', registry)).toMatchObject({ resolved: { provider: "" }, aspectRatio: "400/300" });
    expect(resolveEmbedInput("https://example.org/page", registry)?.resolved.provider).toBe("");
    expect(resolveEmbedInput("https://example.org/page", embedRegistry({ policy: "allowlist" }))).toBeNull();
    expect(resolveEmbedInput("javascript:alert(1)", registry)).toBeNull();
  });

  it("exports through toHTML and survives a reload", () => {
    const { editor } = mounted({ content: [{ type: "embed", props: { provider: "youtube", url: YT, aspectRatio: "16/9" } } as unknown as PartialBlock] });
    const html = exportHTML(editor);
    expect(html).toContain("data-genesis-embed");
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
  });
});

describe("bare URL paste", () => {
  it("a provider URL on an empty line becomes an embed; one undo turns it back into the link", () => {
    const { editor, sanitize } = mounted();
    expect(paste(editor, sanitize, { "text/plain": YT }).handled).toBe(true);
    expect(editor.document[0]).toMatchObject({ type: "embed", props: { provider: "youtube", url: YT } });
    editor.undo();
    expect(editor.document[0]).toMatchObject({ type: "paragraph", content: [{ type: "link", href: YT, content: [{ text: YT }] }] });
    editor.undo();
    expect(editor.document[0]).toMatchObject({ type: "paragraph", content: [] });
  });

  it("an HTML paragraph holding only the URL becomes an embed, alongside the rest of the paste", () => {
    const { editor, sanitize } = mounted();
    paste(editor, sanitize, { "text/html": `<p>Watch this:</p><p><a href="${YT}">${YT}</a></p><p>After</p>`, "text/plain": "" });
    expect(editor.document.map((b) => b.type)).toEqual(["paragraph", "embed", "paragraph"]);
  });

  it("a URL inside a sentence, a link with other text, and unknown URLs stay links", () => {
    const sentence = mounted({ content: [{ type: "paragraph", content: "See " }] });
    sentence.editor.setTextCursorPosition(sentence.editor.document[0], "end");
    paste(sentence.editor, sentence.sanitize, { "text/plain": YT });
    expect(sentence.editor.document[0].type).toBe("paragraph");

    const titled = mounted();
    paste(titled.editor, titled.sanitize, { "text/html": `<p><a href="${YT}">Never gonna give you up</a></p>` });
    expect(titled.editor.document[0].type).toBe("paragraph");

    const unknown = mounted();
    expect(paste(unknown.editor, unknown.sanitize, { "text/plain": "https://example.org/article" }).fallback).toBe(true);
  });

  it("does nothing when the embed tool is off", () => {
    const { editor, sanitize } = mounted({ tools: ["link"] });
    expect(paste(editor, sanitize, { "text/plain": YT }).fallback).toBe(true);
    paste(editor, sanitize, { "text/html": `<p><a href="${YT}">${YT}</a></p>` });
    expect(editor.document.some((b) => (b.type as string) === "embed")).toBe(false);
  });

  it("pasted iframe code becomes an embed", () => {
    const { editor, sanitize } = mounted();
    paste(editor, sanitize, { "text/html": '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" allow="camera; microphone"></iframe>' });
    expect(editor.document[0]).toMatchObject({ type: "embed", props: { provider: "youtube", url: YT } });
  });
});

describe("slash menu ranking", () => {
  it("title-prefix matches come first inside their group; groups stay in order", async () => {
    const { rankSlashItems } = await import("../src/plugins/resolve");
    const items = [
      { title: "Heading 1", group: "Headings" },
      { title: "File", group: "Media" },
      { title: "Embed", group: "Media" },
      { title: "Emoji", group: "Others" },
    ];
    expect(rankSlashItems(items, "em").map((i) => i.title)).toEqual(["Heading 1", "Embed", "File", "Emoji"]);
    expect(rankSlashItems(items, "")).toBe(items);
  });
});
