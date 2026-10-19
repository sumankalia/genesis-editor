import { createExtension, createStyleSpec } from "@blocknote/core";
import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { cssColor, editorColor, isPaletteName, withContrast } from "../parser/colors";
import { isFontSize, stepFontSize } from "../parser/font-size";

/** Backgrounds hex text is checked against with `colorContrast="auto"`. */
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#141414";

const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(value);

/**
 * Inline styles for a hex colour: fixed across themes, plus the light/dark variants `colorContrast="auto"`
 * switches to. Palette and swatch names render through the stylesheet and get nothing here.
 */
export function hexColorStyle(kind: "text" | "background", value: unknown): Record<string, string> | undefined {
  if (!isHex(value)) return undefined;
  if (kind === "background") return { "background-color": value };
  if (value.length !== 7) return undefined;
  return {
    color: value,
    "--genesis-text-light": withContrast(value, LIGHT_BACKGROUND),
    "--genesis-text-dark": withContrast(value, DARK_BACKGROUND),
  };
}

const styleText = (style: Record<string, string>) =>
  Object.entries(style)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");

function colorSpan(kind: "text" | "background", value: string | undefined, external: boolean) {
  const span = document.createElement("span");
  if (external) {
    const css = value && value !== "default" ? cssColor(value, kind) : undefined;
    if (css) span.style.setProperty(kind === "text" ? "color" : "background-color", css);
  } else {
    const style = hexColorStyle(kind, value);
    if (style) {
      span.setAttribute("style", styleText(style));
      span.setAttribute(kind === "text" ? "data-genesis-hex-text" : "data-genesis-hex-background", "");
    }
  }
  return { dom: span, contentDOM: span };
}

/** A pasted span's colour as the editor stores it (§4), for HTML that reaches BlockNote's own parser. */
function parseSpanColor(element: HTMLElement, kind: "text" | "background") {
  if (element.tagName !== "SPAN") return undefined;
  const value = kind === "text" ? element.style.color : element.style.backgroundColor;
  return value ? editorColor(value, kind) : undefined;
}

/** BlockNote's `textColor` with hex values drawn inline (§4). */
export const textColorSpec = createStyleSpec(
  { type: "textColor", propSchema: "string" },
  {
    render: (value) => colorSpan("text", value, false),
    toExternalHTML: (value) => colorSpan("text", value, true),
    parse: (element) => parseSpanColor(element, "text"),
  },
);

/** BlockNote's `backgroundColor` with hex values (and `#rrggbbaa`) drawn inline (§4). */
export const backgroundColorSpec = createStyleSpec(
  { type: "backgroundColor", propSchema: "string" },
  {
    render: (value) => colorSpan("background", value, false),
    toExternalHTML: (value) => colorSpan("background", value, true),
    parse: (element) => parseSpanColor(element, "background"),
  },
);

const blockColorsKey = new PluginKey<DecorationSet>("genesisBlockHexColors");
const CELL_TYPES = new Set(["tableCell", "tableHeader"]);

function blockDecorations(doc: PMNode) {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    const target = node.type.name === "blockContainer" ? node.firstChild : CELL_TYPES.has(node.type.name) ? node : null;
    if (!target) return true;
    const attrs = target.attrs as { textColor?: unknown; backgroundColor?: unknown };
    const style = { ...hexColorStyle("text", attrs.textColor), ...hexColorStyle("background", attrs.backgroundColor) };
    if (Object.keys(style).length) {
      const marker: Record<string, string> = {};
      if (isHex(attrs.textColor)) marker["data-genesis-hex-text"] = "";
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: styleText(style), ...marker }));
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Block and table-cell colours that are hex: BlockNote marks them with `data-text-color` /
 * `data-background-color`, which the stylesheet only knows for palette names, so they're drawn inline.
 */
export const blockHexColorsExtension = createExtension({
  key: "genesisBlockHexColors",
  prosemirrorPlugins: [
    new Plugin<DecorationSet>({
      key: blockColorsKey,
      state: {
        init: (_, state) => blockDecorations(state.doc),
        apply: (tr, previous) => (tr.docChanged ? blockDecorations(tr.doc) : previous),
      },
      props: {
        decorations: (state) => blockColorsKey.getState(state),
      },
    }),
  ],
});

