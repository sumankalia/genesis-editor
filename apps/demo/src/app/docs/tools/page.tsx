import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2, H3 } from "@/components/site/docs";
import { Example } from "@/components/site/example";
import { getApiDocs } from "@/lib/api-docs";

export const metadata: Metadata = { title: "Tools & plugins" };

const arrayForm = `<BlockEditor tools={["heading", "bulletList", "image", "bold", "link"]} />`;

const objectForm = `<BlockEditor
  tools={{
    heading: { levels: [1, 2] },
    image: true,
    bold: true,
    italic: true,
  }}
/>`;

const allBut = `import { BUILT_IN_TOOLS } from "genesis-editor";

<BlockEditor tools={BUILT_IN_TOOLS.filter((tool) => tool !== "table")} />`;

const pluginShape = `import { definePlugin } from "genesis-editor";

export const myPlugin = definePlugin({
  name: "my-plugin",           // also its tool name
  blocks: { … },               // block specs, e.g. createReactBlockSpec(...)()
  slashItems: [ … ],           // entries for the / and + menus
  toolbarItems: { … },         // formatting toolbar components, by toolbar name
  markdownShortcuts: [ … ],    // { find: /^!>\\s$/, block: { type: "callout" } }
  keyboardShortcuts: { … },    // { "Mod-Shift-l": (editor) => true }
});`;

const withTools = `// With a tools list, plugins are active only when listed.
<BlockEditor tools={["heading", "callout"]} plugins={[calloutPlugin]} />`;

const toolDescriptions: Record<string, string> = {
  heading: "Headings 1–6 (menus show 1–3). Options: { levels }. Shortcuts # to ######.",
  bulletList: "Bullet lists. Shortcut - or *.",
  numberedList: "Numbered lists. Shortcut 1.",
  checkList: "To-do lists. Shortcut [] or [x].",
  toggleList: "Collapsible toggle lists.",
  quote: "Block quotes. Shortcut >.",
  codeBlock: "Code blocks. Shortcut ```.",
  divider: "Horizontal dividers. Shortcut ---.",
  table: "Tables.",
  image: "Images: by URL, upload, paste, or drop.",
  video: "Video files.",
  audio: "Audio files.",
  file: "Any file. Also catches pasted files no other block accepts.",
  bold: "Bold. Mod+B.",
  italic: "Italic. Mod+I.",
  underline: "Underline. Mod+U.",
  strike: "Strikethrough. Mod+Shift+S.",
  code: "Inline code. Mod+E.",
  link: "Links: toolbar button, Mod+K, pasted links.",
  color: "Text and background colors.",
};

export default async function ToolsPage() {
  const { names } = await getApiDocs();
  const rows = [...names.blockTools.map((name) => [name, "Block"]), ...names.inlineTools.map((name) => [name, "Inline"])];

  return (
    <>
      <DocsHeader
        title="Tools & plugins"
        description="Pick the blocks and formatting the editor offers, arrange its toolbar, and add your own blocks with plugins."
      />

      <H2>Choosing tools</H2>
      <p>
        Pass <code>tools</code> to list the tools you want. A tool that&apos;s off is gone
        everywhere: the <code>/</code> and <strong>+</strong> menus, Markdown shortcuts, keyboard
        shortcuts, the formatting toolbar, and the mobile toolbar. Pasted content it would have
        produced becomes plain paragraphs, and existing content falls back the same way when it
        loads. Paragraphs are always on. Without <code>tools</code>, every built-in tool and every
        plugin is on.
      </p>
      <CodeBlock code={arrayForm} />
      <p>The object form takes options. Keys set to an options object or <code>true</code> are on:</p>
      <CodeBlock code={objectForm} />
      <Example name="tools-basic" minHeight={180} />
      <p>To start from everything and remove a few, filter the exported list:</p>
      <CodeBlock code={allBut} />

      <H3>Built-in tools</H3>
      <div className="not-prose my-6 overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm" data-testid="tool-names">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Tool</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">What it adds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, kind]) => (
              <tr key={name} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{name}</td>
                <td className="px-4 py-2 text-muted-foreground">{kind}</td>
                <td className="px-4 py-2 text-muted-foreground">{toolDescriptions[name] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>Toolbar</H2>
      <p>
        <code>toolbar</code> picks the formatting toolbar&apos;s items and their order. Items for
        tools that are off are skipped. The default order is{" "}
        <code>{names.toolbar.join(", ")}</code>, then any plugin items.
      </p>
      <Example name="tools-minimal-toolbar" minHeight={160} />
      <p>
        Set <code>placement: &quot;fixed&quot;</code> to pin the toolbar above the editor instead of
        showing it over the selection, or pass <code>toolbar={"{false}"}</code> to turn it off.
      </p>
      <Example name="tools-fixed-toolbar" minHeight={160} />

      <H2>Plugins</H2>
      <p>
        A plugin bundles blocks, menu items, toolbar items, and shortcuts under one name. Declare it
        with <code>definePlugin</code> and pass it in <code>plugins</code>. Its blocks join the same
        menus as the built-ins, and its name works in <code>tools</code> like any built-in tool. The
        built-in tools are plugins too, so a plugin named <code>quote</code> replaces the built-in
        quote.
      </p>
      <CodeBlock code={pluginShape} />
      <p>
        This callout plugin adds a block with a tone you can click to change, a slash menu item, a{" "}
        <code>!&gt; </code> Markdown shortcut, and a toolbar button. It ships with these docs, not
        with the package.
      </p>
      <Example
        name="plugin-callout"
        files={["callout-plugin.tsx", "callout-plugin.css"]}
        minHeight={180}
      />
      <CodeBlock code={withTools} />
      <Callout>
        <code>tools</code> and the plugin names are read when the editor is created. When they
        change, the editor is rebuilt with the current document, which keeps its content but loses
        undo history. Every field of a plugin is listed in the{" "}
        <Link href="/docs/api#plugin">API reference</Link>.
      </Callout>
    </>
  );
}
