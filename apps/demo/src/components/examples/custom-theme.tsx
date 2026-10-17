"use client";

import { BlockEditor } from "genesis-editor";

import "./custom-theme.css";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function CustomThemeExample() {
  const theme = useSiteTheme(); // hide
  return (
    <BlockEditor
      theme={theme} // hide
      mobileToolbar={false} // hide
      className="brand-editor"
      initialContent={[
        { type: "heading", props: { level: 3 }, content: "Brand colors" },
        { type: "paragraph", content: "Select text or type / to see the themed menus." },
      ]}
    />
  );
}