/** Stylesheet for brand swatches inside one editor (`[data-genesis-id]`): they're stored by name like palette colours. */
export function swatchCss(scope: string, swatches: readonly { name: string; hex: string }[]) {
  return swatches
    .filter((s) => !isPaletteName(s.name))
    .map(
      ({ name, hex }) =>
        `[data-genesis-id="${scope}"] [data-style-type="textColor"][data-value="${name}"],[data-genesis-id="${scope}"] [data-text-color="${name}"]{color:${hex}}` +
        `[data-genesis-id="${scope}"] [data-style-type="backgroundColor"][data-value="${name}"],[data-genesis-id="${scope}"] [data-background-color="${name}"]{background-color:${hex}}`,
    )
    .join("\n");
}

/** Block content types whose text takes no font size (§5). Headings keep imported sizes. */
const UNSIZED_BLOCKS = new Set(["codeBlock"]);

/**
 * The font sizes in the selection (`undefined` = default), or `null` when it touches a code
 * block. An empty selection gives the size typing would use.
 */
export function selectionFontSizes(state: EditorState): (string | undefined)[] | null {
  const type = state.schema.marks.fontSize;
  if (!type) return null;
  const { from, to, empty, $from } = state.selection;
  let unsized = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isTextblock && UNSIZED_BLOCKS.has(node.type.name)) unsized = true;
    return !unsized;
  });
  if (unsized || ($from.parent.isTextblock && UNSIZED_BLOCKS.has($from.parent.type.name))) return null;
  const sizeOf = (marks: readonly { type: unknown; attrs: Record<string, unknown> }[]) => {
    const value = marks.find((m) => m.type === type)?.attrs.stringValue;
    return isFontSize(value) ? value : undefined;
  };
  if (empty) return [sizeOf(state.storedMarks ?? $from.marks())];
  const sizes = new Set<string | undefined>();
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) sizes.add(sizeOf(node.marks));
  });
  return sizes.size ? [...sizes] : [undefined];
}

/** Sets (or, for the default, removes) the font size on the selection. */
export function setFontSize(state: EditorState, size: string | undefined): Transaction | null {
  const type = state.schema.marks.fontSize;
  if (!type || selectionFontSizes(state) === null) return null;
  const { from, to, empty } = state.selection;
  const tr = state.tr;
  if (empty) {
    tr.removeStoredMark(type);
    if (size) tr.addStoredMark(type.create({ stringValue: size }));
    return tr;
  }
  tr.removeMark(from, to, type);
  if (size) tr.addMark(from, to, type.create({ stringValue: size }));
  return tr;
}

const fontSizeKeysKey = new PluginKey("genesisFontSizeKeys");

/** `Mod+Shift+.` / `Mod+Shift+,` step the selection's size up and down (§5). */
export const fontSizeKeysExtension = createExtension({
  key: "genesisFontSizeKeys",
  prosemirrorPlugins: [
    new Plugin({
      key: fontSizeKeysKey,
      props: {
        handleKeyDown(view, event) {
          if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return false;
          const direction = event.code === "Period" ? 1 : event.code === "Comma" ? -1 : 0;
          if (!direction) return false;
          const sizes = selectionFontSizes(view.state);
          if (!sizes) return false;
          const tr = setFontSize(view.state, stepFontSize(sizes[0], direction));
          if (!tr) return false;
          view.dispatch(tr);
          event.preventDefault();
          return true;
        },
      },
    }),
  ],
});

function sizedSpan(value: string | undefined, external: boolean) {
  const span = document.createElement("span");
  if (isFontSize(value)) {
    span.style.fontSize = value;
    if (external) span.dataset.fontSize = value;
  }
  return { dom: span, contentDOM: span };
}

/** `fontSize` (§5): one of the steps other than 16, e.g. `"14px"`. Other values render at the default size. */
export const fontSizeSpec = createStyleSpec(
  { type: "fontSize", propSchema: "string" },
  {
    render: (value) => sizedSpan(value, false),
    toExternalHTML: (value) => sizedSpan(value, true),
    parse: (element) => {
      const value = element.dataset.fontSize;
      return element.tagName === "SPAN" && isFontSize(value) ? value : undefined;
    },
  },
);
