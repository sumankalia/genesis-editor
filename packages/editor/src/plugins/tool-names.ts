// Tool names and option types with no runtime dependencies, shared by the editor and `genesis-editor/parser`.

import type { ColorToolOptions } from "../parser/colors";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Options for built-in tools that take any. */
export type ToolOptions = {
  heading: {
    /** Heading levels to offer. Defaults to all six; the menus show the first three. */
    levels?: HeadingLevel[];
  };
  colors: ColorToolOptions;
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
  "embed",
] as const;

export const INLINE_TOOLS = ["bold", "italic", "underline", "strike", "code", "link", "colors"] as const;

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
  "colors",
  "nest",
  "unnest",
  "link",
] as const;

export type BuiltInToolbarItem = (typeof DEFAULT_TOOLBAR)[number];

type BuiltInToolEntry = { [K in BuiltInToolName]?: K extends keyof ToolOptions ? boolean | ToolOptions[K] : boolean };

/**
 * Which tools the editor offers. An array lists the enabled tools; an object enables the keys set
 * to `true` or to an options object. Paragraphs are always on. Plugin names count as tools too.
 */
export type ToolSelection =
  | readonly (BuiltInToolName | (string & {}))[]
  | (BuiltInToolEntry & { [name: string]: boolean | object | undefined });

