import type { FidelityReport } from "../parser/types";
import { dataUrlBytes } from "../parser/urls";
import {
  UploadError,
  getUploadMode,
  isRetryable,
  uploadUrlToServer,
  uploadWithConfig,
  type RehostSource,
  type UploadCallContext,
  type UploadConfig,
} from "./uploads";

export { dataUrlBytes };

export const REHOST_TIMEOUT_MS = 30_000;
/** Pasted `data:` images above this size are removed when there's no upload destination to move them to. */
export const MAX_INLINE_DATA_IMAGE_BYTES = 1024 * 1024;
const CACHE_SIZE = 500;

export type RehostJob = {
  blockId: string;
  url: string;
  alt?: string;
  filename?: string;
  source: RehostSource;
  /** The import report to count the outcome in. */
  report?: FidelityReport | null;
};

export type RehostStatus =
  | { state: "queued"; url: string }
  | { state: "uploading"; url: string; progress?: number }
  | { state: "failed"; url: string; message: string };

export type RehostHooks = {
  /** The upload finished; swap the block's `url` if it still shows `job.url`. */
  onDone: (job: RehostJob, url: string) => void;
  /** Both attempts failed. The block keeps its original URL. */
  onFail?: (job: RehostJob, error: Error) => void;
};

export type RehostQueueOptions = {
  /** The page origin; `"auto"` never copies images from it. */
  origin?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
};

/** Per-key state shared with subscribers, read by `useSyncExternalStore` and the image badge. */
export class KeyedStore<T> {
  private values = new Map<string, T>();
  private listeners = new Set<() => void>();

  get(key: string) {
    return this.values.get(key);
  }

  set(key: string, value: T) {
    this.values.set(key, value);
    this.emit();
  }

  delete(key: string) {
    if (this.values.delete(key)) this.emit();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export const hasFileUploader = (config: UploadConfig) => getUploadMode(config) !== "local";
export const hasRemoteUploader = (config: UploadConfig) => Boolean(config.uploadRemote || config.uploadFromUrl?.trim());

const isInline = (url: string) => /^data:image\//i.test(url) || /^blob:/i.test(url);
const isRemote = (url: string) => /^https?:\/\//i.test(url);

function hostOf(url: string | undefined, base?: string) {
  if (!url) return undefined;
  try {
    return new URL(url, base).host;
  } catch {
    return undefined;
  }
}

function dataUrlParts(url: string) {
  const comma = url.indexOf(",");
  const header = url.slice(5, comma);
  const mime = header.split(";")[0] || "image/png";
  const data = url.slice(comma + 1);
  let bytes: Uint8Array;
  if (/;base64$/i.test(header)) {
    const binary = atob(data.replace(/\s/g, ""));
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  return { mime, bytes };
}

function decodeDataUrl(url: string, filename?: string) {
  const { mime, bytes } = dataUrlParts(url);
  const extension = mime.split("/")[1]?.replace("+xml", "") ?? "png";
  return new File([bytes as BlobPart], filename ?? `image.${extension}`, { type: mime });
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The same image pasted twice uploads once: absolute URL without `#hash` (query kept), or the SHA-256 of `data:` bytes. */
export async function dedupKey(url: string) {
  if (/^data:/i.test(url)) {
    if (typeof crypto === "undefined" || !crypto.subtle) return url;
    return `sha256:${await sha256(dataUrlParts(url).bytes)}`;
  }
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

/** The last path segment, as the file name a copied image is stored under. */
export function fileNameFromUrl(url: string) {
  if (!isRemote(url)) return undefined;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return name && name.length <= 200 ? name : undefined;
  } catch {
    return undefined;
  }
}

async function downloadImage(url: string, filename: string | undefined, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, { signal, mode: "cors", credentials: "omit" });
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? error;
    // A CORS refusal looks like a network error; retrying won't change it.
    throw new UploadError(
      "The image's host doesn't allow copying it from the browser. Set uploadFromUrl or uploadRemote to copy it on your server.",
      0,
    );
  }
  if (!response.ok) throw new UploadError(`Couldn't download the image (${response.status}).`, response.status);
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith("image/")) throw new UploadError(`The URL isn't an image (${blob.type}).`, 415);
  return new File([blob], filename ?? "image", { type: blob.type || "image/png" });
}

/** The fallback chain (design §7): inline images as files, remote URLs to the URL uploader, else through the browser. */
async function transfer(job: RehostJob, config: UploadConfig, ctx: UploadCallContext) {
  if (/^data:/i.test(job.url)) return uploadWithConfig(config, decodeDataUrl(job.url, job.filename), ctx);
  if (/^blob:/i.test(job.url)) {
    const blob = await (await fetch(job.url, { signal: ctx.signal })).blob();
    return uploadWithConfig(config, new File([blob], job.filename ?? "image", { type: blob.type }), ctx);
  }
  if (config.uploadRemote) return config.uploadRemote(job.url, ctx);
  if (config.uploadFromUrl?.trim()) return uploadUrlToServer(config, job.url, { alt: job.alt, filename: job.filename }, ctx.signal);
  return uploadWithConfig(config, await downloadImage(job.url, job.filename, ctx.signal), ctx);
}

function timeoutError(ms: number) {
  const error = new UploadError(`The upload took longer than ${Math.round(ms / 1000)} s.`);
  error.name = "TimeoutError";
  return error;
}

function timeoutSignal(parent: AbortSignal, ms: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(timeoutError(ms)),
    ms,
  );
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
  };
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

