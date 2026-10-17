import type { ReactNode } from "react";
import type { BlockNoteEditor } from "@blocknote/core";
import { useVirtualKeyboard } from "@blocknote/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  LinkIcon,
  PlusIcon,
} from "lucide-react";

import { Button } from "./ui";

type MobileBlockToolbarProps = {
  editor: BlockNoteEditor;
  onAddBlock: () => void;
  onLink: () => void;
  showLink: boolean;
};

// Touch devices have no hover (drag handle) or Tab key, so block actions live here.
// While the on-screen keyboard is open, BlockNote pins its own toolbar in this spot.
export function MobileBlockToolbar({
  editor,
  onAddBlock,
  onLink,
  showLink,
}: MobileBlockToolbarProps) {
  const keyboardOpen = useVirtualKeyboard();
  if (keyboardOpen) return null;

  const run = (action: () => void) => () => {
    editor.focus();
    action();
  };

  return (
    <nav
      aria-label="Block actions"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        <ToolbarButton label="Add block" onActivate={onAddBlock}>
          <PlusIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Outdent"
          onActivate={run(() => editor.canUnnestBlock() && editor.unnestBlock())}
        >
          <IndentDecreaseIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Indent"
          onActivate={run(() => editor.canNestBlock() && editor.nestBlock())}
        >
          <IndentIncreaseIcon />
        </ToolbarButton>
        <ToolbarButton label="Move up" onActivate={run(() => editor.moveBlocksUp())}>
          <ArrowUpIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Move down"
          onActivate={run(() => editor.moveBlocksDown())}
        >
          <ArrowDownIcon />
        </ToolbarButton>
        {showLink && (
          <ToolbarButton label="Link" onActivate={onLink}>
            <LinkIcon />
          </ToolbarButton>
        )}
      </div>
    </nav>
  );
}

function ToolbarButton({
  label,
  onActivate,
  children,
}: {
  label: string;
  onActivate: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      // Keeps the editor focused so the selection and on-screen keyboard survive the tap.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onActivate}
    >
      {children}
    </Button>
  );
}
