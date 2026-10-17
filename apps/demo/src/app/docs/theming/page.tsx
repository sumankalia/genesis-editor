import type { Metadata } from "next";

import { CodeBlock } from "@/components/site/code-block";
import { DocsHeader, H2 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Theming" };

const variables: [string, string][] = [
  ["--background", "Panel and button backgrounds"],
  ["--foreground", "Text in menus and panels"],
  ["--primary / --primary-foreground", "Primary buttons"],
  ["--secondary / --secondary-foreground", "Secondary buttons"],
  ["--muted / --muted-foreground", "Subtle surfaces and hint text"],
  ["--accent / --accent-foreground", "Hovered and selected menu items"],
  ["--popover / --popover-foreground", "Menus, toolbars, and panels"],
  ["--border / --input / --ring", "Borders, inputs, and focus rings"],
  ["--destructive", "Error messages"],
  ["--radius", "Corner radius of menus and buttons"],
  ["--genesis-editor-font-family", "Font, if not the page's own"],
  ["--genesis-gutter", "Left (and default right) padding that holds the side menu. 3.75rem"],
  ["--genesis-gutter-end", "Right padding, if different. Defaults to --genesis-gutter"],
];

const gutter = `.compact-editor {
  /* Keep it at least 3.25rem so the + and drag handle fit inside. */
  --genesis-gutter: 3.25rem;
  --genesis-gutter-end: 1rem;
}`;

const dark = `<BlockEditor theme={isDark ? "dark" : "light"} />`;

export default function ThemingPage() {
  return (
    <>
      <DocsHeader
        title="Theming"
        description="Light, dark, or system color schemes, your brand colors, and your font."
      />

      <H2>Color scheme</H2>
      <p>
        The <code>theme</code> prop takes <code>&quot;light&quot;</code>, <code>&quot;dark&quot;</code>,
        or <code>&quot;system&quot;</code> (the default, which follows{" "}
        <code>prefers-color-scheme</code>). The editor ignores your page&apos;s <code>.dark</code>{" "}
        class, so pass your app&apos;s theme explicitly when it has a toggle:
      </p>
      <CodeBlock code={dark} />
      <Example name="theme-switch" minHeight={160} />

      <H2>Brand colors and fonts</H2>
      <p>
        Every color comes from a CSS variable. Set them on a class you pass as{" "}
        <code>className</code>, or on <code>.genesis-editor</code> to change every editor. Add a{" "}
        <code>[data-color-scheme=&quot;dark&quot;]</code> rule for dark-mode values.
      </p>
      <Example name="custom-theme" files={["custom-theme.css"]} minHeight={160} />

      <H2>Layout and gutter</H2>
      <p>
        The editor pads its content with its own gutter, so the <code>+</code> and drag handle that
        appear on hover always sit inside the editor, in any container, without padding from your
        page. Change the width with <code>--genesis-gutter</code>, and the right side separately with{" "}
        <code>--genesis-gutter-end</code>:
      </p>
      <CodeBlock code={gutter} lang="css" />
      <p>
        Below 640px wide, the editor shows a block toolbar at the bottom of the screen instead of
        the hover menu, and the gutter shrinks to <code>1.25rem</code>. Set{" "}
        <code>mobileToolbar={"{false}"}</code> to keep the hover menu and the full gutter.
      </p>

      <H2>Variables</H2>
      <div className="not-prose my-6 overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Variable</th>
              <th className="px-4 py-2 font-medium">Used for</th>
            </tr>
          </thead>
          <tbody>
            {variables.map(([name, use]) => (
              <tr key={name} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{name}</td>
                <td className="px-4 py-2 text-muted-foreground">{use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        BlockNote&apos;s own <code>--bn-colors-*</code> variables (editor text, background,
        highlights) also apply. The stylesheet is scoped to <code>.genesis-editor</code> and uses no
        cascade layers, so your page&apos;s styles don&apos;t leak in and the editor&apos;s
        don&apos;t leak out.
      </p>
    </>
  );
}
