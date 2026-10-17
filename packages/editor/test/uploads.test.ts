import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeUrl } from "../src/components/link-dialog";
import { resolvePersistOptions } from "../src/lib/persistence";
import {
  MAX_LOCAL_UPLOAD_BYTES,
  getUploadMode,
  mapResponsePath,
  uploadWithConfig,
} from "../src/lib/uploads";

const png = () => new File([new Uint8Array([137, 80, 78, 71])], "pixel.png", { type: "image/png" });

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getUploadMode", () => {
  it("prefers uploadFile, then uploadUrl, then local", () => {
    const uploadFile = async () => "x";
    expect(getUploadMode({ uploadFile, uploadUrl: "/up" })).toBe("custom");
    expect(getUploadMode({ uploadUrl: "/up" })).toBe("server");
    expect(getUploadMode({ uploadUrl: "   " })).toBe("local");
    expect(getUploadMode({})).toBe("local");
  });
});

describe("uploadWithConfig", () => {
  it("passes the file to uploadFile and returns its URL", async () => {
    const uploadFile = vi.fn(async (file: File) => `https://cdn.test/${file.name}`);
    await expect(uploadWithConfig({ uploadFile }, png())).resolves.toBe("https://cdn.test/pixel.png");
    expect(uploadFile).toHaveBeenCalledOnce();
  });

  it("POSTs multipart form data with the file in a `file` field", async () => {
    const fetchMock = mockFetch(Response.json({ url: "https://cdn.test/a.png" }));
    const url = await uploadWithConfig({ uploadUrl: "https://api.test/upload" }, png());

    expect(url).toBe("https://cdn.test/a.png");
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://api.test/upload");
    expect(init?.method).toBe("POST");
    const body = init?.body as FormData;
    expect((body.get("file") as File).name).toBe("pixel.png");
  });

  it("resolves relative URLs against the upload endpoint", async () => {
    mockFetch(Response.json({ url: "files/a.png" }));
    await expect(
      uploadWithConfig({ uploadUrl: "https://api.test/v1/upload" }, png()),
    ).resolves.toBe("https://api.test/v1/files/a.png");
  });

  it("uses mapUploadResponse when given", async () => {
    mockFetch(Response.json({ data: { link: "https://cdn.test/b.png" } }));
    const url = await uploadWithConfig(
      { uploadUrl: "https://api.test/upload", mapUploadResponse: mapResponsePath("data.link") },
      png(),
    );
    expect(url).toBe("https://cdn.test/b.png");
  });

  it("reports the server's error message on non-2xx responses", async () => {
    mockFetch(Response.json({ error: "Too large" }, { status: 413 }));
    await expect(uploadWithConfig({ uploadUrl: "https://api.test/upload" }, png())).rejects.toThrow(
      "Upload failed (413): Too large",
    );
  });

  it("explains network failures", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(uploadWithConfig({ uploadUrl: "https://api.test/upload" }, png())).rejects.toThrow(
      "Couldn't reach the upload server at https://api.test/upload.",
    );
  });

  it("rejects responses without a URL", async () => {
    mockFetch(Response.json({ ok: true }));
    await expect(uploadWithConfig({ uploadUrl: "https://api.test/upload" }, png())).rejects.toThrow(
      "didn't include an image URL",
    );
  });

  it("falls back to a data URL without an upload destination", async () => {
    await expect(uploadWithConfig({}, png())).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it("refuses local files over the size limit", async () => {
    const big = new File([new Uint8Array(MAX_LOCAL_UPLOAD_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    await expect(uploadWithConfig({}, big)).rejects.toThrow("must be under 2 MB");
  });
});

describe("mapResponsePath", () => {
  it("throws when the path doesn't lead to a string", () => {
    expect(() => mapResponsePath("data.link")({ data: {} }, new Response())).toThrow(
      'no string at "data.link"',
    );
  });
});

describe("resolvePersistOptions", () => {
  it("is off unless requested", () => {
    expect(resolvePersistOptions(undefined)).toBeNull();
    expect(resolvePersistOptions(false)).toBeNull();
  });

  it("fills in defaults", () => {
    expect(resolvePersistOptions(true)).toEqual({ key: "genesis-editor:document", debounceMs: 400 });
    expect(resolvePersistOptions({ key: "doc-1", debounceMs: 0 })).toEqual({
      key: "doc-1",
      debounceMs: 0,
    });
  });
});

describe("normalizeUrl", () => {
  it("adds https:// to bare domains only", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(normalizeUrl("/docs")).toBe("/docs");
    expect(normalizeUrl("#top")).toBe("#top");
  });
});