type Task = { controller: AbortController; promise: Promise<string>; waiting: Set<string> };
type Entry = { job: RehostJob; cancelled: boolean; cancel: () => void; cancelledPromise: Promise<never> };

const CANCELLED = Symbol("cancelled");

/**
 * One per editor: copies pasted and loaded images to the app's storage in document order, a few at a
 * time, without blocking the paste. Requests time out after 30 s, are retried once on network errors
 * and 5xx, and are shared between blocks showing the same image. Status is kept here, never in the document.
 */
export class RehostQueue {
  readonly statuses = new KeyedStore<RehostStatus>();
  private entries = new Map<string, Entry>();
  private failed = new Map<string, RehostJob>();
  private tasks = new Map<string, Task>();
  private cache = new Map<string, string>();
  private knownHosts = new Set<string>();
  private active = 0;
  private slotWaiters: (() => void)[] = [];
  private pendingCount = 0;
  private settleWaiters: (() => void)[] = [];
  private destroyed = false;

  constructor(
    private getConfig: () => UploadConfig,
    private hooks: RehostHooks,
    private options: RehostQueueOptions = {},
  ) {}

  /** Uploads and re-uploads still running. */
  get pending() {
    return this.pendingCount;
  }

  /** Resolves once nothing is uploading. Failed re-uploads count as settled. */
  settled(): Promise<void> {
    if (this.pendingCount === 0) return Promise.resolve();
    return new Promise((resolve) => this.settleWaiters.push(resolve));
  }

  /** Counts another upload (a file the user added) in `pending` and `settled()`. */
  track<T>(promise: Promise<T>): Promise<T> {
    this.pendingCount++;
    return promise.finally(() => this.release());
  }

  /** Records the host of a URL an upload returned, so `"auto"` doesn't copy it again. */
  rememberHost(url: string) {
    const host = hostOf(url);
    if (host && isRemote(url)) this.knownHosts.add(host);
  }

  /** Whether `rehostImages` and the configured uploaders call for copying this image. */
  shouldRehost(url: string) {
    const config = this.getConfig();
    const policy = config.rehostImages ?? "auto";
    if (policy === "off" || !url) return false;
    const usable = isInline(url) ? hasFileUploader(config) : isRemote(url) && (hasRemoteUploader(config) || hasFileUploader(config));
    if (!usable) return false;
    if (typeof policy === "function") return policy(url);
    if (isInline(url)) return true;
    const host = hostOf(url);
    if (!host) return false;
    if (this.options.origin && hostOf(this.options.origin) === host) return false;
    const endpoints = [config.uploadUrl, config.uploadFromUrl].map((endpoint) => hostOf(endpoint?.trim(), this.options.origin));
    return !this.knownHosts.has(host) && !endpoints.includes(host);
  }

  /** Queues a block's image. A block that's already queued for the same URL, or failed with it, is left alone. */
  enqueue(job: RehostJob) {
    if (this.destroyed) return;
    const current = this.entries.get(job.blockId);
    if (current?.job.url === job.url || this.failed.get(job.blockId)?.url === job.url) return;
    this.abort(job.blockId);
    let cancel!: () => void;
    const cancelledPromise = new Promise<never>((_, reject) => {
      cancel = () => reject(CANCELLED);
    });
    cancelledPromise.catch(() => {});
    const entry: Entry = { job, cancelled: false, cancel, cancelledPromise };
    this.entries.set(job.blockId, entry);
    this.statuses.set(job.blockId, { state: "queued", url: job.url });
    this.pendingCount++;
    void this.run(entry).finally(() => this.release());
  }

  /** Tries a failed re-upload again. */
  retry(blockId: string) {
    const job = this.failed.get(blockId);
    if (!job) return;
    this.failed.delete(blockId);
    this.enqueue(job);
  }

