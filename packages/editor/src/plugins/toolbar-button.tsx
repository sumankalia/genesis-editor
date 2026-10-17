import type { ReactNode } from "react";
import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";

import type { AnyEditor } from "./types";

export type ToolbarButtonProps = {
  /** Accessible name and tooltip. */
  label: string;
  icon: ReactNode;
  onClick: (editor: AnyEditor) => void;
  /** Shows the button as pressed, e.g. while the selection already has the style. */
  isSelected?: (editor: AnyEditor) => boolean;
  /** Hides the button for selections it doesn't apply to. */
  isVisible?: (editor: AnyEditor) => boolean;
};

/** A formatting toolbar button for plugins, styled like the built-in ones. */
export function ToolbarButton({ label, icon, onClick, isSelected, isVisible }: ToolbarButtonProps) {
  const editor = useBlockNoteEditor() as AnyEditor;
  const Components = useComponentsContext()!;
  const visible = useEditorState({
    editor,
    selector: ({ editor: current }) => (isVisible ? isVisible(current as AnyEditor) : true),
  });
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }) => (isSelected ? isSelected(current as AnyEditor) : false),
  });
  if (!visible) return null;

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label={label}
      mainTooltip={label}
      icon={icon}
      isSelected={selected}
      onClick={() => {
        editor.focus();
        onClick(editor);
      }}
    />
  );
}
