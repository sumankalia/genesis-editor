import path from "node:path";

/** Local-only storage for the mock upload endpoint. Not suitable for production hosting. */
export const UPLOAD_DIR = path.join(process.cwd(), ".uploads");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ID_PATTERN = /^[a-z0-9-]+$/;

export function filePath(id: string) {
  if (!ID_PATTERN.test(id)) return null;
  return path.join(UPLOAD_DIR, id);
}

export function metaPath(id: string) {
  const file = filePath(id);
  return file && `${file}.json`;
}

export type StoredUploadMeta = { type: string; name: string };
