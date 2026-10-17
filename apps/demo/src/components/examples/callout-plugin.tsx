import { createReactBlockSpec, definePlugin, ToolbarButton, type AnyEditor } from "genesis-editor";
import { LightbulbIcon } from "lucide-react";

import "./callout-plugin.css";

const tones = { info: "💡", warning: "⚠️", success: "✅" } as const;
type Tone = keyof typeof tones;
const nextTone: Record<Tone, Tone> = { info: "warning", warning: "success", success: "info" };

const createCallout = createReactBlockSpec(
  {
    type: "callout",
    propSchema: { tone: { default: "info", values: ["info", "warning", "success"] } },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const tone = block.props.tone as Tone;
      return (
        <div className="callout" data-tone={tone}>
          <button
            type="button"
            className="callout-icon"
            contentEditable={false}
            aria-label={`Callout tone: ${tone}. Click to change.`}
            onClick={() => editor.updateBlock(block, { props: { tone: nextTone[tone] } })}
          >
            {tones[tone]}
          </button>
          <div className="callout-content" ref={contentRef} />
        </div>
      );
    },
  },
);

const currentBlockType = (editor: AnyEditor) => editor.getTextCursorPosition().block.type;

function CalloutToolbarButton() {
  return (
    <ToolbarButton
      label="Callout"
      icon={<LightbulbIcon size={16} />}
      isSelected={(editor) => currentBlockType(editor) === "callout"}
      onClick={(editor) => {
        const block = editor.getTextCursorPosition().block;
        editor.updateBlock(block, { type: currentBlockType(editor) === "callout" ? "paragraph" : "callout" });
      }}
    />
  );
}

export const calloutPlugin = definePlugin({
  name: "callout",
  blocks: { callout: createCallout() },
  slashItems: [
    {
      key: "callout",
      title: "Callout",
      subtext: "Highlight a tip or a warning",
      aliases: ["note", "tip", "warning"],
      group: "Basic blocks",
      icon: <LightbulbIcon size={18} />,
      block: { type: "callout" },
    },
  ],
  // Type "!> " at the start of a line.
  markdownShortcuts: [{ find: /^!>\s$/, block: { type: "callout" } }],
  toolbarItems: { callout: CalloutToolbarButton },
});
