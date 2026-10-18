import { useCallback, useEffect, useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ShowSelectionExtension } from "@blocknote/core/extensions";
import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtension,
  usePortalElement,
} from "@blocknote/react";
import { CheckIcon, PipetteIcon } from "lucide-react";

import { cn } from "../lib/cn";
import { PALETTE, cssColor, editorColor, type ColorConfig, type ColorSwatch, type PaletteName } from "../parser/colors";
import type { AnyEditor } from "../plugins/types";
import { Button, Input } from "./ui";

type Kind = "text" | "background";
const STYLE: Record<Kind, "textColor" | "backgroundColor"> = { text: "textColor", background: "backgroundColor" };
const RECENT_KEY = "genesis-editor:recent-colors";
const MAX_ROW = 8;

/** The last custom colours, newest first, shared by every editor on the page's origin. */
export function readRecentColors(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/.test(v)).slice(0, MAX_ROW) : [];
  } catch {
    return [];
  }
}

function rememberColor(hex: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...readRecentColors().filter((c) => c !== hex)].slice(0, MAX_ROW)));
  } catch {
    // Storage can be full or disabled; the colour is still applied.
  }
}

type InlineNode = { type?: string; styles?: Record<string, unknown>; content?: unknown };
type AnyBlock = { props?: Record<string, unknown>; content?: unknown; children?: AnyBlock[] };

