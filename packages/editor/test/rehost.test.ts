import { afterEach, describe, expect, it, vi } from "vitest";

import { RehostQueue, dedupKey, fileNameFromUrl, type RehostJob } from "../src/lib/rehost";
import { UploadError, isRetryable, uploadUrlToServer, uploadWithConfig, type UploadConfig } from "../src/lib/uploads";

afterEach(() => {
  vi.unstubAllGlobals();
});

type Deferred = { resolve: (url: string) => void; reject: (error: Error) => void; url: string; signal: AbortSignal };

/** An `uploadRemote` whose calls stay open until the test settles them. */
function controlledUploader() {
  const calls: Deferred[] = [];
  const uploadRemote = vi.fn(
    (url: string, ctx: { signal: AbortSignal }) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ resolve, reject, url, signal: ctx.signal });
        ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason));
      }),
  );
  return { calls, uploadRemote };
}

function makeQueue(config: UploadConfig, options = {}) {
  const done: { job: RehostJob; url: string }[] = [];
  const failed: { job: RehostJob; error: Error }[] = [];
  const queue = new RehostQueue(
    () => config,
    { onDone: (job, url) => done.push({ job, url }), onFail: (job, error) => failed.push({ job, error }) },
    { origin: "https://app.test", retryDelayMs: 0, ...options },
  );
  return { queue, done, failed };
}

