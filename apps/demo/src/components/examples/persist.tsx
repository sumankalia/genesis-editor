"use client";

import { useState } from "react";
import { BlockEditor, type PersistStatus } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function PersistExample() {
  const theme = useSiteTheme(); // hide
  const [status, setStatus] = useState<PersistStatus>({ status: "idle" });

  return (
    <div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        persist={{ key: "docs:persist-example", debounceMs: 300 }}
        onPersistStatusChange={setStatus}
        initialContent={[{ type: "paragraph", content: "Type here, then reload the page." }]}
      />
      <p className="px-[54px] text-sm text-muted-foreground">
        {status.status === "saved"
          ? `Saved at ${new Date(status.savedAt).toLocaleTimeString()}`
          : status.status === "saving"
            ? "Saving…"
            : "Not saved yet"}
      </p>
    </div>
  );
}
