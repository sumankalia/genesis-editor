import {
  BlockNoteSchema,
  createExtension,
  defaultInlineContentSpecs,
  insertOrUpdateBlockForSlashMenu,
  type ExtensionFactoryInstance,
} from "@blocknote/core";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { Plugin, PluginKey } from "prosemirror-state";

import type { EmbedProvider } from "../parser/embeds";
import { builtInTools, corePlugin } from "./built-in";
import { metaExtension, withMeta } from "./meta";
import {
  BUILT_IN_TOOLS,
  DEFAULT_TOOLBAR,
  type BuiltInToolbarItem,
  type ToolSelection,
} from "./tool-names";
import type { AnyEditor, AnyBlockSpec, GenesisPlugin, SlashMenuItem, ToolbarItem } from "./types";

export type { ToolSelection } from "./tool-names";

export type ToolbarItemName = BuiltInToolbarItem | (string & {});

export type ToolbarConfig =
  | readonly ToolbarItemName[]
  | {
      /** Items in order. Defaults to the built-in order followed by plugin items. */
      items?: readonly ToolbarItemName[];
      /** `"floating"` shows the toolbar over selected text; `"fixed"` pins it above the editor. Defaults to `"floating"`. */
      placement?: "floating" | "fixed";
    };

export type EditorSetup = {
  /** Active plugins, built-ins included. */
  plugins: GenesisPlugin[];
  /** Names of active tools (built-in and plugin). */
  tools: Set<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- assembled at runtime from plugins
  schema: BlockNoteSchema<any, any, any>;
  extensions: ExtensionFactoryInstance[];
  toolbarItems: Map<string, ToolbarItem>;
  /** Toolbar item names in default order: built-ins, then plugin items. */
  defaultToolbar: string[];
  /** Embed providers from plugins, in plugin order. */
  embedProviders: EmbedProvider[];
};

function isEnabled(tools: ToolSelection | undefined, name: string) {
  if (tools === undefined) return true;
  if (Array.isArray(tools)) return tools.includes(name);
  const entry = (tools as Record<string, unknown>)[name];
  return entry === true || (typeof entry === "object" && entry !== null);
}

function toolOptions(tools: ToolSelection | undefined, name: string) {
  if (!tools || Array.isArray(tools)) return undefined;
  const entry = (tools as Record<string, unknown>)[name];
  return typeof entry === "object" && entry !== null ? entry : undefined;
}

/** A stable string for the parts of `tools`/`plugins` that require a new editor when they change. */
export function setupSignature(tools: ToolSelection | undefined, plugins: readonly GenesisPlugin[] | undefined, meta = true) {
  return JSON.stringify([tools ?? null, (plugins ?? []).map((plugin) => plugin.name), meta]);
}

const noLinksKey = new PluginKey("genesis-no-links");

// BlockNote always registers the link mark, so pasted or autolinked URLs are unlinked here.
const stripLinks = createExtension({
  key: "genesis-no-links",
  prosemirrorPlugins: [
    new Plugin({
      key: noLinksKey,
      appendTransaction(transactions, _oldState, state) {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        const link = state.schema.marks.link;
        const end = state.doc.content.size;
        if (!link || !state.doc.rangeHasMark(0, end, link)) return null;
        return state.tr.removeMark(0, end, link);
      },
    }),
  ],
});

function pluginExtension(plugin: GenesisPlugin): ExtensionFactoryInstance | null {
  const inputRules = plugin.markdownShortcuts?.map((shortcut) => ({
    find: shortcut.find,
    replace: ({ match }: { match: RegExpMatchArray }) =>
      typeof shortcut.block === "function" ? shortcut.block(match) : shortcut.block,
  }));
  const keyboardShortcuts = plugin.keyboardShortcuts
    ? Object.fromEntries(
        Object.entries(plugin.keyboardShortcuts).map(([keys, run]) => [
          keys,
          ({ editor }: { editor: AnyEditor }) => run(editor),
        ]),
      )
    : undefined;
  if (!inputRules?.length && !keyboardShortcuts) return null;
  return createExtension({ key: `genesis-plugin-${plugin.name}`, inputRules, keyboardShortcuts });
}

