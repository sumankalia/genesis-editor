import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useBlockNoteEditor } from "@blocknote/react";
import { CircleAlertIcon, ImageUpIcon, LoaderCircleIcon, RotateCwIcon } from "lucide-react";

import { cn } from "../lib/cn";
import { useUploadStatus } from "../lib/upload-status";
import { MAX_LOCAL_UPLOAD_BYTES } from "../lib/uploads";
import { Button } from "./ui";
import { useUploads } from "./upload-context";

export function UploadTab({ blockId }: { blockId: string }) {
  const editor = useBlockNoteEditor();
  const { mode, statuses, uploadToBlock, retryUpload, onConfigureUploads } = useUploads();
  const status = useUploadStatus(statuses, blockId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const block = editor.getBlock(blockId);
  if (!block) return null;
  const accept =
    editor.schema.blockSpecs[block.type]?.implementation.meta?.fileBlockAccept?.join(",") ||
    "*/*";
  const noun = block.type === "image" ? "image" : "file";

  const start = (file: File | undefined) => {
    if (file) void uploadToBlock(file, blockId);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    start(event.dataTransfer.files[0]);
  };

  return (
    <div
      className="bn-tab-panel flex w-[min(28rem,calc(100vw-3rem))] flex-col gap-3 p-1"
      data-testid="upload-tab"
    >
      {status?.state === "uploading" ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground"
        >
          <LoaderCircleIcon className="size-4 shrink-0 animate-spin" />
          <span className="truncate">Uploading {status.file.name}…</span>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground transition-colors",
            dragging && "border-foreground/40 bg-muted",
          )}
        >
          <ImageUpIcon className="size-5" />
          <span>Drop an {noun} here, or</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
          >
            Choose {noun}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            data-testid="upload-input"
            onChange={(event) => {
              start(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {status?.state === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="break-words">{status.message}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => void retryUpload(blockId)}
            >
              <RotateCwIcon aria-hidden /> Retry {status.file.name}
            </Button>
          </div>
        </div>
      )}

      {mode === "local" && (
        <p className="text-xs text-muted-foreground">
          No upload server configured. Images are stored in this browser as data
          URLs (up to {MAX_LOCAL_UPLOAD_BYTES / 1024 / 1024} MB).
          {onConfigureUploads && (
            <>
              {" "}
              <button
                type="button"
                className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                onClick={onConfigureUploads}
              >
                Configure uploads
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
