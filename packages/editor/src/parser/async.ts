import { RehostQueue, fileNameFromUrl } from "../lib/rehost";
import type { UploadConfig } from "../lib/uploads";
import { parseHTML } from "./parse";
import type { HtmlBlock, HtmlInline, HtmlInlineImage, ParseOptions, ParseResult } from "./types";

export type ParseAsyncOptions = ParseOptions &
  Pick<UploadConfig, "uploadRemote" | "uploadFromUrl" | "uploadHeaders" | "mapUploadResponse" | "uploadConcurrency" | "trustedHosts"> & {
    /** Which image URLs to copy. Defaults to every `http(s)` image not already re-hosted. */
    rehostImages?: "auto" | "off" | ((url: string) => boolean);
    /** Stops pending uploads; the images they were for keep their original URLs. */
    signal?: AbortSignal;
  };

/**
 * `parseHTML`, then copies remote images to your storage with `uploadRemote` (or an absolute
 * `uploadFromUrl`) before returning: `url` becomes the copy, `originalUrl` the source, and `hosted` is set. The
 * recommended path for bulk imports on a server, where there's no CORS and SSRF is guarded centrally.
 * Failed images keep their URL and are counted in `report.images.rehostFailed`.
 */
export async function parseHTMLAsync(html: string, options: ParseAsyncOptions = {}): Promise<ParseResult> {
  const result = parseHTML(html, options);
  const images = new Map<string, HtmlBlock | HtmlInlineImage>();
  const queue = new RehostQueue(() => options, {
    onDone: (job, url) => {
      const target = images.get(job.blockId)!;
      target.props = { ...target.props, url, originalUrl: job.url, hosted: true };
      result.report.images.rehosted++;
    },
    onFail: (job, error) => {
      result.report.images.rehostFailed++;
      result.report.warnings.push(`Couldn't re-upload ${job.url}: ${error.message}`);
    },
  });
  const add = (target: HtmlBlock | HtmlInlineImage) => {
    const props = target.props as Record<string, unknown> | undefined;
    const url = props?.url;
    if (typeof url !== "string" || props?.originalUrl || props?.hosted || !queue.shouldRehost(url)) return;
    const blockId = `image-${images.size}`;
    images.set(blockId, target);
    const alt = props?.alt ?? props?.name;
    queue.enqueue({ blockId, url, alt: typeof alt === "string" && alt ? alt : undefined, filename: fileNameFromUrl(url), source: "value" });
  };
  const inline = (content: HtmlInline[]) => {
    for (const node of content) if (node.type === "inlineImage") add(node);
  };
  const visit = (blocks: HtmlBlock[]) => {
    for (const block of blocks) {
      if (block.type === "image") add(block);
      if (Array.isArray(block.content)) inline(block.content);
      else if (block.content?.type === "tableContent") for (const row of block.content.rows) for (const cell of row.cells) inline(cell.content);
      if (block.children) visit(block.children);
    }
  };
  visit(result.blocks);
  const abort = () => queue.destroy();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  await queue.settled();
  options.signal?.removeEventListener("abort", abort);
  return result;
}
