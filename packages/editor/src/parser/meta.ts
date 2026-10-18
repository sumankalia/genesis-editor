/** The `meta` schema version this build writes. Older versions are migrated when read. */
export const META_VERSION = 1;

/** A wrapper element flattened away on import (preserve mode only). */
export type WrapperFrame = { tag: string; attrs?: Record<string, string>; group?: string };

/**
 * Per-block metadata (design §16). In the public JSON it's the block's top-level `meta`; inside the
 * editor it's stored as a JSON string in the `meta` prop. Empty meta is never written.
 */
export type GenesisMeta = {
  v: typeof META_VERSION;
  /** HTML attributes kept from the source: `id`, `lang`, `dir`. */
  attrs?: Record<string, string>;
  wrappers?: WrapperFrame[];
  styles?: Record<string, string>;
  /** The source element when it isn't implied by the block type, e.g. `"cite"` for a quote attribution. */
  source?: { tag: string };
  /** Set on imported blocks when `meta.trackProvenance` is on. */
  import?: { at: string; engine: string; origin?: string };
  /** Integrator and plugin data, namespaced by plugin name. */
  ext?: Record<string, unknown>;
};

export type MetaPolicy = "keep" | "strip-on-export" | "off";

export type MetaOptions = {
  /**
   * `"keep"` (default) keeps `meta` everywhere. `"strip-on-export"` keeps it in the document and in
   * localStorage, but leaves it out of `onChange`, `getBlocks`, `getHTML` and the clipboard. `"off"`
   * never stores it.
   */
  policy?: MetaPolicy;
  /** Stamp imported blocks with `meta.import` (`at`, `engine`, `origin`). Defaults to `false`. */
  trackProvenance?: boolean;
};

export const PARSER_ENGINE = "genesis-editor/parser";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isEmptyValue(value: unknown) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return isRecord(value) && Object.keys(value).length === 0;
}

function prune(meta: Record<string, unknown>): GenesisMeta | undefined {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) if (key !== "v" && !isEmptyValue(value)) out[key] = value;
  return Object.keys(out).length ? ({ v: META_VERSION, ...out } as GenesisMeta) : undefined;
}

/**
 * Reads `meta` in any stored form (object, or the editor's JSON string) and brings it to
 * `META_VERSION`. Meta without `v` (pre-release drafts) is read as version 1. Meta from a newer
 * version is returned untouched, so it survives a round trip through an older editor.
 */
export function migrateMeta(raw: unknown): GenesisMeta | undefined {
  let value = raw;
  if (typeof value === "string") {
    if (!value) return undefined;
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(value)) return undefined;
  if (typeof value.v === "number" && value.v > META_VERSION) return value as unknown as GenesisMeta;
  return prune(value);
}

/** The editor's string form; `""` for empty meta. */
export function encodeMeta(meta: unknown): string {
  const migrated = migrateMeta(meta);
  return migrated ? JSON.stringify(migrated) : "";
}

/** Adds keys that aren't set yet. */
export function mergeMeta(meta: GenesisMeta | undefined, extra: Partial<Omit<GenesisMeta, "v">>): GenesisMeta | undefined {
  const base = migrateMeta(meta) ?? { v: META_VERSION };
  if (base.v > META_VERSION) return base;
  const attrs = extra.attrs ? { ...extra.attrs, ...base.attrs } : base.attrs;
  return prune({ ...extra, ...base, attrs });
}

/** A copy for a block derived from this one (split, duplicate): everything except `attrs.id`. */
export function metaWithoutId(meta: GenesisMeta | undefined): GenesisMeta | undefined {
  if (!meta?.attrs?.id || meta.v > META_VERSION) return meta;
  const attrs = { ...meta.attrs };
  delete attrs.id;
  return prune({ ...meta, attrs });
}

type MetaCarrier = { props?: unknown; meta?: unknown; children?: unknown };

function mapTree<T>(blocks: readonly T[], fn: (block: MetaCarrier) => MetaCarrier): T[] {
  return blocks.map((block) => {
    if (!isRecord(block)) return block;
    const next = fn(block as MetaCarrier);
    if (Array.isArray(next.children)) next.children = mapTree(next.children, fn);
    return next as T;
  });
}

function splitProps(block: MetaCarrier) {
  const props = isRecord(block.props) ? block.props : undefined;
  if (!props || !("meta" in props)) return { props, legacy: undefined };
  const { meta: legacy, ...rest } = props;
  return { props: rest, legacy };
}

/**
 * Editor JSON → public JSON: the `meta` prop string becomes the block's top-level `meta` object (or
 * is left out when empty). Also accepts blocks that already carry a top-level `meta`.
 */
export function metaFromProps<T>(blocks: readonly T[]): T[] {
  return mapTree(blocks, (block) => {
    const { props, legacy } = splitProps(block);
    const { meta: top, ...rest } = block;
    const meta = migrateMeta(top ?? legacy);
    const next: MetaCarrier = { ...rest };
    if (props) next.props = props;
    if (meta) next.meta = meta;
    return next;
  });
}

/** Public JSON → editor JSON: top-level `meta` moves into the `meta` prop as a string. */
export function metaToProps<T>(blocks: readonly T[]): T[] {
  return mapTree(blocks, (block) => {
    const { props, legacy } = splitProps(block);
    const { meta: top, ...rest } = block;
    const encoded = encodeMeta(top ?? legacy);
    const next: MetaCarrier = { ...rest };
    if (props || encoded) next.props = encoded ? { ...props, meta: encoded } : props;
    return next;
  });
}

/** Removes `meta` (top-level and the `meta` prop) from blocks and their children. */
export function stripMeta<T>(blocks: readonly T[]): T[] {
  return mapTree(blocks, (block) => {
    const { props } = splitProps(block);
    const next: MetaCarrier = { ...block };
    delete next.meta;
    if (props) next.props = props;
    return next;
  });
}

const LANG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;
// `ltr` is the default, and Google Docs writes it on every paragraph.
const DIR = /^(rtl|auto)$/i;
const ID = /^[^\s"'<>&]{1,128}$/;

/** `id`, `lang` and `dir` with values that are safe and well-formed; others are dropped. */
export function cleanMetaAttrs(get: (name: string) => string | null | undefined): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};
  const id = get("id")?.trim();
  if (id && ID.test(id)) attrs.id = id;
  const lang = get("lang")?.trim();
  if (lang && LANG.test(lang)) attrs.lang = lang;
  const dir = get("dir")?.trim().toLowerCase();
  if (dir && DIR.test(dir)) attrs.dir = dir;
  return Object.keys(attrs).length ? attrs : undefined;
}
