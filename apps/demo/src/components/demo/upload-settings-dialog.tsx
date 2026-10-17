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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MOCK_UPLOAD_URL, type UploadSettings } from "@/lib/upload-settings";
import { MAX_LOCAL_UPLOAD_BYTES } from "genesis-editor";

type UploadSettingsDialogProps = {
  open: boolean;
  settings: UploadSettings;
  onOpenChange: (open: boolean) => void;
  onSave: (settings: UploadSettings) => void;
};

export function UploadSettingsDialog({
  open,
  settings,
  onOpenChange,
  onSave,
}: UploadSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <SettingsForm
            initial={settings}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: UploadSettings;
  onCancel: () => void;
  onSave: (settings: UploadSettings) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const serverMode = draft.mode === "server";
  const urlMissing = serverMode && !draft.uploadUrl.trim();

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (urlMissing) return;
        onSave({
          ...draft,
          uploadUrl: draft.uploadUrl.trim(),
          responsePath: draft.responsePath.trim(),
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Image uploads</DialogTitle>
        <DialogDescription>
          Choose where images uploaded from your device are stored. Images added
          by link are never uploaded.
        </DialogDescription>
      </DialogHeader>

      <RadioGroup
        value={draft.mode}
        onValueChange={(mode) =>
          setDraft((current) => ({ ...current, mode: mode as UploadSettings["mode"] }))
        }
        className="gap-3"
      >
        <Label
          htmlFor="upload-mode-local"
          className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-foreground/40"
        >
          <RadioGroupItem id="upload-mode-local" value="local" className="mt-0.5" />
          <span className="grid gap-1">
            <span className="font-medium">This browser</span>
            <span className="text-sm text-muted-foreground">
              No server. Images are embedded as data URLs and saved with the
              document in localStorage (up to {MAX_LOCAL_UPLOAD_BYTES / 1024 / 1024} MB each).
            </span>
          </span>
        </Label>
        <Label
          htmlFor="upload-mode-server"
          className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-foreground/40"
        >
          <RadioGroupItem id="upload-mode-server" value="server" className="mt-0.5" />
          <span className="grid gap-1">
            <span className="font-medium">Upload server</span>
            <span className="text-sm text-muted-foreground">
              POSTs the image as multipart/form-data (field <code>file</code>) and
              reads the image URL from the JSON response.
            </span>
          </span>
        </Label>
        <Label
          htmlFor="upload-mode-custom"
          className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-foreground/40"
        >
          <RadioGroupItem id="upload-mode-custom" value="custom" className="mt-0.5" />
          <span className="grid gap-1">
            <span className="font-medium">Custom function</span>
            <span className="text-sm text-muted-foreground">
              Uses an <code>uploadFile(file)</code> function that runs its own upload
              code and returns the URL. The demo version posts to the mock server.
            </span>
          </span>
        </Label>
      </RadioGroup>

      {serverMode && (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="upload-url">Upload URL</Label>
            <Input
              id="upload-url"
              placeholder="https://example.com/upload"
              value={draft.uploadUrl}
              aria-invalid={urlMissing || undefined}
              onChange={(event) =>
                setDraft((current) => ({ ...current, uploadUrl: event.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Cross-origin servers must allow CORS from this page.{" "}
              <button
                type="button"
                className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                onClick={() =>
                  setDraft((current) => ({ ...current, uploadUrl: MOCK_UPLOAD_URL }))
                }
              >
                Use the built-in mock server
              </button>
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="upload-response-path">
              Response field <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="upload-response-path"
              placeholder="url"
              value={draft.responsePath}
              onChange={(event) =>
                setDraft((current) => ({ ...current, responsePath: event.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Where the URL is in the JSON response, e.g. <code>data.link</code>.
              Defaults to <code>url</code>.
            </p>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={urlMissing}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
