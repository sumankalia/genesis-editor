"use client";

import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function UploadUrlExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      uploadUrl="/api/mock-upload"
      initialContent={[
        { type: "paragraph", content: "Drop or paste an image here, or pick one below." },
        { type: "image" },
      ]}
    />
  );
}