/** Hex colours used in the document for `kind`, most frequent first (§4 "Document colors"). */
export function documentColors(blocks: readonly AnyBlock[], kind: Kind, limit = MAX_ROW): string[] {
  const counts = new Map<string, number>();
  const add = (value: unknown, weight = 1) => {
    if (typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(value)) counts.set(value, (counts.get(value) ?? 0) + weight);
  };
  const inline = (content: unknown) => {
    if (!Array.isArray(content)) return;
    for (const node of content as InlineNode[]) {
      if (node.type === "link") inline(node.content);
      else add(node.styles?.[STYLE[kind]], typeof (node as { text?: string }).text === "string" ? Math.max(1, (node as { text: string }).text.length) : 1);
    }
  };
  const walk = (list: readonly AnyBlock[]) => {
    for (const block of list) {
      add(block.props?.[STYLE[kind]]);
      const content = block.content as { type?: string; rows?: { cells: { props?: Record<string, unknown>; content?: unknown }[] }[] } | unknown[];
      if (Array.isArray(content)) inline(content);
      else if (content && content.type === "tableContent") {
        for (const row of content.rows ?? []) {
          for (const cell of row.cells) {
            add(cell.props?.[STYLE[kind]]);
            inline(cell.content);
          }
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([hex]) => hex);
}

const label = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

type EyeDropperWindow = Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } };

/** The colour icon in the toolbar: an "A" in the current text colour on the current highlight. */
function ColorIcon({ text, background, swatches }: { text: string; background: string; swatches: readonly ColorSwatch[] }) {
  return (
    <span
      className="bn-color-icon inline-flex size-5 items-center justify-center rounded-sm text-[15px] leading-5 font-medium"
      data-testid="color-icon"
      style={{
        color: text !== "default" ? cssColor(text, "text", swatches) : undefined,
        backgroundColor: background !== "default" ? cssColor(background, "background", swatches) : undefined,
      }}
    >
      A
    </span>
  );
}

function Swatch({
  kind,
  value,
  title,
  selected,
  swatches,
  onPick,
}: {
  kind: Kind;
  value: string;
  title: string;
  selected: boolean;
  swatches: readonly ColorSwatch[];
  onPick: (value: string) => void;
}) {
  const css = value === "default" ? undefined : cssColor(value, kind, swatches);
  return (
    <button
      type="button"
      className={cn(
        "genesis-swatch relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-sm font-medium outline-none hover:ring-2 hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "ring-2 ring-ring",
      )}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      data-color={value}
      style={kind === "text" ? { color: css } : { backgroundColor: css }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(value)}
    >
      {kind === "text" ? "A" : null}
      {selected && kind === "background" && <CheckIcon className="size-3.5 text-foreground" />}
    </button>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function CustomForm({ kind, initial, onApply, onCancel }: { kind: Kind; initial: string; onApply: (hex: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  const id = useId();
  const parsed = editorColor(value, kind, { palette: false }) ?? (/^#?[0-9a-f]{6}$/i.test(value.trim()) ? `#${value.trim().replace(/^#/, "").toLowerCase()}` : undefined);
  const hex = parsed?.startsWith("#") ? parsed.slice(0, 7) : undefined;
  const eyeDropper = typeof window !== "undefined" ? (window as EyeDropperWindow).EyeDropper : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (hex) onApply(hex);
    else setError(true);
  };

  return (
    <form className="grid gap-2" onSubmit={submit} data-testid="custom-color-form">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Custom {kind === "text" ? "text" : "background"} color
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label="Pick a color"
          className="size-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
          value={hex ?? "#000000"}
          onChange={(event) => {
            setValue(event.target.value);
            setError(false);
          }}
        />
        <Input
          id={id}
          autoFocus
          spellCheck={false}
          placeholder="#1f6feb"
          value={value}
          aria-invalid={error || undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(false);
          }}
          className="font-mono"
        />
        {eyeDropper && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Pick a color from the screen"
            title="Pick a color from the screen"
            onClick={() => {
              new eyeDropper()
                .open()
                .then((result) => {
                  setValue(result.sRGBHex.toLowerCase());
                  setError(false);
                })
                .catch(() => {});
            }}
          >
            <PipetteIcon />
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">Enter a color like #1f6feb or rgb(31, 111, 235).</p>}
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Back
        </Button>
        <Button size="sm" type="submit">
          Apply
        </Button>
      </div>
    </form>
  );
}

function Section({
  kind,
  current,
  config,
  docColors,
  recent,
  onPick,
  onCustom,
}: {
  kind: Kind;
  current: string;
  config: ColorConfig;
  docColors: string[];
  recent: string[];
  onPick: (kind: Kind, value: string) => void;
  onCustom: (kind: Kind) => void;
}) {
  const pick = (value: string) => onPick(kind, value);
  const named = [
    { value: "default", title: "Default" },
    ...(config.palette ? (Object.keys(PALETTE) as PaletteName[]).map((name) => ({ value: name, title: label(name) })) : []),
  ];
  const swatch = (value: string, title: string) => (
    <Swatch key={value} kind={kind} value={value} title={title} selected={current === value} swatches={config.swatches} onPick={pick} />
  );
  return (
    <div className="grid gap-2" data-section={kind}>
      <div className="text-xs font-medium text-foreground">{kind === "text" ? "Text" : "Background"}</div>
      <div className="flex flex-wrap gap-1">{named.map((n) => swatch(n.value, n.title))}</div>
      {config.swatches.length > 0 && <Row title="Brand">{config.swatches.map((s) => swatch(s.name, `${label(s.name)} ${s.hex}`))}</Row>}
      {config.custom && docColors.length > 0 && <Row title="Document colors">{docColors.map((hex) => swatch(hex, hex))}</Row>}
      {config.custom && recent.length > 0 && <Row title="Recent">{recent.map((hex) => swatch(hex, hex))}</Row>}
      {config.custom && (
        <Button variant="outline" size="sm" className="justify-self-start" onMouseDown={(event) => event.preventDefault()} onClick={() => onCustom(kind)}>
          Custom…
        </Button>
      )}
    </div>
  );
}

type ColorState = { textColor: string; backgroundColor: string } | undefined;

/** The toolbar's colour menu (§4): palette, brand swatches, document colours and any hex. */
export function ColorPickerButton({ config }: { config: ColorConfig }) {
  const editor = useBlockNoteEditor() as AnyEditor;
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const { showSelection } = useExtension(ShowSelectionExtension);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<Kind | null>(null);
  const [docColors, setDocColors] = useState<Record<Kind, string[]>>({ text: [], background: [] });
  const [recent, setRecent] = useState<string[]>([]);

  const state: ColorState = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const ed = current as AnyEditor;
      if (!ed.isEditable) return undefined;
      const blocks = ed.getSelection()?.blocks ?? [ed.getTextCursorPosition().block];
      if (!blocks.some((block) => block.content !== undefined)) return undefined;
      const styles = ed.getActiveStyles() as Record<string, unknown>;
      return {
        textColor: typeof styles.textColor === "string" ? styles.textColor : "default",
        backgroundColor: typeof styles.backgroundColor === "string" ? styles.backgroundColor : "default",
      };
    },
  });

  useEffect(() => {
    showSelection(open, "genesisColorPicker");
    return () => showSelection(false, "genesisColorPicker");
  }, [open, showSelection]);

  const setOpenState = useCallback(
    (next: boolean) => {
      if (next) {
        const blocks = editor.document as unknown as AnyBlock[];
        setDocColors({ text: documentColors(blocks, "text"), background: documentColors(blocks, "background") });
        setRecent(readRecentColors());
      } else {
        setCustom(null);
        editor.focus();
      }
      setOpen(next);
    },
    [editor],
  );

  const apply = useCallback(
    (kind: Kind, value: string) => {
      editor.focus();
      if (value === "default") editor.removeStyles({ [STYLE[kind]]: value } as never);
      else editor.addStyles({ [STYLE[kind]]: value } as never);
      setOpenState(false);
    },
    [editor, setOpenState],
  );

  if (!state) return null;

  return (
    <Components.Generic.Popover.Root open={open} onOpenChange={setOpenState} portalElement={portalElement}>
      <Components.Generic.Popover.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          data-test="colors"
          label="Colors"
          mainTooltip="Colors"
          icon={<ColorIcon text={state.textColor} background={state.backgroundColor} swatches={config.swatches} />}
          onClick={() => setOpenState(!open)}
        />
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content className="bn-popover-content genesis-color-picker" variant="form-popover">
        <div className="grid w-64 max-w-[calc(100vw-2rem)] gap-3 p-1 text-sm" data-testid="color-picker">
          {custom ? (
            <CustomForm
              kind={custom}
              initial={state[STYLE[custom]].startsWith("#") ? state[STYLE[custom]].slice(0, 7) : ""}
              onCancel={() => setCustom(null)}
              onApply={(hex) => {
                rememberColor(hex);
                apply(custom, hex);
              }}
            />
          ) : (
            (["text", "background"] as const).map((kind) => (
              <Section
                key={kind}
                kind={kind}
                current={state[STYLE[kind]]}
                config={config}
                docColors={docColors[kind]}
                recent={recent}
                onPick={apply}
                onCustom={setCustom}
              />
            ))
          )}
        </div>
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
}
