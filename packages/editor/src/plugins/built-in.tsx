import { createHeadingBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from "@blocknote/core";
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  blockTypeSelectItems,
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileDeleteButton,
  FileDownloadButton,
  FilePreviewButton,
  FileRenameButton,
  FileReplaceButton,
  NestBlockButton,
  TableCellMergeButton,
  TextAlignButton,
  UnnestBlockButton,
  useBlockNoteEditor,
} from "@blocknote/react";
import { useMemo } from "react";

import { embedSlashItem, embedSpec } from "./embed";
import { imageSourceExtension, imageSpec, quoteSpec } from "./specs";
import { type BlockToolName, type BuiltInToolName, type HeadingLevel, type ToolOptions } from "./tool-names";
import { definePlugin, type GenesisPlugin } from "./types";

export {
  BLOCK_TOOLS,
  BUILT_IN_TOOLS,
  DEFAULT_TOOLBAR,
  INLINE_TOOLS,
  type BlockToolName,
  type BuiltInToolName,
  type BuiltInToolbarItem,
  type HeadingLevel,
  type InlineToolName,
  type ToolOptions,
} from "./tool-names";

function HeadingAwareBlockTypeSelect() {
  const editor = useBlockNoteEditor();
  const items = useMemo(() => {
    const levels = (editor.schema.blockSchema as Record<string, { propSchema: { level?: { values?: readonly number[] } } }>)
      .heading?.propSchema.level?.values;
    return blockTypeSelectItems(editor).filter(
      (item) => item.type !== "heading" || !levels || levels.includes(Number(item.props?.level)),
    );
  }, [editor]);
  return <BlockTypeSelect items={items} />;
}

function FileButtons() {
  return (
    <>
      <FileCaptionButton />
      <FileReplaceButton />
      <FileRenameButton />
      <FileDeleteButton />
      <FileDownloadButton />
      <FilePreviewButton />
    </>
  );
}

const styleButton = (style: "bold" | "italic" | "underline" | "strike" | "code") =>
  function StyleButton() {
    return <BasicTextStyleButton basicTextStyle={style} />;
  };

/** Always on: paragraphs and the toolbar items that don't belong to a single tool. */
export const corePlugin = definePlugin({
  name: "core",
  blocks: { paragraph: defaultBlockSpecs.paragraph },
  toolbarItems: {
    blockType: HeadingAwareBlockTypeSelect,
    tableMerge: TableCellMergeButton,
    file: FileButtons,
    alignLeft: () => <TextAlignButton textAlignment="left" />,
    alignCenter: () => <TextAlignButton textAlignment="center" />,
    alignRight: () => <TextAlignButton textAlignment="right" />,
    nest: NestBlockButton,
    unnest: UnnestBlockButton,
  },
});

const blockTool = (name: BlockToolName, type: keyof typeof defaultBlockSpecs) =>
  definePlugin({ name, blocks: { [type]: defaultBlockSpecs[type] } });

const styleTool = (name: "bold" | "italic" | "underline" | "strike" | "code") =>
  definePlugin({
    name,
    styles: { [name]: defaultStyleSpecs[name] },
    toolbarItems: { [name]: styleButton(name) },
  });

type ToolFactory = (options?: object) => GenesisPlugin;

export const builtInTools: Record<BuiltInToolName, ToolFactory> = {
  heading: (options?: ToolOptions["heading"]) =>
    definePlugin({
      name: "heading",
      blocks: {
        heading: options?.levels?.length
          ? createHeadingBlockSpec({ levels: [...options.levels].sort(), defaultLevel: Math.min(...options.levels) as HeadingLevel })
          : defaultBlockSpecs.heading,
      },
    }),
  bulletList: () => blockTool("bulletList", "bulletListItem"),
  numberedList: () => blockTool("numberedList", "numberedListItem"),
  checkList: () => blockTool("checkList", "checkListItem"),
  toggleList: () => blockTool("toggleList", "toggleListItem"),
  quote: () => definePlugin({ name: "quote", blocks: { quote: quoteSpec } }),
  codeBlock: () => blockTool("codeBlock", "codeBlock"),
  divider: () => blockTool("divider", "divider"),
  table: () => blockTool("table", "table"),
  image: () => definePlugin({ name: "image", blocks: { image: imageSpec }, extensions: [imageSourceExtension] }),
  video: () => blockTool("video", "video"),
  audio: () => blockTool("audio", "audio"),
  file: () => blockTool("file", "file"),
  embed: () => definePlugin({ name: "embed", blocks: { embed: embedSpec }, slashItems: [embedSlashItem] }),
  bold: () => styleTool("bold"),
  italic: () => styleTool("italic"),
  underline: () => styleTool("underline"),
  strike: () => styleTool("strike"),
  code: () => styleTool("code"),
  link: () =>
    definePlugin({
      name: "link",
      inlineContent: { link: defaultInlineContentSpecs.link },
      toolbarItems: { link: CreateLinkButton },
    }),
  colors: () =>
    definePlugin({
      name: "colors",
      styles: { textColor: defaultStyleSpecs.textColor, backgroundColor: defaultStyleSpecs.backgroundColor },
      toolbarItems: { colors: ColorStyleButton },
    }),
};