const job = (blockId: string, url: string): RehostJob => ({ blockId, url, source: "paste" });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("RehostQueue", () => {
  it("runs at most uploadConcurrency requests at once, in document order", async () => {
    const { calls, uploadRemote } = controlledUploader();
    const { queue, done } = makeQueue({ uploadRemote, uploadConcurrency: 2 });
    for (let i = 0; i < 5; i++) queue.enqueue(job(`b${i}`, `https://img.test/${i}.png`));
    await tick();
    expect(calls.map((c) => c.url)).toEqual(["https://img.test/0.png", "https://img.test/1.png"]);
    expect(queue.statuses.get("b0")?.state).toBe("uploading");
    expect(queue.statuses.get("b3")?.state).toBe("queued");
    calls[0].resolve("https://cdn.test/0.png");
    await tick();
    expect(calls).toHaveLength(3);
    expect(done[0]).toMatchObject({ url: "https://cdn.test/0.png", job: { blockId: "b0" } });
    expect(queue.statuses.get("b0")).toBeUndefined();
    expect(queue.pending).toBe(4);
  });

  it("defaults to four at once", async () => {
    const { calls, uploadRemote } = controlledUploader();
    const { queue } = makeQueue({ uploadRemote });
    for (let i = 0; i < 6; i++) queue.enqueue(job(`b${i}`, `https://img.test/${i}.png`));
    await tick();
    expect(calls).toHaveLength(4);
  });

  it("uploads the same image once for several blocks, ignoring #hash", async () => {
    const { calls, uploadRemote } = controlledUploader();
    const { queue, done } = makeQueue({ uploadRemote });
    queue.enqueue(job("a", "https://img.test/x.png#one"));
    queue.enqueue(job("b", "https://img.test/x.png"));
    await tick();
    expect(calls).toHaveLength(1);
    calls[0].resolve("https://cdn.test/x.png");
    await queue.settled();
    expect(done.map((d) => d.job.blockId).sort()).toEqual(["a", "b"]);
    queue.enqueue(job("c", "https://img.test/x.png"));
    await queue.settled();
    expect(calls).toHaveLength(1);
    expect(done.at(-1)).toMatchObject({ url: "https://cdn.test/x.png", job: { blockId: "c" } });
  });

  it("keeps a different query apart", async () => {
    expect(await dedupKey("https://img.test/x.png?w=1#a")).toBe("https://img.test/x.png?w=1");
    expect(await dedupKey("https://img.test/x.png?w=2")).not.toBe(await dedupKey("https://img.test/x.png?w=1"));
  });

  it("keys data: URLs by the SHA-256 of their bytes", async () => {
    const a = await dedupKey("data:image/png;base64,iVBORw0KGgo=");
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await dedupKey("data:image/png;base64,iVBORw0K Ggo=")).toBe(a);
  });

  it("retries once after a network error or 5xx, then reports the failure", async () => {
    const uploadRemote = vi.fn(async () => {
      throw new UploadError("Upload failed (503)", 503);
    });
    const { queue, failed } = makeQueue({ uploadRemote });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(uploadRemote).toHaveBeenCalledTimes(2);
    expect(failed[0].error.message).toBe("Upload failed (503)");
    expect(queue.statuses.get("a")).toMatchObject({ state: "failed", message: "Upload failed (503)" });
  });

  it("doesn't retry 4xx responses", async () => {
    const uploadRemote = vi.fn(async () => {
      throw new UploadError("Upload failed (413)", 413);
    });
    const { queue, failed } = makeQueue({ uploadRemote });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(uploadRemote).toHaveBeenCalledOnce();
    expect(failed).toHaveLength(1);
  });

  it("succeeds on the automatic retry", async () => {
    const uploadRemote = vi
      .fn<(url: string) => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce("https://cdn.test/a.png");
    const { queue, done, failed } = makeQueue({ uploadRemote });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(done).toHaveLength(1);
    expect(failed).toHaveLength(0);
  });

  it("retries a failed block on request", async () => {
    const uploadRemote = vi
      .fn<(url: string) => Promise<string>>()
      .mockRejectedValueOnce(new UploadError("nope", 400))
      .mockResolvedValueOnce("https://cdn.test/a.png");
    const { queue, done } = makeQueue({ uploadRemote });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(uploadRemote).toHaveBeenCalledOnce();
    queue.retry("a");
    await queue.settled();
    expect(done).toHaveLength(1);
    expect(queue.statuses.get("a")).toBeUndefined();
  });

  it("aborts the request when its only block goes away, and keeps it while another block waits", async () => {
    const { calls, uploadRemote } = controlledUploader();
    const { queue, done } = makeQueue({ uploadRemote });
    queue.enqueue(job("a", "https://img.test/x.png"));
    queue.enqueue(job("b", "https://img.test/x.png"));
    queue.enqueue(job("c", "https://img.test/y.png"));
    await tick();
    queue.prune((j) => j.blockId !== "a" && j.blockId !== "c");
    expect(calls[0].signal.aborted).toBe(false);
    expect(calls[1].signal.aborted).toBe(true);
    calls[0].resolve("https://cdn.test/x.png");
    await queue.settled();
    expect(done.map((d) => d.job.blockId)).toEqual(["b"]);
    expect(queue.pending).toBe(0);
  });

  it("aborts everything on destroy", async () => {
    const { calls, uploadRemote } = controlledUploader();
    const { queue, done, failed } = makeQueue({ uploadRemote });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await tick();
    queue.destroy();
    await queue.settled();
    expect(calls[0].signal.aborted).toBe(true);
    expect(done).toHaveLength(0);
    expect(failed).toHaveLength(0);
    queue.enqueue(job("b", "https://img.test/b.png"));
    expect(queue.pending).toBe(0);
  });

  it("times out slow requests and retries them once", async () => {
    const { calls, uploadRemote } = controlledUploader();
    const { queue, failed } = makeQueue({ uploadRemote }, { timeoutMs: 5 });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(calls).toHaveLength(2);
    expect(failed[0].error.name).toBe("TimeoutError");
  });

  it("rejects uploader results that aren't image URLs", async () => {
    const { queue, failed } = makeQueue({ uploadRemote: async () => "javascript:alert(1)" });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(failed[0].error.message).toMatch(/didn't return an image URL/);
  });

  it("settles file uploads it tracks", async () => {
    const { queue } = makeQueue({});
    let finish!: () => void;
    void queue.track(new Promise<void>((resolve) => (finish = resolve)));
    expect(queue.pending).toBe(1);
    const settled = queue.settled();
    finish();
    await settled;
    expect(queue.pending).toBe(0);
  });
});

describe("shouldRehost", () => {
  it("needs an uploader, and data: images need a file uploader", () => {
    expect(makeQueue({}).queue.shouldRehost("https://img.test/a.png")).toBe(false);
    const remoteOnly = makeQueue({ uploadFromUrl: "/api/copy" }).queue;
    expect(remoteOnly.shouldRehost("https://img.test/a.png")).toBe(true);
    expect(remoteOnly.shouldRehost("data:image/png;base64,AAAA")).toBe(false);
    const files = makeQueue({ uploadUrl: "/api/upload" }).queue;
    expect(files.shouldRehost("https://img.test/a.png")).toBe(true);
    expect(files.shouldRehost("data:image/png;base64,AAAA")).toBe(true);
  });

  it("skips the app origin, upload endpoints, hosts uploads returned, and other schemes", async () => {
    const { queue } = makeQueue({ uploadRemote: async () => "https://cdn.test/a.png", uploadFromUrl: "https://api.test/copy" });
    expect(queue.shouldRehost("https://app.test/logo.png")).toBe(false);
    expect(queue.shouldRehost("https://api.test/files/1.png")).toBe(false);
    expect(queue.shouldRehost("/relative.png")).toBe(false);
    expect(queue.shouldRehost("ftp://img.test/a.png")).toBe(false);
    expect(queue.shouldRehost("https://cdn.test/b.png")).toBe(true);
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(queue.shouldRehost("https://cdn.test/b.png")).toBe(false);
  });

  it("follows rehostImages", () => {
    expect(makeQueue({ uploadRemote: async () => "", rehostImages: "off" }).queue.shouldRehost("https://img.test/a.png")).toBe(false);
    const only = makeQueue({ uploadRemote: async () => "", rehostImages: (url) => url.includes("keep") }).queue;
    expect(only.shouldRehost("https://img.test/keep.png")).toBe(true);
    expect(only.shouldRehost("https://img.test/a.png")).toBe(false);
    expect(only.shouldRehost("https://app.test/keep.png")).toBe(true);
  });
});

