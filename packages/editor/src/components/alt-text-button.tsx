import { useCallback, useState, type ChangeEvent } from "react";
import { useBlockNoteEditor, useComponentsContext, useEditorState, usePortalElement } from "@blocknote/react";
import { ImageIcon } from "lucide-react";

/** Edits an image block's `alt` from the formatting toolbar. Hidden unless the selection is one image. */
export function AltTextButton() {
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor();
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current.isEditable) return undefined;
      try {
        const blocks = current.getSelection()?.blocks ?? [current.getTextCursorPosition().block];
        if (blocks.length !== 1 || blocks[0].type !== "image") return undefined;
        return blocks[0];
      } catch {
        return undefined;
      }
    },
  });
  const [open, setOpenState] = useState(false);
  const [held, setHeld] = useState(selected);
  const block = selected ?? (open ? held : undefined);
  const setOpen = useCallback(
    (next: boolean) => {
      if (next && selected) setHeld(selected);
      if (!next) editor.focus();
      setOpenState(next);
    },
    [editor, selected],
  );
  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!block) return;
      editor.updateBlock(block.id, { props: { alt: event.currentTarget.value } });
    },
    [block, editor],
  );
  if (!block) return null;

  const alt = String((block.props as { alt?: string }).alt ?? "");
  return (
    <Components.Generic.Popover.Root open={open} onOpenChange={setOpen} portalElement={portalElement}>
      <Components.Generic.Popover.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          data-test="altText"
          label="Alt text"
          mainTooltip="Alt text"
          icon={<ImageIcon size={16} />}
          onClick={() => setOpen(!open)}
        />
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content className="bn-popover-content bn-form-popover" variant="form-popover">
        <div data-testid="image-alt-popover">
          <Components.Generic.Form.Root onSubmit={() => setOpen(false)} submitButton="none">
            <Components.Generic.Form.TextInput
              name="image-alt"
              icon={<ImageIcon size={16} />}
              value={alt}
              autoFocus={true}
              placeholder="Describe the image"
              onChange={onChange}
            />
          </Components.Generic.Form.Root>
        </div>
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
}
