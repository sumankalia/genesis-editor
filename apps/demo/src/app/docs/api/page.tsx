import type { Metadata } from "next";

import { CodeBlock } from "@/components/site/code-block";
import { DocsHeader, H2 } from "@/components/site/docs";
import { getApiDocs, type ApiMember } from "@/lib/api-docs";

export const metadata: Metadata = { title: "API reference" };

const otherExports: [string, string][] = [
  ["mapResponsePath(path)", "Builds a mapUploadResponse that reads a dot path such as data.link."],
  ["uploadWithConfig(config, file)", "The upload logic the editor uses, for reuse elsewhere."],
  ["getUploadMode(config)", 'Returns "custom", "server", or "local" for a config.'],
  ["loadStoredDocument(key)", "Reads a document saved by persist."],
  ["clearStoredDocument(key)", "Removes a document saved by persist."],
  ["DEFAULT_PERSIST_KEY", 'The default persist key, "genesis-editor:document".'],
  ["MAX_LOCAL_UPLOAD_BYTES", "The 2 MB limit for the data: URL fallback."],
];

function Description({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}

function MembersTable({ members, kind }: { members: ApiMember[]; kind: "prop" | "method" }) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-left text-sm" data-testid={`api-${kind}s`}>
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{kind === "prop" ? "Prop" : "Member"}</th>
            <th className="px-4 py-2 font-medium">Type</th>
            {kind === "prop" && <th className="px-4 py-2 font-medium">Default</th>}
            <th className="px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="align-top">
          {members.map((member) => (
            <tr key={member.name} className="border-b last:border-0">
              <td className="px-4 py-3 font-mono text-xs font-medium whitespace-nowrap">
                {member.name}
              </td>
              <td className="px-4 py-3">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-words">
                  {member.type}
                </code>
              </td>
              {kind === "prop" && (
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {member.defaultValue ?? "—"}
                </td>
              )}
              <td className="px-4 py-3 text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_code]:text-foreground">
                <Description text={member.description} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ApiPage() {
  const api = await getApiDocs();
  return (
    <>
      <DocsHeader
        title="API reference"
        description={
          <>
            Generated from the <code>BlockEditorProps</code> and <code>BlockEditorHandle</code>{" "}
            types in the package source, so it always matches what you install.
          </>
        }
      />

      <H2>BlockEditor props</H2>
      <p>All props are optional.</p>
      <MembersTable members={api.props} kind="prop" />

      <H2 id="ref">Ref (BlockEditorHandle)</H2>
      <p>
        Pass a <code>ref</code> to <code>&lt;BlockEditor&gt;</code> to get these members.
      </p>
      <MembersTable members={api.handle} kind="method" />

      <H2>Types</H2>
      <p>
        Every type is exported from <code>genesis-editor</code>, along with BlockNote&apos;s{" "}
        <code>Block</code>, <code>PartialBlock</code>, and <code>BlockNoteEditor</code>.
      </p>
      {api.types.map((type) => (
        <CodeBlock key={type.name} code={type.code} lang="ts" />
      ))}

      <H2>Other exports</H2>
      <div className="not-prose my-6 overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <tbody>
            {otherExports.map(([name, description]) => (
              <tr key={name} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
