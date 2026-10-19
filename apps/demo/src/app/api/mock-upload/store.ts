import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Storage for the mock upload endpoints. Not suitable for production hosting.
 *
 * Locally, files go to `.uploads`. Serverless hosts (Vercel) can only write to the OS temp
 * directory, and where even that fails, uploads stay in memory. Both are per instance and
 * short-lived there, so an uploaded image can disappear after a while; that's fine for a demo.
 */
const UPLOAD_DIR = process.env.VERCEL ? path.join(tmpdir(), "genesis-uploads") : path.join(process.cwd(), ".uploads");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

const ID_PATTERN = /^[a-z0-9-]+$/;

export type StoredUploadMeta = { type: string; name: string };
type StoredUpload = { bytes: Uint8Array<ArrayBuffer>; meta: StoredUploadMeta };

const memory = new Map<string, StoredUpload>();
let memoryBytes = 0;
let diskWritable = true;

function remember(id: string, upload: StoredUpload) {
  memory.set(id, upload);
  memoryBytes += upload.bytes.byteLength;
  for (const [oldest, { bytes }] of memory) {
    if (memoryBytes <= MAX_MEMORY_BYTES || oldest === id) break;
    memory.delete(oldest);
    memoryBytes -= bytes.byteLength;
  }
}

/** Stores an upload and returns its id, served by `GET /api/mock-upload/[id]`. */
export async function saveUpload(bytes: Uint8Array<ArrayBuffer>, meta: StoredUploadMeta) {
  const id = randomUUID();
  if (diskWritable) {
    try {
      await mkdir(UPLOAD_DIR, { recursive: true });
      await writeFile(path.join(UPLOAD_DIR, id), bytes);
      await writeFile(path.join(UPLOAD_DIR, `${id}.json`), JSON.stringify(meta));
      return id;
    } catch {
      diskWritable = false;
    }
  }
  remember(id, { bytes, meta });
  return id;
}

export async function loadUpload(id: string): Promise<StoredUpload | null> {
  if (!ID_PATTERN.test(id)) return null;
  const cached = memory.get(id);
  if (cached) return cached;
  try {
    const [bytes, rawMeta] = await Promise.all([
      readFile(path.join(UPLOAD_DIR, id)),
      readFile(path.join(UPLOAD_DIR, `${id}.json`), "utf8"),
    ]);
    return { bytes: new Uint8Array(bytes), meta: JSON.parse(rawMeta) as StoredUploadMeta };
  } catch {
    return null;
  }
}
