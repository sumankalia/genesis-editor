import type { ComponentType, ReactNode } from "react";
/* eslint-disable @typescript-eslint/no-explicit-any -- plugins extend the schema, so editor and spec types are open here */
import type {
  BlockNoteEditor,
  BlockSpec,
  ExtensionFactoryInstance,
  InlineContentSpec,
  LooseBlockSpec,
  PartialBlock,
  StyleSpec,
} from "@blocknote/core";

export type AnyEditor = BlockNoteEditor<any, any, any>;
export type AnyPartialBlock = PartialBlock<any, any, any>;
export type AnyBlockSpec = BlockSpec<any, any, any> | LooseBlockSpec<any, any, any>;

/** An entry in the slash menu and the "+" menu. */
export type SlashMenuItem = {
  /** Unique within the plugin. */
  key: string;
  title: string;
  subtext?: string;
  /** Extra search terms. */
  aliases?: string[];
  /** Menu section. Items without a group go under "Other". */
  group?: string;
  icon?: ReactNode;
  /** Shortcut hint shown on the right, e.g. `"⌘⌥C"`. */
  badge?: string;
} & (
  | {
      /** Block to insert, or to turn the current empty block into. */
      block: AnyPartialBlock;
      onItemClick?: never;
    }
  | {
      onItemClick: (editor: AnyEditor) => void;
      block?: never;
    }
);

/** Turns the current block into another one when its text matches `find`, e.g. `/^!>\s$/`. */
export type MarkdownShortcut = {
  /** Matched against the text before the cursor. Anchor with `^` and end with `\s$` to trigger on space. */
  find: RegExp;
  /** The block to convert to, or a function of the match. Return `undefined` to skip. */
  block: AnyPartialBlock | ((match: RegExpMatchArray) => AnyPartialBlock | undefined);
};

/** A formatting toolbar item: a component rendered inside the toolbar. Return `null` to hide it. */
export type ToolbarItem = ComponentType;

export type GenesisPlugin = {
  /**
   * Unique name. It is also the plugin's tool name: when the `tools` prop is set, the plugin is
   * only active if `tools` includes it. A plugin named like a built-in tool replaces that tool.
   */
  name: string;
  /** Block types, from `createReactBlockSpec(...)()` or BlockNote's block specs. */
  blocks?: Record<string, AnyBlockSpec>;
  /** Text styles (marks), keyed by style name. */
  styles?: Record<string, StyleSpec<any>>;
  /** Custom inline content, keyed by type. */
  inlineContent?: Record<string, InlineContentSpec<any>>;
  /** Items added to the slash menu and the "+" menu. */
  slashItems?: SlashMenuItem[] | ((editor: AnyEditor) => SlashMenuItem[]);
  /** Formatting toolbar items, keyed by the name used in the `toolbar` prop. */
  toolbarItems?: Record<string, ToolbarItem>;
  markdownShortcuts?: MarkdownShortcut[];
  /** Keyboard shortcuts in ProseMirror notation (`"Mod-Shift-c"`). Return `true` when handled. */
  keyboardShortcuts?: Record<string, (editor: AnyEditor) => boolean>;
  /** Lower-level BlockNote extensions (`createExtension(...)`), for ProseMirror plugins and more. */
  extensions?: ExtensionFactoryInstance[];
};

/** Declares a plugin. Returns it unchanged, typed. */
export function definePlugin<const P extends GenesisPlugin>(plugin: P): P {
  if (!plugin.name) throw new Error("definePlugin: a plugin needs a name.");
  return plugin;
}
