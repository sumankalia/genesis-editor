"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckIcon,
  ClipboardCopyIcon,
  CloudAlertIcon,
  LoaderCircleIcon,
  MonitorIcon,
  MoonIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  SunIcon,
} from "lucide-react";
import type { PersistStatus } from "genesis-editor";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type EditorHeaderProps = {
  saveState: PersistStatus;
  onCopyMarkdown: () => void;
  onReset: () => void;
  menuItems?: ReactNode;
};

export function EditorHeader({
  saveState,
  onCopyMarkdown,
  onReset,
  menuItems,
}: EditorHeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-sm font-semibold text-background"
          >
            G
          </div>
          <span className="truncate text-sm font-medium">Genesis</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            / Untitled page
          </span>
        </div>

        <div className="flex items-center gap-1">
          <SaveIndicator state={saveState} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Document actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={onCopyMarkdown}>
                <ClipboardCopyIcon />
                Copy as Markdown
              </DropdownMenuItem>
              {menuItems}
              <DropdownMenuItem variant="destructive" onSelect={onReset}>
                <RotateCcwIcon />
                Reset document
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme ?? "system"}
                onValueChange={setTheme}
              >
                <DropdownMenuRadioItem value="light">
                  <SunIcon /> Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon /> Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorIcon /> System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ state }: { state: PersistStatus }) {
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
      className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
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
