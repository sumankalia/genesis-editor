import { useEffect } from "react";
import { X } from "lucide-react";

import type { CleanupSummary } from "../parser/types";
import { Button } from "./ui";

const AUTO_HIDE_MS = 10_000;

export function describeCleanup(summary: CleanupSummary) {
  const sections = summary.sections === 1 ? "1 section" : `${summary.sections} sections`;
  const labels = summary.labels.slice(0, 3).join(", ");
  return labels ? `Removed ${sections} (${labels})` : `Removed ${sections}`;
}

type CleanupToastProps = {
  summary: CleanupSummary;
  onUndo: () => void;
  onDismiss: () => void;
};

/** Shown after a paste that removed page furniture, with a way to paste it again uncleaned. */
export function CleanupToast({ summary, onUndo, onDismiss }: CleanupToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [summary, onDismiss]);

  return (
    <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center px-4">
      <div
        role="status"
        data-testid="cleanup-toast"
        className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg"
      >
        <span>{describeCleanup(summary)}</span>
        <Button size="sm" variant="outline" onClick={onUndo}>
          Undo cleanup
        </Button>
        <Button size="icon" variant="ghost" className="size-7" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </Button>
      </div>
    </div>
  );
}
