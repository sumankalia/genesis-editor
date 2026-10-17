"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CloudAlertIcon, LoaderCircleIcon } from "lucide-react";
import type { PersistStatus } from "genesis-editor";

export function SaveIndicator({ state }: { state: PersistStatus }) {
  const relative = useRelativeTime(state.status === "saved" ? state.savedAt : null);

  let icon = null;
  let label = "Saved locally";
  if (state.status === "saving") {
    icon = <LoaderCircleIcon className="size-3.5 animate-spin" />;
    label = "Saving…";
  } else if (state.status === "saved") {
    icon = <CheckIcon className="size-3.5" />;
    label = `Saved ${relative}`;
  } else if (state.status === "error") {
    icon = <CloudAlertIcon className="size-3.5 text-destructive" />;
    label = "Couldn't save";
  }

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-status={state.status}
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

function useRelativeTime(timestamp: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timestamp === null) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (timestamp === null) return "";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
