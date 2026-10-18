import { describe, expect, it, vi } from "vitest";

import { parseHTML, parseHTMLAsync, toHTML } from "../src/parser";
import { UploadError } from "../src/lib/uploads";

const props = (html: string) => parseHTML(html).blocks[0]?.props;

describe("originalUrl in HTML", () => {
  it("exports it as data-original-src and reads it back", () => {
    const html = toHTML([{ type: "image", props: { url: "https://cdn.test/a.png", originalUrl: "https://img.test/a.png", name: "A" } }]);
    expect(html).toContain('data-original-src="https://img.test/a.png"');
    expect(props(html)).toMatchObject({ url: "https://cdn.test/a.png", originalUrl: "https://img.test/a.png" });
    expect(toHTML(parseHTML(html).blocks)).toBe(html);
  });

  it("ignores unsafe or non-http values", () => {
    expect(props('<img src="https://a.test/x.png" data-original-src="javascript:alert(1)">')?.originalUrl).toBeUndefined();
    expect(props('<img src="https://a.test/x.png" data-original-src="data:image/png;base64,AAAA">')?.originalUrl).toBeUndefined();
    expect(toHTML([{ type: "image", props: { url: "https://a.test/x.png", originalUrl: "javascript:x" } }])).not.toContain("data-original-src");
  });
});

describe("maxDataImageBytes", () => {
  const big = `data:image/png;base64,${"A".repeat(2000)}`;

  it("removes larger inline images and reports them", () => {
    const { blocks, report } = parseHTML(`<p>a</p><img src="${big}"><img src="data:image/png;base64,${"A".repeat(400)}">`, { maxDataImageBytes: 1000 });
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(1);
    expect(report.images.failed).toBe(1);
    expect(report.warnings[0]).toMatch(/Inline images over 1 KB were removed/);
  });

  it("keeps them without a limit", () => {
    expect(parseHTML(`<img src="${big}">`).blocks).toHaveLength(1);
  });
});

describe("parseHTMLAsync", () => {
  const html = '<img src="https://img.test/a.png" alt="A"><p>x</p><img src="https://img.test/a.png#2"><img src="https://img.test/b.png" data-original-src="https://old.test/b.png">';

  it("re-hosts remote images before returning, once per image", async () => {
    const uploadRemote = vi.fn(async (url: string) => url.replace("img.test", "cdn.test"));
    const { blocks, report } = await parseHTMLAsync(html, { uploadRemote });
    expect(uploadRemote).toHaveBeenCalledOnce();
    expect(blocks[0].props).toMatchObject({ url: "https://cdn.test/a.png", originalUrl: "https://img.test/a.png" });
    expect(blocks[2].props).toMatchObject({ url: "https://cdn.test/a.png", originalUrl: "https://img.test/a.png#2" });
    expect(blocks[3].props).toMatchObject({ url: "https://img.test/b.png", originalUrl: "https://old.test/b.png" });
    expect(report.images.rehosted).toBe(2);
  });

  it("keeps the original URL when an upload fails", async () => {
    const uploadRemote = vi.fn(async () => {
      throw new UploadError("Blocked", 403);
    });
    const { blocks, report } = await parseHTMLAsync(html, { uploadRemote });
    expect(blocks[0].props?.url).toBe("https://img.test/a.png");
    expect(report.images.rehostFailed).toBe(2);
    expect(report.warnings[0]).toMatch(/Couldn't re-upload https:\/\/img.test\/a.png: Blocked/);
  });

  it("is a plain parse without an uploader or with rehostImages off", async () => {
    const plain = await parseHTMLAsync(html);
    expect(plain.blocks[0].props?.url).toBe("https://img.test/a.png");
    const uploadRemote = vi.fn(async () => "https://cdn.test/x.png");
    await parseHTMLAsync(html, { uploadRemote, rehostImages: "off" });
    expect(uploadRemote).not.toHaveBeenCalled();
  });

  it("stops at the signal", async () => {
    const controller = new AbortController();
    const uploadRemote = vi.fn(
      (_url: string, ctx: { signal: AbortSignal }) =>
        new Promise<string>((_, reject) => ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason))),
    );
    const pending = parseHTMLAsync(html, { uploadRemote, signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    const { blocks, report } = await pending;
    expect(blocks[0].props?.url).toBe("https://img.test/a.png");
    expect(report.images.rehostFailed).toBe(0);
  });
});
