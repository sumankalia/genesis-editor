import { defaultBlockSpecs } from "@blocknote/core";

import type { AnyBlockSpec } from "./types";

type PropSpec = { default: string | number | boolean } | { default: undefined; type: "string" | "number" | "boolean" };

/** Adds props to a `createBlockSpec` block; its node is built from `config.propSchema` when the schema is created. */
export function extendProps<S extends AnyBlockSpec>(spec: S, props: Record<string, PropSpec>): S {
  const config = spec.config as { propSchema: Record<string, unknown> };
  return { ...spec, config: { ...spec.config, propSchema: { ...config.propSchema, ...props } } } as S;
}

/**
 * BlockNote's quote plus `cite` (the `<blockquote cite>` source URL). Its children — further
 * paragraphs and the attribution paragraph (`meta.source.tag = "cite"`) — are drawn inside the
 * quote by the stylesheet and exported inside `<blockquote>`.
 */
export const quoteSpec = extendProps(defaultBlockSpecs.quote, {
  cite: { default: "" },
});