  /** Stops the block's re-upload. The shared request is aborted once no other block waits for it. */
  abort(blockId: string) {
    this.failed.delete(blockId);
    const entry = this.entries.get(blockId);
    if (!entry) return this.statuses.delete(blockId);
    entry.cancelled = true;
    entry.cancel();
    this.entries.delete(blockId);
    this.statuses.delete(blockId);
    for (const task of this.tasks.values()) {
      if (task.waiting.delete(blockId) && task.waiting.size === 0) task.controller.abort(new DOMException("Cancelled.", "AbortError"));
    }
  }

  /** Aborts jobs whose block is gone or shows a different image. */
  prune(isLive: (job: RehostJob) => boolean) {
    for (const [blockId, entry] of this.entries) if (!isLive(entry.job)) this.abort(blockId);
    for (const [blockId, job] of this.failed) if (!isLive(job)) this.abort(blockId);
  }

  /** Re-enables a destroyed queue (React runs effects twice in development). */
  start() {
    this.destroyed = false;
  }

  /** Aborts everything; nothing is queued until `start()`. */
  destroy() {
    this.destroyed = true;
    for (const blockId of [...this.entries.keys(), ...this.failed.keys()]) this.abort(blockId);
  }

  private release() {
    this.pendingCount--;
    if (this.pendingCount > 0) return;
    const waiters = this.settleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private async run(entry: Entry) {
    const { job } = entry;
    try {
      const key = await dedupKey(job.url);
      if (entry.cancelled) return;
      const cached = this.cache.get(key);
      let url: string;
      if (cached !== undefined) {
        this.cache.delete(key);
        this.cache.set(key, cached);
        url = cached;
      } else {
        url = await Promise.race([this.share(key, entry), entry.cancelledPromise]);
      }
      if (entry.cancelled) return;
      this.entries.delete(job.blockId);
      this.statuses.delete(job.blockId);
      this.hooks.onDone(job, url);
    } catch (caught) {
      if (entry.cancelled || caught === CANCELLED) return;
      const error = caught instanceof Error ? caught : new Error("Re-upload failed.");
      this.entries.delete(job.blockId);
      this.failed.set(job.blockId, job);
      this.statuses.set(job.blockId, { state: "failed", url: job.url, message: error.message });
      this.hooks.onFail?.(job, error);
    }
  }

  private share(key: string, entry: Entry) {
    let task = this.tasks.get(key);
    if (!task) {
      const created: Task = { controller: new AbortController(), waiting: new Set(), promise: Promise.resolve("") };
      created.promise = this.execute(created, entry.job).finally(() => {
        if (this.tasks.get(key) === created) this.tasks.delete(key);
      });
      created.promise.then(
        (url) => this.remember(key, url),
        () => {},
      );
      this.tasks.set(key, created);
      task = created;
    }
    task.waiting.add(entry.job.blockId);
    return task.promise;
  }

  private remember(key: string, url: string) {
    this.cache.set(key, url);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    this.rememberHost(url);
  }

  private setStatus(task: Task, status: RehostStatus) {
    for (const blockId of task.waiting) {
      const url = this.entries.get(blockId)?.job.url ?? status.url;
      this.statuses.set(blockId, { ...status, url });
    }
  }

  private async acquire(signal: AbortSignal) {
    const limit = Math.max(1, this.getConfig().uploadConcurrency ?? 4);
    while (this.active >= limit) {
      await new Promise<void>((resolve) => this.slotWaiters.push(resolve));
      if (signal.aborted) throw signal.reason;
    }
    if (signal.aborted) throw signal.reason;
    this.active++;
  }

  private releaseSlot() {
    this.active--;
    this.slotWaiters.shift()?.();
  }

  private async execute(task: Task, job: RehostJob): Promise<string> {
    const parent = task.controller.signal;
    for (let attempt = 0; ; attempt++) {
      await this.acquire(parent);
      this.setStatus(task, { state: "uploading", url: job.url });
      const { signal, clear } = timeoutSignal(parent, this.options.timeoutMs ?? REHOST_TIMEOUT_MS);
      const ctx: UploadCallContext = {
        signal,
        blockId: job.blockId,
        source: job.source,
        onProgress: (fraction) =>
          this.setStatus(task, { state: "uploading", url: job.url, progress: Math.min(1, Math.max(0, fraction)) }),
      };
      try {
        const url = await transfer(job, this.getConfig(), ctx);
        if (typeof url !== "string" || !/^(https?:\/\/|data:image\/)/i.test(url)) {
          throw new UploadError("The uploader didn't return an image URL.", 400);
        }
        return url;
      } catch (error) {
        if (parent.aborted || attempt > 0 || !isRetryable(error)) throw error;
      } finally {
        clear();
        this.releaseSlot();
      }
      this.setStatus(task, { state: "queued", url: job.url });
      await delay(this.options.retryDelayMs ?? 1000, parent);
    }
  }
}
