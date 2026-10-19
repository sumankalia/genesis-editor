"use client";

import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function ImageByUrlExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      initialContent={[
        {
          type: "image",
          props: { url: "/examples/gradient.svg", alt: "A soft gradient", caption: "Added by URL", previewWidth: 420 },
        },
        { type: "paragraph", content: "Type /image to add another, then use the Link tab." },
      ]}
    />
  );
}
