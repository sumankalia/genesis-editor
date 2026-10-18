export type UploadResponseMapper = (
  body: unknown,
  response: Response,
) => string | Promise<string>;

/** What a re-hosted image came from: a paste, or a loaded document (`value`, `setHTML`, initial content). */
export type RehostSource = "paste" | "value";

/** Passed to `uploadFile` and `uploadRemote`. */
export type UploadCallContext = {
  /** Aborted when the block is deleted, the editor is destroyed, or the 30 s timeout passes. */
  signal: AbortSignal;
  /** Reports progress as a fraction from 0 to 1. */
  onProgress: (fraction: number) => void;
  blockId?: string;
  /** `"upload"` for files the user picked, pasted or dropped. */
  source: RehostSource | "upload";
};

export type UploadHeaders = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

export type UploadConfig = {
  /** Custom upload logic. Receives the file and resolves to its public URL. Takes precedence over `uploadUrl`. */
  uploadFile?: (file: File, ctx: UploadCallContext) => Promise<string>;
  /** Endpoint that accepts a multipart/form-data POST with the file in a `file` field. */
  uploadUrl?: string;
  /** Turns the `uploadUrl` and `uploadFromUrl` response body (parsed JSON, or text) into the image URL. Defaults to reading `url`. */
  mapUploadResponse?: UploadResponseMapper;
  /**
   * Endpoint that copies a remote image: a JSON POST of `{ url, alt?, filename? }` answered with `{ url }`.
   * The server fetches the image, so it must refuse private and link-local addresses (SSRF), cap the size
   * and check the content type.
   */
  uploadFromUrl?: string;
  /** Custom re-hosting of a remote image URL. Takes precedence over `uploadFromUrl`. */
  uploadRemote?: (url: string, ctx: UploadCallContext) => Promise<string>;
  /** Extra request headers (auth) for `uploadUrl` and `uploadFromUrl`. */
  uploadHeaders?: UploadHeaders;
  /**
   * Which pasted and loaded images to copy to your storage. `"auto"` (the default) takes every image
   * except those on the page's origin, on hosts earlier uploads returned, and those already re-hosted.
   * Only active when an upload destination is configured.
   */
  rehostImages?: "auto" | "off" | ((url: string) => boolean);
  /**
   * Hosts whose images are never re-hosted, whatever `rehostImages` says: `"cdn.example.com"`,
   * `"*.example.com"` (the domain and its subdomains), an origin such as `"https://cdn.example.com"`,
   * or a predicate on the image URL.
   */
  trustedHosts?: readonly string[] | ((url: string) => boolean);
  /** Re-uploads running at once. Defaults to 4. */
  uploadConcurrency?: number;
};

/** A failed upload request. `status` is the HTTP status, when there was a response. */
export class UploadError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

/** Network errors, timeouts and 5xx responses are worth one more try; 4xx and bad responses aren't. */
export function isRetryable(error: unknown) {
  if (error instanceof UploadError) return error.status === undefined || error.status >= 500;
  return error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");
}

export type UploadMode = "custom" | "server" | "local";

export const MAX_LOCAL_UPLOAD_BYTES = 2 * 1024 * 1024;

export function getUploadMode(config: UploadConfig): UploadMode {
  if (config.uploadFile) return "custom";
  if (config.uploadUrl?.trim()) return "server";
  return "local";
}

const idleContext = (): UploadCallContext => ({ signal: new AbortController().signal, onProgress: () => {}, source: "upload" });

export function uploadWithConfig(config: UploadConfig, file: File, ctx: UploadCallContext = idleContext()): Promise<string> {
  switch (getUploadMode(config)) {
    case "custom":
      return config.uploadFile!(file, ctx);
    case "server": {
      const body = new FormData();
      body.append("file", file, file.name);
      return post(config.uploadUrl!.trim(), body, config, ctx.signal);
    }
    case "local":
      return readAsDataUrl(file);
  }
}

/** Sends a remote image URL to `uploadFromUrl`, whose server fetches and stores it. */
export function uploadUrlToServer(
  config: UploadConfig,
  url: string,
  details: { alt?: string; filename?: string },
  signal: AbortSignal,
): Promise<string> {
  const body = JSON.stringify({ url, ...(details.alt ? { alt: details.alt } : {}), ...(details.filename ? { filename: details.filename } : {}) });
  return post(config.uploadFromUrl!.trim(), body, config, signal, { "Content-Type": "application/json" });
}

async function resolveHeaders(headers: UploadHeaders | undefined) {
  return typeof headers === "function" ? await headers() : (headers ?? {});
}

function pageUrl() {
  return typeof window !== "undefined" ? window.location.href : undefined;
}

async function post(
  endpoint: string,
  body: BodyInit,
  config: UploadConfig,
  signal: AbortSignal,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const headers = { ...extraHeaders, ...(await resolveHeaders(config.uploadHeaders)) };
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body, headers, signal });
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? error;
    throw new UploadError(`Couldn't reach the upload server at ${endpoint}.`);
  }

  const payload = await readBody(response);
  if (!response.ok) {
    const detail =
      (isRecord(payload) && typeof payload.error === "string" && payload.error) ||
      (typeof payload === "string" && payload.trim().slice(0, 200)) ||
      response.statusText;
    throw new UploadError(`Upload failed (${response.status})${detail ? `: ${detail}` : ""}`, response.status);
  }

  const url = config.mapUploadResponse
    ? await config.mapUploadResponse(payload, response)
    : isRecord(payload)
      ? payload.url
      : undefined;
  if (typeof url !== "string" || !url) {
    throw new UploadError("The upload server's response didn't include an image URL.", response.status);
  }
  // Relative URLs are relative to the upload endpoint, not the editor page.
  return new URL(url, new URL(endpoint, pageUrl())).href;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readAsDataUrl(file: File): Promise<string> {
  if (file.size > MAX_LOCAL_UPLOAD_BYTES) {
    return Promise.reject(
      new Error(
        `Images saved in the browser must be under ${MAX_LOCAL_UPLOAD_BYTES / 1024 / 1024} MB. Configure an upload server for larger files.`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsDataURL(file);
  });
}

/** Builds a mapper that reads a dot-separated path such as `data.link` from a JSON response. */
export function mapResponsePath(path: string): UploadResponseMapper {
  const keys = path.split(".").map((key) => key.trim()).filter(Boolean);
  return (body) => {
    const value = keys.reduce<unknown>(
      (current, key) => (isRecord(current) ? current[key] : undefined),
      body,
    );
    if (typeof value !== "string") {
      throw new Error(`The upload response has no string at "${path}".`);
    }
    return value;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
