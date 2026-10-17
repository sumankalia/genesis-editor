import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Callout, DocsHeader, H2, Kbd } from "@/components/site/docs";

export const metadata: Metadata = { title: "Keyboard shortcuts" };

const keys = (...combo: string[]) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    {combo.map((key, i) => (
      <Kbd key={i}>{key}</Kbd>
    ))}
  </span>
);

const keyboard: [string, ReactNode][] = [
  ["Open the block menu", keys("/")],
  ["Bold", keys("Mod", "B")],
  ["Italic", keys("Mod", "I")],
  ["Underline", keys("Mod", "U")],
  ["Strikethrough", keys("Mod", "Shift", "S")],
  ["Inline code", keys("Mod", "E")],
  ["Link", keys("Mod", "K")],
  ["Nest block", keys("Tab")],
  ["Lift block out", keys("Shift", "Tab")],
  ["Heading 1 to 3", keys("Mod", "Alt", "1–3")],
  ["Paragraph", keys("Mod", "Alt", "0")],
  ["Numbered list", keys("Mod", "Shift", "7")],
  ["Bullet list", keys("Mod", "Shift", "8")],
  ["To-do list", keys("Mod", "Shift", "9")],
  ["Undo", keys("Mod", "Z")],
  ["Redo", keys("Mod", "Shift", "Z")],
];

const markdown: [string, string][] = [
  ["# to ######", "Heading 1 to 6"],
  ["- or *", "Bullet list"],
  ["1.", "Numbered list"],
  ["[] or [x]", "To-do list"],
  [">", "Quote"],
  ["```", "Code block"],
  ["---", "Divider"],
  ["`code`", "Inline code"],
  ["**bold** / *italic*", "Bold / italic"],
];

function Table({ head, rows }: { head: [string, string]; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{head[0]}</th>
            <th className="px-4 py-2 font-medium">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-4 py-2.5">{a}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ShortcutsPage() {
  return (
    <>
      <DocsHeader
        title="Keyboard shortcuts"
        description="Format, restructure, and convert blocks without leaving the keyboard."
      />
      <Callout>
        <Kbd>Mod</Kbd> is <Kbd>⌘</Kbd> on macOS and <Kbd>Ctrl</Kbd> on Windows and Linux.
      </Callout>

      <H2>Keyboard</H2>
      <Table head={["Action", "Shortcut"]} rows={keyboard} />

      <H2>Markdown shortcuts</H2>
      <p>
        Type these at the start of a line, followed by a space, to convert the block. Inline ones
        apply as you close them.
      </p>
      <Table
        head={["Type", "Result"]}
        rows={markdown.map(([typed, result]) => [<code key={typed}>{typed}</code>, result])}
      />

      <H2>On touch devices</H2>
      <p>
        Phones have no hover or <Kbd>Tab</Kbd> key, so small screens get a bottom toolbar with Add
        block, Outdent, Indent, Move up, Move down, and Link. While the on-screen keyboard is open,
        the formatting toolbar is pinned above it. Turn the bottom toolbar off with{" "}
        <code>mobileToolbar=&#123;false&#125;</code>.
      </p>
    </>
  );
}
