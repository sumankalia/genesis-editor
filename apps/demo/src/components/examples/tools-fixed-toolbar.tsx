"use client";

import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function ToolsFixedToolbarExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      toolbar={{
        placement: "fixed",
        items: ["blockType", "bold", "italic", "underline", "code", "link"],
      }}
      initialContent={[{ type: "paragraph", content: "The toolbar stays above the editor." }]}
    />
  );
}
