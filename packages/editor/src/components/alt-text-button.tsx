import { useCallback, useState, type ChangeEvent } from "react";
import { useBlockNoteEditor, useComponentsContext, useEditorState, usePortalElement } from "@blocknote/react";
import { ImageIcon } from "lucide-react";

/** Edits an image block's `alt` from the formatting toolbar. Hidden unless the selection is one image. */
export function AltTextButton() {
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor();
  const block = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current.isEditable) return undefined;
      const selected = current.getSelection()?.blocks ?? [current.getTextCursorPosition().block];
      if (selected.length !== 1 || selected[0].type !== "image") return undefined;
      return selected[0];
    },
  });
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) editor.focus();
      setOpenState(next);
    },
    [editor],
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
          isSelected={alt.length > 0}
          onClick={() => setOpen(!open)}
        />
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content className="bn-popover-content bn-form-popover" variant="form-popover">
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
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
}
