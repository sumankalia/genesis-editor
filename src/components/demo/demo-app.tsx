"use client";

import { useCallback, useMemo, useState } from "react";
import { ImageUpIcon } from "lucide-react";
import { toast } from "sonner";

import BlockEditor from "@/components/editor/block-editor";
import { UploadSettingsDialog } from "@/components/demo/upload-settings-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  demoUploadFile,
  loadUploadSettings,
  saveUploadSettings,
  type UploadSettings,
} from "@/lib/upload-settings";
import { mapResponsePath } from "@/lib/uploads";

export default function DemoApp() {
  const [settings, setSettings] = useState(loadUploadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const serverMode = settings.mode === "server" && settings.uploadUrl !== "";
  const mapUploadResponse = useMemo(
    () => (settings.responsePath ? mapResponsePath(settings.responsePath) : undefined),
    [settings.responsePath],
  );
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const save = (next: UploadSettings) => {
    saveUploadSettings(next);
    setSettings(next);
    setSettingsOpen(false);
    toast.success(
      next.mode === "server"
        ? `Uploads will be sent to ${next.uploadUrl}`
        : next.mode === "custom"
          ? "Uploads will use the custom uploadFile function"
          : "Uploads will be stored in this browser",
    );
  };

  return (
    <>
      <BlockEditor
        uploadFile={settings.mode === "custom" ? demoUploadFile : undefined}
        uploadUrl={serverMode ? settings.uploadUrl : undefined}
        mapUploadResponse={serverMode ? mapUploadResponse : undefined}
        onConfigureUploads={openSettings}
        headerMenuItems={
          <DropdownMenuItem onSelect={openSettings}>
            <ImageUpIcon />
            Upload settings…
          </DropdownMenuItem>
        }
      />
      <UploadSettingsDialog
        open={settingsOpen}
        settings={settings}
        onOpenChange={setSettingsOpen}
        onSave={save}
      />
    </>
  );
}
