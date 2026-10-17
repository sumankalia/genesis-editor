"use client";

import { useState } from "react";
import { BlockEditor, type EditorTheme } from "genesis-editor";

export default function ThemeSwitchExample() {
  const [theme, setTheme] = useState<EditorTheme>("dark");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 px-15">
        {(["light", "dark", "system"] as const).map((option) => (
          <button
            key={option}
            aria-pressed={theme === option}
            className="rounded-md border px-2.5 py-1 text-sm capitalize hover:bg-muted aria-pressed:bg-muted"
            onClick={() => setTheme(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <BlockEditor
        mobileToolbar={false} // hide
        theme={theme}
        className="rounded-lg"
        initialContent={[{ type: "paragraph", content: `The editor follows its own theme prop.` }]}
      />
    </div>
  );
}
