"use client";

import { useState } from "react";
import { BlockEditor, type PartialBlock } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

const templates: Record<string, PartialBlock[]> = {
  Todo: [
    { type: "heading", props: { level: 3 }, content: "Today" },
    { type: "checkListItem", content: "Review pull requests" },
    { type: "checkListItem", content: "Reply to issues" },
  ],
  Quote: [{ type: "quote", content: "Simplicity is prerequisite for reliability." }],
};

export default function ControlledExample() {
  const theme = useSiteTheme(); // hide
  const [value, setValue] = useState<PartialBlock[]>(templates.Todo);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 px-15">
        {Object.keys(templates).map((name) => (
          <button
            key={name}
            className="rounded-md border px-2.5 py-1 text-sm hover:bg-muted"
            onClick={() => setValue(templates[name])}
          >
            Load {name}
          </button>
        ))}
      </div>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        value={value}
        onChange={(blocks) => setValue(blocks)}
      />
    </div>
  );
}
