"use client";

import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

async function uploadFile(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  // Your own request: auth headers, signed URLs, an SDK, ...
  const res = await fetch("/api/mock-upload?shape=nested", { method: "POST", body });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const json: { data: { link: string } } = await res.json();
  return json.data.link;
}

export default function UploadCustomExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      uploadFile={uploadFile}
      onUploadError={({ error, retry }) => {
        if (window.confirm(`${error.message}\n\nTry again?`)) void retry();
      }}
      initialContent={[{ type: "image" }]}
    />
  );
}
