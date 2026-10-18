import { resolveColorConfig, type ColorConfig } from "./colors";
import { BUILT_IN_TOOLS, type BuiltInToolName, type ToolSelection } from "../plugins/tool-names";

const ALL_LEVELS = [1, 2, 3, 4, 5, 6];

export type ParserTools = {
  has(tool: BuiltInToolName): boolean;
  headingLevels: number[];
  colors: ColorConfig;
};

/** The parser's view of the editor's `tools`: same rules as the editor (omitted = everything on). */
export function resolveTools(tools: ToolSelection | undefined): ParserTools {
  const enabled = new Set<string>();
  let headingLevels = ALL_LEVELS;
  for (const name of BUILT_IN_TOOLS) {
    if (tools === undefined) enabled.add(name);
    else if (Array.isArray(tools)) {
      if (tools.includes(name)) enabled.add(name);
    } else {
      const entry = (tools as Record<string, unknown>)[name];
      if (entry === true || (typeof entry === "object" && entry !== null)) enabled.add(name);
    }
  }
  if (tools && !Array.isArray(tools)) {
    const levels = (tools as { heading?: { levels?: number[] } }).heading?.levels;
    if (typeof levels === "object" && levels?.length) headingLevels = [...levels].sort((a, b) => a - b);
  }
  const colors = resolveColorConfig(tools && !Array.isArray(tools) ? (tools as Record<string, unknown>).colors : undefined);
  return { has: (tool) => enabled.has(tool), headingLevels, colors };
}

/** The closest allowed heading level, preferring the lower-ranked (larger number) one on ties. */
export function nearestLevel(level: number, allowed: number[]) {
  let best = allowed[0];
  for (const candidate of allowed) {
    if (Math.abs(candidate - level) <= Math.abs(best - level)) best = candidate;
  }
  return best;
}
