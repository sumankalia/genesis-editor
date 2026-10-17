import type { PartialBlock } from "@blocknote/core";

export const STORAGE_KEY = "genesis:document:v1";

export type StoredDocument = {
  blocks: PartialBlock[];
  savedAt: number;
};

export function loadDocument(): StoredDocument | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDocument;
    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDocument(blocks: PartialBlock[]): number {
  const savedAt = Date.now();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ blocks, savedAt } satisfies StoredDocument),
  );
  return savedAt;
}

export function clearDocument() {
  window.localStorage.removeItem(STORAGE_KEY);
}
