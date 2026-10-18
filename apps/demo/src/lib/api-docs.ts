import { cacheLife } from "next/cache";
import { join } from "node:path";

import ts from "typescript";

export type ApiMember = {
  name: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
  description: string;
};

export type ApiType = { name: string; code: string };

export type ApiDocs = {
  props: ApiMember[];
  /** Props whose types change with `format="html"`. */
  htmlProps: ApiMember[];
  handle: ApiMember[];
  /** Fields of `definePlugin({ ... })`. */
  plugin: ApiMember[];
  /** Source of the types the props refer to. */
  types: ApiType[];
  /** The `genesis-editor/parser` entry. */
  parser: { options: ApiMember[]; types: ApiType[] };
  /** Built-in tool and toolbar item names, read from the exported constants' types. */
  names: { blockTools: string[]; inlineTools: string[]; toolbar: string[] };
};

const REFERENCED_TYPES = [
  "EditorTheme",
  "PersistOptions",
  "PersistStatus",
  "UploadErrorEvent",
  "UploadResponseMapper",
  "UploadCallContext",
  "UploadHeaders",
  "RehostSource",
  "HtmlChangeInfo",
  "FidelityReport",
  "ParseMode",
  "CleanOptions",
  "CleanupSummary",
  "GenesisBlock",
  "GenesisMeta",
  "MetaOptions",
  "StoredDocument",
  "ToolSelection",
  "ToolOptions",
  "ToolbarConfig",
  "SlashMenuItem",
  "MarkdownShortcut",
  "ToolbarButtonProps",
];

const ENTRY = join(process.cwd(), "../../packages/editor/src/index.ts");
const PARSER_ENTRY = join(process.cwd(), "../../packages/editor/src/parser/index.ts");
const PARSER_TYPES = ["ToHTMLOptions", "HtmlBlock", "DropReason", "WrapperFrame", "ParseAsyncOptions"];

function describe(symbol: ts.Symbol, checker: ts.TypeChecker): ApiMember {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  const typeNode =
    declaration && (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration))
      ? declaration.type
      : undefined;
  const type = typeNode
    ? typeNode.getText().replace(/\s+/g, " ")
    : checker.typeToString(checker.getTypeOfSymbol(symbol));

  let description = ts.displayPartsToString(symbol.getDocumentationComment(checker)).replace(/\s+/g, " ");
  let defaultValue: string | null = null;
  const match = description.match(/\s*Defaults to `([^`]+)`\.?/);
  if (match) {
    defaultValue = match[1];
    description = description.replace(match[0], "").trim();
  }

  return {
    name: symbol.getName(),
    type,
    optional: (symbol.getFlags() & ts.SymbolFlags.Optional) !== 0,
    defaultValue,
    description,
  };
}

/**
 * Reads `BlockEditorProps` and `BlockEditorHandle` from the package source with the
 * TypeScript compiler, so the API reference can't drift from the exported types.
 */
export async function getApiDocs(): Promise<ApiDocs> {
  "use cache";
  cacheLife("max");
  const program = ts.createProgram([ENTRY, PARSER_ENTRY], {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2020,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const exportsOf = (entry: string) => {
    const source = program.getSourceFile(entry);
    if (!source) throw new Error(`Couldn't read ${entry}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) throw new Error(`${entry} has no exports`);
    return checker.getExportsOfModule(moduleSymbol);
  };
  const entries = { main: exportsOf(ENTRY), parser: exportsOf(PARSER_ENTRY) };

  const resolve = (name: string, entry: keyof typeof entries = "main") => {
    const exported = entries[entry].find((symbol) => symbol.getName() === name);
    if (!exported) throw new Error(`genesis-editor${entry === "main" ? "" : "/parser"} doesn't export ${name}`);
    return exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
  };
  // Props typed `never` only exist to keep the format variants apart.
  const membersOf = (name: string, entry: keyof typeof entries = "main") =>
    checker
      .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(resolve(name, entry)))
      .map((symbol) => describe(symbol, checker))
      .filter((member) => member.type !== "never");
  const sourceOf = (name: string, entry: keyof typeof entries = "main"): ApiType => {
    const declaration = resolve(name, entry).declarations?.[0];
    if (!declaration) throw new Error(`No declaration for ${name}`);
    return { name, code: `export ${declaration.getText().replace(/^export\s+/, "")}` };
  };

  const literalsOf = (name: string) =>
    [...checker.typeToString(checker.getTypeOfSymbol(resolve(name))).matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  return {
    props: membersOf("BlockEditorProps"),
    htmlProps: membersOf("HtmlFormatProps"),
    handle: membersOf("BlockEditorHandle"),
    plugin: membersOf("GenesisPlugin"),
    types: REFERENCED_TYPES.map((name) => sourceOf(name)),
    parser: {
      options: membersOf("ParseOptions", "parser"),
      types: PARSER_TYPES.map((name) => sourceOf(name, "parser")),
    },
    names: {
      blockTools: literalsOf("BLOCK_TOOLS"),
      inlineTools: literalsOf("INLINE_TOOLS"),
      toolbar: literalsOf("DEFAULT_TOOLBAR"),
    },
  };
}
