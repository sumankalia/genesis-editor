import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import {
  MAX_UPLOAD_BYTES,
  UPLOAD_DIR,
  filePath,
  metaPath,
  type StoredUploadMeta,
} from "./store";

/**
 * Mock image upload server for trying the editor's `uploadUrl` mode.
 *
 * POST multipart/form-data with a `file` field; responds with `{ url }`.
 * Query params for testing: `?fail=1` returns a 500, `?delay=<ms>` waits first,
 * `?shape=nested` responds with `{ data: { link } }` instead.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;

  const delay = Math.min(Number(params.get("delay")) || 0, 10_000);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

  if (params.get("fail")) {
    return Response.json(
      { error: "Mock server is set to fail (remove ?fail=1 to succeed)." },
      { status: 500 },
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing `file` field." }, { status: 400 });
  }
  // SVG is refused because it is served from this origin and can carry script.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return Response.json(
      { error: "Only raster images (PNG, JPEG, GIF, WebP, …) are accepted." },
      { status: 415 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
  }

  const id = randomUUID();
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(filePath(id)!, Buffer.from(await file.arrayBuffer()));
  const meta: StoredUploadMeta = { type: file.type, name: file.name };
  await writeFile(metaPath(id)!, JSON.stringify(meta));

  const url = `/api/mock-upload/${id}`;
  return Response.json(params.get("shape") === "nested" ? { data: { link: url } } : { url });
}
