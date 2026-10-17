"use client";

import { useState } from "react";
import { BlockEditor, type Block } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function UncontrolledExample() {
  const theme = useSiteTheme(); // hide
  const [blocks, setBlocks] = useState<Block[]>([]);

  return (
    <div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        initialContent={[
          { type: "heading", props: { level: 2 }, content: "Meeting notes" },
          { type: "bulletListItem", content: "Ship the uploads panel" },
          { type: "bulletListItem", content: "Write the docs" },
        ]}
        onChange={(next) => setBlocks(next)}
      />
      <p className="px-[54px] text-sm text-muted-foreground">
        {blocks.length ? `${blocks.length} blocks after your last edit` : "Edit to see onChange fire"}
      </p>
    </div>
  );
}
