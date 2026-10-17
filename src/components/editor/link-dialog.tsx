"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type LinkDialogProps = {
  open: boolean;
  initialUrl: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string) => void;
};

export function LinkDialog({
  open,
  initialUrl,
  onOpenChange,
  onSubmit,
}: LinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <LinkForm
            initialUrl={initialUrl}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  initialUrl,
  onCancel,
  onSubmit,
}: {
  initialUrl: string;
  onCancel: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = url.trim();
        if (trimmed) onSubmit(normalizeUrl(trimmed));
      }}
    >
      <DialogHeader>
        <DialogTitle>Add link</DialogTitle>
        <DialogDescription>
          Paste a URL to link the selected text.
        </DialogDescription>
      </DialogHeader>
      <Input
        autoFocus
        aria-label="URL"
        placeholder="https://example.com"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!url.trim()}>
          Apply
        </Button>
      </DialogFooter>
    </form>
  );
}

function normalizeUrl(url: string) {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("/") || url.startsWith("#")) {
    return url;
  }
  return `https://${url}`;
}
