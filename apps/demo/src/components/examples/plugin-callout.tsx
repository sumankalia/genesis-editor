"use client";

import { BlockEditor } from "genesis-editor";

import { calloutPlugin } from "./callout-plugin";
import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function PluginCalloutExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      plugins={[calloutPlugin]}
      initialContent={[
        { type: "callout", content: "Plugins add blocks to every menu. Click the icon to change the tone." },
        { type: "paragraph", content: 'Type /callout, or "!> " at the start of a line.' },
      ]}
    />
  );
}
