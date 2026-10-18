import { formatKeyboardShortcut } from "@blocknote/core";
import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  usePortalElement,
  useUIMode,
} from "@blocknote/react";
import { ChevronDownIcon } from "lucide-react";

import { DEFAULT_FONT_SIZE, FONT_SIZES } from "../parser/font-size";
import { selectionFontSizes, setFontSize } from "../plugins/text-styles";
import type { AnyEditor } from "../plugins/types";

const label = (size: string | undefined) => (size ? size.replace("px", "") : "Default");

/** The selection toolbar's size dropdown (§5): 6–20 px, "Default" for 16, "—" for mixed sizes. */
export function FontSizeSelect() {
  const editor = useBlockNoteEditor() as AnyEditor;
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const uiMode = useUIMode();

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const ed = current as AnyEditor;
      if (!ed.isEditable) return undefined;
      const sizes = selectionFontSizes(ed.prosemirrorState);
      if (!sizes) return undefined;
      return { current: sizes.length === 1 ? sizes[0] ?? null : undefined };
    },
  });

  if (!state) return null;
  const mixed = state.current === undefined;
  const current = state.current ?? undefined;

  const apply = (size: string | undefined) => {
    const tr = setFontSize(editor.prosemirrorState, size);
    if (tr) editor.prosemirrorView?.dispatch(tr);
    editor.focus();
  };

  return (
    <Components.Generic.Menu.Root portalElement={portalElement} preventFocusOnOpen={uiMode === "mobile"}>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button genesis-font-size-button"
          data-test="fontSize"
          label="Font size"
          mainTooltip="Font size"
          secondaryTooltip={`${formatKeyboardShortcut("Mod+Shift+.")} / ${formatKeyboardShortcut("Mod+Shift+,")}`}
        >
          <span className="inline-flex min-w-[4.25rem] items-center justify-between gap-1 text-sm tabular-nums" data-testid="font-size-label">
            {mixed ? "—" : label(current)}
            <ChevronDownIcon className="size-3.5 opacity-60" />
          </span>
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown genesis-font-size-menu">
        {FONT_SIZES.map((px) => {
          const size = px === DEFAULT_FONT_SIZE ? undefined : `${px}px`;
          return (
            <Components.Generic.Menu.Item
              key={px}
              checked={!mixed && current === size}
              onClick={() => apply(size)}
            >
              <span className="flex w-28 items-baseline justify-between gap-3 whitespace-nowrap" data-size={px}>
                <span className="text-sm tabular-nums">{px === DEFAULT_FONT_SIZE ? "Default" : px}</span>
                <span className="text-muted-foreground" style={{ fontSize: `${px}px` }} aria-hidden>
                  Aa
                </span>
              </span>
            </Components.Generic.Menu.Item>
          );
        })}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}
