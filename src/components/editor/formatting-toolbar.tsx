"use client";

import {
  BasicTextStyleButton,
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useUIMode,
} from "@blocknote/react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

export function GenesisFormattingToolbar() {
  const uiMode = useUIMode();
  const items = getFormattingToolbarItems().flatMap((item) =>
    item.key === "strikeStyleButton"
      ? [item, <BasicTextStyleButton key="codeStyleButton" basicTextStyle="code" />]
      : [item],
  );

  return (
    <FormattingToolbar>
      {items}
      {uiMode === "mobile" && <MoveBlockButtons />}
    </FormattingToolbar>
  );
}

// The pinned mobile toolbar replaces the drag handle while the keyboard is open.
function MoveBlockButtons() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;

  return (
    <>
      <Components.FormattingToolbar.Button
        className="bn-button"
        label="Move block up"
        mainTooltip="Move block up"
        icon={<ArrowUpIcon size={16} />}
        onClick={() => {
          editor.focus();
          editor.moveBlocksUp();
        }}
      />
      <Components.FormattingToolbar.Button
        className="bn-button"
        label="Move block down"
        mainTooltip="Move block down"
        icon={<ArrowDownIcon size={16} />}
        onClick={() => {
          editor.focus();
          editor.moveBlocksDown();
        }}
      />
    </>
  );
}
