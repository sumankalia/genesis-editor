import { createContext, useContext } from "react";
import {
  FormattingToolbar,
  useBlockNoteEditor,
  useComponentsContext,
  useUIMode,
} from "@blocknote/react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import type { ToolbarItem } from "../plugins/types";

export type ToolbarItems = { order: readonly string[]; items: ReadonlyMap<string, ToolbarItem> };

export const ToolbarItemsContext = createContext<ToolbarItems>({ order: [], items: new Map() });

export function GenesisFormattingToolbar() {
  const uiMode = useUIMode();
  const { order, items } = useContext(ToolbarItemsContext);

  return (
    <FormattingToolbar>
      {order.map((key) => {
        const Item = items.get(key);
        return Item ? <Item key={key} /> : null;
      })}
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
