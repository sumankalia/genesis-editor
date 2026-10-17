import { useSyncExternalStore } from "react";

export type UploadStatus =
  | { state: "uploading"; file: File }
  | { state: "error"; file: File; message: string };

/** Per-block upload state, so a failed upload can be retried with the same file. */
export class UploadStatusStore {
  private statuses = new Map<string, UploadStatus>();
  private listeners = new Set<() => void>();

  get(blockId: string) {
    return this.statuses.get(blockId);
  }

  set(blockId: string, status: UploadStatus) {
    this.statuses.set(blockId, status);
    this.emit();
  }

  delete(blockId: string) {
    if (this.statuses.delete(blockId)) this.emit();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export function useUploadStatus(store: UploadStatusStore, blockId: string) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(blockId),
    () => undefined,
  );
}
