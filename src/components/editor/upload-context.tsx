"use client";

import { createContext, useContext } from "react";

import type { UploadStatusStore } from "@/lib/upload-status";
import type { UploadMode } from "@/lib/uploads";

export type UploadContextValue = {
  mode: UploadMode;
  statuses: UploadStatusStore;
  uploadToBlock: (file: File, blockId: string) => Promise<void>;
  retryUpload: (blockId: string) => Promise<void>;
  onConfigureUploads?: () => void;
};

export const UploadContext = createContext<UploadContextValue | null>(null);

export function useUploads() {
  const value = useContext(UploadContext);
  if (!value) throw new Error("useUploads must be used inside UploadContext");
  return value;
}
