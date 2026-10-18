import type { PartialBlock } from "@blocknote/core";

import { metaFromProps } from "../parser/meta";

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

/** The format `saveStoredDocument` writes. Version 1 (no `v`) stored the editor's own JSON, with `meta` as a prop string. */
export const STORAGE_VERSION = 2;

export type StoredDocument = {
  v: typeof STORAGE_VERSION;
  /** Public block JSON: `meta` is a top-level object on each block. */
  blocks: PartialBlock[];
  savedAt: number;
};

/**
 * Brings a parsed localStorage value to the current format, or returns `null` if it isn't a usable
 * document. A document saved by a newer version is ignored rather than misread.
 */
export function migrateStoredDocument(raw: unknown): StoredDocument | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as { v?: unknown; blocks?: unknown; savedAt?: unknown };
  if (!Array.isArray(value.blocks) || value.blocks.length === 0) return null;
  const savedAt = typeof value.savedAt === "number" ? value.savedAt : 0;
  const version = value.v ?? 1;
  if (version === 1) return { v: STORAGE_VERSION, blocks: metaFromProps(value.blocks as PartialBlock[]), savedAt };
  if (version === STORAGE_VERSION) return { v: STORAGE_VERSION, blocks: value.blocks as PartialBlock[], savedAt };
  return null;
}

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
    return migrateStoredDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Saves public block JSON (top-level `meta`), as `onChange` emits it. */
export function saveStoredDocument(key: string, blocks: PartialBlock[]): number {
  const savedAt = Date.now();
  window.localStorage.setItem(key, JSON.stringify({ v: STORAGE_VERSION, blocks, savedAt } satisfies StoredDocument));
  return savedAt;
}

export function clearStoredDocument(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode, sandboxed iframes); nothing to clear.
  }
}
