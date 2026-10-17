"use client";

import dynamic from "next/dynamic";
import type { PartialBlock } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme";

const BlockEditor = dynamic(() => import("genesis-editor").then((m) => m.BlockEditor), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 px-[54px] py-2" aria-hidden>
      <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
    </div>
  ),
});

const heroContent: PartialBlock[] = [
  { type: "heading", props: { level: 2 }, content: "Try it right here" },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "This is the real editor. Type ", styles: {} },
      { type: "text", text: "/", styles: { code: true } },
      { type: "text", text: " for the block menu, select text to format it, or hover a block to drag it.", styles: {} },
    ],
  },
  { type: "checkListItem", props: { checked: true }, content: "Slash menu, drag handles, nesting" },
  { type: "checkListItem", props: { checked: true }, content: "Markdown shortcuts like # and -" },
  {
    type: "checkListItem",
    content: "Press Tab to nest this item",
    children: [{ type: "checkListItem", content: "…and Shift+Tab to lift it out" }],
  },
  { type: "quote", content: "Images upload to your server, or drop into the page." },
  { type: "paragraph" },
];

export function HeroEditor() {
  const theme = useSiteTheme();
  return <BlockEditor theme={theme} mobileToolbar={false} initialContent={heroContent} />;
}
