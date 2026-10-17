import type { AnyEditor } from "./types";

function matches(accept: string, file: File) {
  if (accept.startsWith(".")) return file.name.toLowerCase().endsWith(accept.toLowerCase());
  if (accept.endsWith("/*")) return file.type.startsWith(accept.slice(0, -1));
  return file.type === accept;
}

/** Whether pasting or dropping `file` has a block to go into. BlockNote falls back to "file" blocks. */
export function acceptsFile(editor: AnyEditor, file: File) {
  const specs = editor.schema.blockSpecs as Record<
    string,
    { implementation: { meta?: { fileBlockAccept?: readonly string[] } } }
  >;
  if ("file" in specs) return true;
  return Object.values(specs).some((spec) =>
    (spec.implementation.meta?.fileBlockAccept ?? []).some((accept) => matches(accept, file)),
  );
}
