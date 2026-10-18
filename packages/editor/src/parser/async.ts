import { RehostQueue, fileNameFromUrl } from "../lib/rehost";
import type { UploadConfig } from "../lib/uploads";
import { parseHTML } from "./parse";
import type { HtmlBlock, ParseOptions, ParseResult } from "./types";

export type ParseAsyncOptions = ParseOptions &
  Pick<UploadConfig, "uploadRemote" | "uploadFromUrl" | "uploadHeaders" | "mapUploadResponse" | "uploadConcurrency"> & {
    /** Which image URLs to copy. Defaults to every `http(s)` image not already re-hosted. */
    rehostImages?: "auto" | "off" | ((url: string) => boolean);
    /** Stops pending uploads; the images they were for keep their original URLs. */
    signal?: AbortSignal;
  };

/**
 * `parseHTML`, then copies remote images to your storage with `uploadRemote` (or an absolute
 * `uploadFromUrl`) before returning: `url` becomes the copy and `originalUrl` the source. The
 * recommended path for bulk imports on a server, where there's no CORS and SSRF is guarded centrally.
 * Failed images keep their URL and are counted in `report.images.rehostFailed`.
 */
export async function parseHTMLAsync(html: string, options: ParseAsyncOptions = {}): Promise<ParseResult> {
  const result = parseHTML(html, options);
  const images = new Map<string, HtmlBlock>();
  const queue = new RehostQueue(() => options, {
    onDone: (job, url) => {
      const block = images.get(job.blockId)!;
      block.props = { ...block.props, url, originalUrl: job.url };
      result.report.images.rehosted++;
    },
    onFail: (job, error) => {
      result.report.images.rehostFailed++;
      result.report.warnings.push(`Couldn't re-upload ${job.url}: ${error.message}`);
    },
  });
  const visit = (blocks: HtmlBlock[]) => {
    for (const block of blocks) {
      const url = block.props?.url;
      if (block.type === "image" && typeof url === "string" && !block.props?.originalUrl && queue.shouldRehost(url)) {
        const blockId = `image-${images.size}`;
        images.set(blockId, block);
        const alt = block.props?.alt ?? block.props?.name;
        queue.enqueue({ blockId, url, alt: typeof alt === "string" ? alt : undefined, filename: fileNameFromUrl(url), source: "value" });
      }
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
