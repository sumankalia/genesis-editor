"use client";

import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function ToolsMinimalToolbarExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      tools={["bulletList", "bold", "italic", "link"]}
      toolbar={["bold", "italic", "link"]}
      initialContent={[
        { type: "paragraph", content: "Select some text: the toolbar has Bold, Italic, and Link." },
        { type: "bulletListItem", content: "Underline, colors, and headings are off." },
      ]}
    />
  );
}
