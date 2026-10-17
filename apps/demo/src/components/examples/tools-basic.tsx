"use client";

import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function ToolsBasicExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      tools={{ heading: { levels: [1, 2] }, image: true }}
      initialContent={[
        { type: "heading", props: { level: 2 }, content: "Headings and images only" },
        {
          type: "paragraph",
          content: "Type / to see the menu: Heading 1, Heading 2, Image, and Paragraph. # and ## work, - and > don't.",
        },
      ]}
    />
  );
}
