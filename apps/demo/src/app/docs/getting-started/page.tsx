import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/site/code-block";
import { Callout, DocsHeader, H2 } from "@/components/site/docs";
import { Example } from "@/components/site/example";

export const metadata: Metadata = { title: "Getting started" };

const nextjs = `"use client";

import dynamic from "next/dynamic";
import "genesis-editor/style.css";

const BlockEditor = dynamic(
  () => import("genesis-editor").then((m) => m.BlockEditor),
  { ssr: false },
);

export function Editor() {
  return <BlockEditor persist />;
}`;

export default function GettingStartedPage() {
  return (
    <>
      <DocsHeader
        title="Getting started"
        description="Install the package, import its stylesheet, and render the editor."
      />

      <H2>Install</H2>
      <p>genesis-editor works with React 18 and 19. BlockNote comes with it as a dependency.</p>
      <CodeBlock lang="bash" code="npm install genesis-editor" />
      <CodeBlock lang="bash" code={"pnpm add genesis-editor\n# or\nyarn add genesis-editor"} />

      <H2>Import the stylesheet</H2>
      <p>
        Import <code>genesis-editor/style.css</code> once, for example in your app&apos;s entry file
        or root layout. It&apos;s precompiled and scoped to the editor, so you don&apos;t need
        Tailwind or shadcn/ui, and it won&apos;t restyle the rest of your page.
      </p>
      <CodeBlock lang="tsx" code={`import "genesis-editor/style.css";`} />

      <H2>Render the editor</H2>
      <p>
        With no props you get an empty document with every editing feature. Type <code>/</code> to
        open the block menu.
      </p>
      <Example name="minimal" minHeight={160} />

      <H2>Next.js and SSR</H2>
      <p>
        The editor needs the DOM. The package is marked <code>&quot;use client&quot;</code>, and in
        the Next.js App Router you load it without server rendering:
      </p>
      <CodeBlock code={nextjs} title="components/editor.tsx" />
      <Callout>
        Vite, Create React App, Remix SPA mode, and other client-rendered setups can import{" "}
        <code>BlockEditor</code> directly.
      </Callout>

      <H2>Next steps</H2>
      <ul>
        <li>
          <Link href="/docs/usage">Usage</Link>: controlled and uncontrolled content, autosave, and
          read-only mode.
        </li>
        <li>
          <Link href="/docs/image-uploads">Image uploads</Link>: send images to your server.
        </li>
        <li>
          <Link href="/playground">Playground</Link>: try every prop and copy the code.
        </li>
      </ul>
    </>
  );
}
