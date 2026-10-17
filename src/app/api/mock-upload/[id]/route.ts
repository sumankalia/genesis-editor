import { readFile } from "node:fs/promises";

import { filePath, metaPath, type StoredUploadMeta } from "../store";

export async function GET(_request: Request, ctx: RouteContext<"/api/mock-upload/[id]">) {
  const { id } = await ctx.params;
  const file = filePath(id);
  const meta = metaPath(id);
  if (!file || !meta) return new Response("Not found", { status: 404 });

  try {
    const [bytes, rawMeta] = await Promise.all([readFile(file), readFile(meta, "utf8")]);
    const { type } = JSON.parse(rawMeta) as StoredUploadMeta;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
