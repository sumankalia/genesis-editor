import type { PartialBlock } from "@blocknote/core";

export const DEFAULT_PERSIST_KEY = "genesis-editor:document";
export const DEFAULT_PERSIST_DEBOUNCE_MS = 400;

export type PersistOptions = {
  /** localStorage key. Defaults to `"genesis-editor:document"`. Use a distinct key per document. */
  key?: string;
  /** Delay after the last edit before saving, in milliseconds. Defaults to 400. */
  debounceMs?: number;
};

export type PersistStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; savedAt: number }
  | { status: "error"; error: unknown };

export type StoredDocument = {
  blocks: PartialBlock[];
  savedAt: number;
};

export function resolvePersistOptions(
  persist: boolean | PersistOptions | undefined,
): Required<PersistOptions> | null {
  if (!persist) return null;
  const options = persist === true ? {} : persist;
  return {
    key: options.key ?? DEFAULT_PERSIST_KEY,
    debounceMs: options.debounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS,
  };
}

export function loadStoredDocument(key: string): StoredDocument | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDocument;
    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredDocument(key: string, blocks: PartialBlock[]): number {
  const savedAt = Date.now();
  window.localStorage.setItem(key, JSON.stringify({ blocks, savedAt } satisfies StoredDocument));
  return savedAt;
}

export function clearStoredDocument(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode, sandboxed iframes); nothing to clear.
  }
}
