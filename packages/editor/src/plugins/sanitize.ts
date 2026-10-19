import { canonicalizeCodeLanguage, CODE_LANGUAGES } from "../parser/code-languages";
import { isFontSize } from "../parser/font-size";
import { metaToProps } from "../parser/meta";
import type { AnyPartialBlock } from "./types";

/** What the active schema supports, as plain data. */
export type SchemaSupport = {
  /** Block type → content kind ("inline", "none", "table", "plain"). */
  blocks: Record<string, string>;
  styles: Set<string>;
  links: boolean;
  /** Inline content types besides `text` and `link`, e.g. `inlineImage`. */
  inline: Set<string>;
  headingLevels: readonly number[] | null;
  /** Whether blocks have the `meta` prop (it's left out with `meta={{ policy: "off" }}`). */
  meta: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reads arbitrary BlockNote schemas
export function schemaSupport(schema: { blockSchema: any; styleSchema: any; inlineContentSchema: any }): SchemaSupport {
  const blocks: Record<string, string> = {};
  for (const [type, config] of Object.entries(schema.blockSchema as Record<string, { content: string }>)) {
    blocks[type] = config.content;
  }
  return {
    blocks,
    styles: new Set(Object.keys(schema.styleSchema)),
    links: "link" in schema.inlineContentSchema,
    inline: new Set(Object.keys(schema.inlineContentSchema).filter((type) => type !== "text" && type !== "link")),
    headingLevels:
      (schema.blockSchema.heading?.propSchema?.level?.values as readonly number[] | undefined) ?? null,
    meta: Boolean(schema.blockSchema.paragraph?.propSchema?.meta),
  };
}

type InlineNode = { type?: string; text?: string; styles?: Record<string, unknown>; content?: unknown; href?: string };

function cleanStyles(styles: Record<string, unknown> | undefined, support: SchemaSupport) {
  if (!styles) return styles;
  return Object.fromEntries(
    Object.entries(styles).filter(([name, value]) => support.styles.has(name) && (name !== "fontSize" || isFontSize(value))),
  );
}

function cleanInline(content: unknown, support: SchemaSupport): unknown {
  if (typeof content === "string" || !Array.isArray(content)) return content;
  return (content as InlineNode[]).flatMap((node): InlineNode[] => {
    if (typeof node === "string") return [node];
    if (node.type === "link") {
      const inner = cleanInline(node.content, support) as InlineNode[] | string;
      if (support.links) return [{ ...node, content: inner }];
      return typeof inner === "string" ? [{ type: "text", text: inner, styles: {} }] : inner;
    }
    if (node.type === "text" || node.type === undefined) return [{ ...node, styles: cleanStyles(node.styles, support) }];
    // Without the image tool there's no inline image node; its alt text stays.
    if (!support.inline.has(node.type)) {
      const alt = node.type === "inlineImage" ? (node as { props?: { alt?: unknown } }).props?.alt : undefined;
      return typeof alt === "string" && alt ? [{ type: "text", text: alt, styles: {} }] : [];
    }
    return [node];
  });
}

function cleanTable(content: unknown, support: SchemaSupport): unknown {
  const table = content as { rows?: { cells?: unknown[] }[] } | undefined;
  if (!table || !Array.isArray(table.rows)) return content;
  const cell = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value) && (value as { type?: string }).type === "tableCell"
      ? { ...(value as object), content: cleanInline((value as { content?: unknown }).content, support) }
      : cleanInline(value, support);
  return { ...table, rows: table.rows.map((row) => ({ ...row, cells: (row.cells ?? []).map(cell) })) };
}

function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as InlineNode[])
    .map((node) => (typeof node === "string" ? node : (node.text ?? inlineText(node.content))))
    .join("");
}

function tableRows(content: unknown): string[] {
  const rows = (content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows ?? [];
  return rows.map((row) =>
    (row.cells ?? [])
      .map((cell) => inlineText((cell as { content?: unknown })?.content ?? cell))
      .join(" | "),
  );
}

function closestLevel(level: number, levels: readonly number[]) {
  return levels.reduce((best, candidate) =>
    Math.abs(candidate - level) < Math.abs(best - level) ? candidate : best,
  );
}

/**
 * Rewrites content for a reduced schema, so it loads instead of throwing: unsupported blocks become
 * paragraphs (keeping their text and children), unsupported styles and links are dropped, and
 * headings move to the nearest allowed level.
 */
export function sanitizeBlocks(blocks: readonly AnyPartialBlock[], support: SchemaSupport): AnyPartialBlock[] {
  return blocks.flatMap((input): AnyPartialBlock[] => {
    const block = support.meta ? input : withoutMetaProp(input);
    const children = block.children ? sanitizeBlocks(block.children, support) : undefined;
    const type = block.type ?? "paragraph";
    const kind = support.blocks[type];
    const meta = (block.props as { meta?: string } | undefined)?.meta;
    const metaProps = meta ? { props: { meta } } : {};

    if (kind) {
      const next: AnyPartialBlock = { ...block, children };
      if (kind === "inline") next.content = cleanInline(block.content, support) as never;
      if (kind === "table") next.content = cleanTable(block.content, support) as never;
      if (type === "heading" && support.headingLevels?.length) {
        const level = Number((block.props as { level?: number } | undefined)?.level ?? 1);
        if (!support.headingLevels.includes(level)) {
          next.props = { ...block.props, level: closestLevel(level, support.headingLevels) } as never;
        }
      }
      if (type === "codeBlock") {
        const language = (block.props as { language?: string } | undefined)?.language;
        if (language && !(language in CODE_LANGUAGES)) {
          next.props = { ...block.props, language: canonicalizeCodeLanguage(language) ?? "text" } as never;
        }
      }
      return [next];
    }

    if (type === "columnList" || type === "column") {
      return children?.length ? children : [];
    }

    if (type === "table") {
      return [
        ...tableRows(block.content).map((text, i) => ({ type: "paragraph", content: text, ...(i ? {} : metaProps) }) as AnyPartialBlock),
        ...(children ?? []),
      ];
    }

    const props = (block.props ?? {}) as { url?: string; caption?: string; name?: string; title?: string };
    if (type === "linkPreview" && props.url && /^https?:\/\//i.test(props.url)) {
      const label = props.title || props.url;
      const content = support.links ? [{ type: "link", href: props.url, content: label }] : label;
      return [{ type: "paragraph", content: content as never, children, ...metaProps } as AnyPartialBlock];
    }
    const text = Array.isArray(block.content) || typeof block.content === "string"
      ? cleanInline(block.content, support)
      : (props.caption || props.name || props.url || "");
    if (!text && !children?.length) return [];
    return [{ type: "paragraph", content: text as never, children, ...metaProps } as AnyPartialBlock];
  });
}

function withoutMetaProp(block: AnyPartialBlock): AnyPartialBlock {
  const props = block.props as Record<string, unknown> | undefined;
  if (!props || !("meta" in props)) return block;
  const rest = { ...props };
  delete rest.meta;
  return { ...block, props: rest } as AnyPartialBlock;
}

/** Public block JSON (top-level `meta`) → blocks the editor can load. */
export function toEditorBlocks(blocks: readonly AnyPartialBlock[], support: SchemaSupport): AnyPartialBlock[] {
  return sanitizeBlocks(metaToProps(blocks), support);
}
