import { linkPreviewProps, type LinkPreviewMeta, type LinkPreviewProps } from "../parser/link-preview";
import type { UploadHeaders } from "./uploads";

export type { LinkPreviewMeta, LinkPreviewProps };

/**
 * Where link preview metadata comes from. Set `endpoint` (your server fetches the page, so it must refuse
 * private addresses) or `resolve`, which takes precedence. Without either, URLs stay plain links.
 */
export type LinkPreviewConfig = {
  /** Answers `{ title, description, image, siteName, favicon }` for `GET ?url=` or a JSON `POST` of `{ url }`. */
  endpoint?: string;
  /** Defaults to `"GET"`. */
  method?: "GET" | "POST";
  /** Extra request headers (auth) for `endpoint`. */
  headers?: UploadHeaders;
  /** Custom lookup. Resolve to `null` when the page has no preview. */
  resolve?: (url: string, ctx: { signal: AbortSignal }) => Promise<LinkPreviewMeta | null | undefined>;
};

const TIMEOUT_MS = 15_000;

export function isLinkPreviewConfigured(config: LinkPreviewConfig | undefined) {
  return Boolean(config?.resolve || config?.endpoint?.trim());
}

async function requestMeta(config: LinkPreviewConfig, url: string, signal: AbortSignal): Promise<unknown> {
  if (config.resolve) return config.resolve(url, { signal });
  const endpoint = config.endpoint!.trim();
  const headers = typeof config.headers === "function" ? await config.headers() : (config.headers ?? {});
  const post = config.method === "POST";
  const target = post ? endpoint : `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}`;
  const response = await fetch(target, {
    method: post ? "POST" : "GET",
    headers: { Accept: "application/json", ...(post ? { "Content-Type": "application/json" } : {}), ...headers },
    body: post ? JSON.stringify({ url }) : undefined,
    signal,
  });
  if (!response.ok) throw new Error(`The link preview endpoint answered ${response.status}.`);
  return response.json();
}

/** The cleaned card for `url`. Rejects when there's no preview: no title, description or image. */
export async function fetchLinkPreview(config: LinkPreviewConfig, url: string, signal?: AbortSignal): Promise<LinkPreviewProps> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal && "any" in AbortSignal ? AbortSignal.any([signal, timeout]) : timeout;
  const card = linkPreviewProps(url, await requestMeta(config, url, combined));
  if (!card) throw new Error("Only http(s) links have previews.");
  if (!card.title && !card.description && !card.image) throw new Error("That page has no preview.");
  return card;
}

/** Per editor: the latest config and one request per URL at a time. */
export class LinkPreviewController {
  private pending = new Map<string, Promise<LinkPreviewProps>>();
  constructor(private getConfig: () => LinkPreviewConfig | undefined) {}

  get configured() {
    return isLinkPreviewConfigured(this.getConfig());
  }

  load(url: string): Promise<LinkPreviewProps> {
    const config = this.getConfig();
    if (!config || !isLinkPreviewConfigured(config)) return Promise.reject(new Error("Link previews aren't configured."));
    let request = this.pending.get(url);
    if (!request) {
      request = fetchLinkPreview(config, url).finally(() => this.pending.delete(url));
      this.pending.set(url, request);
    }
    return request;
  }
}

const controllers = new WeakMap<object, LinkPreviewController>();

export function registerLinkPreviews(editor: object, controller: LinkPreviewController) {
  controllers.set(editor, controller);
}

export const linkPreviewsOf = (editor: object) => controllers.get(editor);
