"use client";

import { useState } from "react";
import { BlockEditor } from "genesis-editor";

import { useSiteTheme } from "@/lib/use-site-theme"; // hide

export default function ReadOnlyExample() {
  const theme = useSiteTheme(); // hide
  const [editable, setEditable] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 px-15 text-sm">
        <input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} />
        Editable
      </label>
      <BlockEditor
        theme={theme} // hide
        mobileToolbar={false} // hide
        editable={editable}
        initialContent={[
          { type: "heading", props: { level: 3 }, content: "Release notes" },
          { type: "paragraph", content: "Read-only documents keep their formatting but hide the editing UI." },
        ]}
      />
    </div>
  );
}