export function resolveEditorSetup(
  tools: ToolSelection | undefined,
  userPlugins: readonly GenesisPlugin[] = [],
  /** Adds the `meta` prop to every block, plugin blocks included. `false` for `meta={{ policy: "off" }}`. */
  meta = true,
): EditorSetup {
  const seen = new Set<string>();
  for (const plugin of userPlugins) {
    if (plugin.name === "core") throw new Error('genesis-editor: the plugin name "core" is reserved.');
    if (seen.has(plugin.name)) throw new Error(`genesis-editor: two plugins are named "${plugin.name}".`);
    seen.add(plugin.name);
  }

  const plugins: GenesisPlugin[] = [corePlugin];
  for (const name of BUILT_IN_TOOLS) {
    if (seen.has(name) || !isEnabled(tools, name)) continue;
    plugins.push(builtInTools[name](toolOptions(tools, name)));
  }
  for (const plugin of userPlugins) {
    if (isEnabled(tools, plugin.name)) plugins.push(plugin);
  }

  const blockSpecs: Record<string, AnyBlockSpec> = {};
  const styleSpecs: Record<string, unknown> = {};
  const inlineContentSpecs: Record<string, unknown> = { text: defaultInlineContentSpecs.text };
  const extensions: ExtensionFactoryInstance[] = [];
  const toolbarItems = new Map<string, ToolbarItem>();

  for (const plugin of plugins) {
    Object.assign(blockSpecs, plugin.blocks);
    Object.assign(styleSpecs, plugin.styles);
    Object.assign(inlineContentSpecs, plugin.inlineContent);
    const extension = pluginExtension(plugin);
    if (extension) extensions.push(extension);
    extensions.push(...(plugin.extensions ?? []));
    for (const [key, item] of Object.entries(plugin.toolbarItems ?? {})) toolbarItems.set(key, item);
  }
  if (!("link" in inlineContentSpecs)) extensions.push(stripLinks);
  if (meta) {
    for (const [type, spec] of Object.entries(blockSpecs)) blockSpecs[type] = withMeta(spec);
    extensions.push(metaExtension);
  }

  const schema = BlockNoteSchema.create({
    blockSpecs: blockSpecs as never,
    inlineContentSpecs: inlineContentSpecs as never,
    styleSpecs: styleSpecs as never,
  }) as unknown as EditorSetup["schema"];

  const builtInKeys = new Set<string>(DEFAULT_TOOLBAR);
  const defaultToolbar = [
    ...DEFAULT_TOOLBAR.filter((key) => toolbarItems.has(key)),
    ...[...toolbarItems.keys()].filter((key) => !builtInKeys.has(key)),
  ];

  return {
    plugins,
    tools: new Set(plugins.filter((plugin) => plugin !== corePlugin).map((plugin) => plugin.name)),
    schema,
    extensions,
    toolbarItems,
    defaultToolbar,
    embedProviders: plugins.flatMap((plugin) => plugin.embeds ?? []),
  };
}

export function resolveToolbar(setup: EditorSetup, toolbar: ToolbarConfig | false | undefined) {
  if (toolbar === false) return { placement: "none" as const, items: [] };
  const config: Exclude<ToolbarConfig, readonly string[]> = Array.isArray(toolbar)
    ? { items: toolbar }
    : ((toolbar ?? {}) as Exclude<ToolbarConfig, readonly string[]>);
  const items = (config.items ?? setup.defaultToolbar).filter((key) => setup.toolbarItems.has(key));
  return { placement: config.placement ?? ("floating" as const), items };
}

function toSuggestionItem(editor: AnyEditor, item: SlashMenuItem): DefaultReactSuggestionItem {
  return {
    title: item.title,
    subtext: item.subtext,
    aliases: item.aliases,
    group: item.group ?? "Other",
    icon: item.icon as DefaultReactSuggestionItem["icon"],
    badge: item.badge,
    onItemClick: () => {
      if (item.block) insertOrUpdateBlockForSlashMenu(editor, item.block);
      else item.onItemClick(editor);
    },
  };
}

/** Built-in slash items (already limited to the schema) with plugin items merged into their groups. */
export function mergeSlashItems(
  editor: AnyEditor,
  defaults: DefaultReactSuggestionItem[],
  plugins: readonly GenesisPlugin[],
) {
  const items = [...defaults];
  for (const plugin of plugins) {
    const extra = typeof plugin.slashItems === "function" ? plugin.slashItems(editor) : (plugin.slashItems ?? []);
    for (const item of extra) {
      const suggestion = toSuggestionItem(editor, item);
      let index = -1;
      items.forEach((existing, i) => {
        if (existing.group === suggestion.group) index = i;
      });
      if (index === -1) items.push(suggestion);
      else items.splice(index + 1, 0, suggestion);
    }
  }
  return items;
}