describe("fallback chain", () => {
  it("sends remote URLs to uploadFromUrl as JSON with the upload headers", async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: "/files/a.png" }));
    vi.stubGlobal("fetch", fetchMock);
    const { queue, done } = makeQueue({ uploadFromUrl: "https://api.test/copy", uploadHeaders: async () => ({ Authorization: "Bearer t" }) });
    queue.enqueue({ ...job("a", "https://img.test/a.png"), alt: "A cat", filename: "a.png" });
    await queue.settled();
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://api.test/copy");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://img.test/a.png", alt: "A cat", filename: "a.png" });
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer t" });
    expect(done[0].url).toBe("https://api.test/files/a.png");
  });

  it("prefers uploadRemote over uploadFromUrl", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const uploadRemote = vi.fn(async () => "https://cdn.test/a.png");
    const { queue, done } = makeQueue({ uploadRemote, uploadFromUrl: "https://api.test/copy" });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(done[0].url).toBe("https://cdn.test/a.png");
  });

  it("downloads through the browser when only a file uploader is set", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } })));
    const uploadFile = vi.fn(async (file: File) => `https://cdn.test/${file.name}`);
    const { queue, done } = makeQueue({ uploadFile });
    queue.enqueue({ ...job("a", "https://img.test/photo.png"), filename: "photo.png" });
    await queue.settled();
    expect(uploadFile.mock.calls[0][0].type).toBe("image/png");
    expect(done[0].url).toBe("https://cdn.test/photo.png");
  });

  it("gives up without a retry when the browser can't download the image (CORS)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { queue, failed } = makeQueue({ uploadFile: async () => "https://cdn.test/a.png" });
    queue.enqueue(job("a", "https://img.test/a.png"));
    await queue.settled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(failed[0].error.message).toMatch(/doesn't allow copying/);
  });

  it("sends data: images as files", async () => {
    const uploadFile = vi.fn(async (file: File) => `https://cdn.test/${file.name}`);
    const { queue, done } = makeQueue({ uploadFile });
    queue.enqueue(job("a", "data:image/png;base64,iVBORw0KGgo="));
    await queue.settled();
    const file = uploadFile.mock.calls[0][0];
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(8);
    expect(done[0].url).toBe("https://cdn.test/image.png");
  });
});

describe("upload helpers", () => {
  it("classifies retryable errors", () => {
    expect(isRetryable(new UploadError("x"))).toBe(true);
    expect(isRetryable(new UploadError("x", 502))).toBe(true);
    expect(isRetryable(new UploadError("x", 404))).toBe(false);
    expect(isRetryable(new UploadError("x", 0))).toBe(false);
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryable(new Error("bad"))).toBe(false);
  });

  it("applies uploadHeaders to uploadUrl and passes the signal", async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: "https://cdn.test/a.png" }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    await uploadWithConfig({ uploadUrl: "https://api.test/upload", uploadHeaders: { "X-Key": "k" } }, file, {
      signal: controller.signal,
      onProgress: () => {},
      source: "upload",
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toEqual({ "X-Key": "k" });
    expect(init.signal).toBe(controller.signal);
  });

  it("reports the status of failed URL uploads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Blocked host" }, { status: 422 })));
    const error = await uploadUrlToServer({ uploadFromUrl: "https://api.test/copy" }, "https://img.test/a.png", {}, new AbortController().signal).catch(
      (e: unknown) => e as UploadError,
    );
    expect(error).toBeInstanceOf(UploadError);
    expect(error.status).toBe(422);
    expect(error.message).toBe("Upload failed (422): Blocked host");
  });

  it("derives file names from URLs", () => {
    expect(fileNameFromUrl("https://img.test/a/b%20c.png?x=1")).toBe("b c.png");
    expect(fileNameFromUrl("https://img.test/")).toBeUndefined();
    expect(fileNameFromUrl("data:image/png;base64,AA")).toBeUndefined();
  });
});
