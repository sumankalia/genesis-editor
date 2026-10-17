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

import { definePlugin, type GenesisPlugin } from "./types";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Options for built-in tools that take any. */
export type ToolOptions = {
  heading: {
    /** Heading levels to offer. Defaults to all six; the menus show the first three. */
    levels?: HeadingLevel[];
  };
};

export const BLOCK_TOOLS = [
  "heading",
  "bulletList",
  "numberedList",
  "checkList",
  "toggleList",
  "quote",
  "codeBlock",
  "divider",
  "table",
  "image",
  "video",
  "audio",
  "file",
] as const;

export const INLINE_TOOLS = ["bold", "italic", "underline", "strike", "code", "link", "color"] as const;

/** Every built-in tool, in menu order. The default when `tools` is omitted. */
export const BUILT_IN_TOOLS = [...BLOCK_TOOLS, ...INLINE_TOOLS] as const;

export type BlockToolName = (typeof BLOCK_TOOLS)[number];
export type InlineToolName = (typeof INLINE_TOOLS)[number];
export type BuiltInToolName = (typeof BUILT_IN_TOOLS)[number];

/** Formatting toolbar items in their default order. Plugin items are appended. */
export const DEFAULT_TOOLBAR = [
  "blockType",
  "tableMerge",
  "file",
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "color",
  "nest",
  "unnest",
  "link",
] as const;

export type BuiltInToolbarItem = (typeof DEFAULT_TOOLBAR)[number];

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
  quote: () => blockTool("quote", "quote"),
  codeBlock: () => blockTool("codeBlock", "codeBlock"),
  divider: () => blockTool("divider", "divider"),
  table: () => blockTool("table", "table"),
  image: () => blockTool("image", "image"),
  video: () => blockTool("video", "video"),
  audio: () => blockTool("audio", "audio"),
  file: () => blockTool("file", "file"),
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
  color: () =>
    definePlugin({
      name: "color",
      styles: { textColor: defaultStyleSpecs.textColor, backgroundColor: defaultStyleSpecs.backgroundColor },
      toolbarItems: { color: ColorStyleButton },
    }),
};
