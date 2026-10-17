import Link from "next/link";
import {
  ArrowRightIcon,
  GripVerticalIcon,
  ImageUpIcon,
  KeyboardIcon,
  MoonIcon,
  PackageIcon,
  SlashIcon,
} from "lucide-react";

import { CodeBlock } from "@/components/site/code-block";
import { CopyButton } from "@/components/site/copy-button";
import { HeroEditor } from "@/components/site/hero-editor";
import { GitHubIcon } from "@/components/site/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/site";

const features = [
  {
    icon: SlashIcon,
    title: "Slash menu",
    body: "Type / to insert or convert any block: headings, lists, to-dos, quotes, code, tables, images.",
  },
  {
    icon: GripVerticalIcon,
    title: "Drag and nest",
    body: "Hover to grab a block's handle and reorder it. Tab and Shift+Tab nest and lift blocks.",
  },
  {
    icon: KeyboardIcon,
    title: "Shortcuts",
    body: "Markdown shortcuts as you type, plus Mod+B, Mod+I, Mod+E for code and Mod+K for links.",
  },
  {
    icon: ImageUpIcon,
    title: "Image uploads",
    body: "Pick, drop, or paste images. Send them to your endpoint or your own upload function.",
  },
  {
    icon: MoonIcon,
    title: "Light and dark",
    body: "A theme prop, CSS variables for your brand, and the host page's font.",
  },
  {
    icon: PackageIcon,
    title: "Drop-in CSS",
    body: "One scoped stylesheet. No Tailwind or shadcn/ui setup needed in your app.",
  },
];

const usage = `import { BlockEditor } from "genesis-editor";
import "genesis-editor/style.css";

export function Notes() {
  return <BlockEditor persist uploadUrl="/api/uploads" />;
}`;

export default function HomePage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_70%)]"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:py-24">
          <div className="flex flex-col items-start gap-6">
            <Badge variant="outline" className="gap-1.5 font-mono">
              <span className="size-1.5 rounded-full bg-emerald-500" />v{site.version} · MIT · React 18 &amp; 19
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {site.name}
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              A Notion-style block editor for React. Slash menu, drag handles, nesting, Markdown
              shortcuts, and image uploads in one component.
            </p>
            <div className="flex w-full max-w-md items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-4 font-mono text-sm">
              <span className="text-muted-foreground select-none">$</span>
              <code className="flex-1 truncate" data-testid="install-command">
                {site.installCommand}
              </code>
              <CopyButton value={site.installCommand} label="Copy install command" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link href="/docs/getting-started">
                  Get started <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/playground">Playground</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href={site.repoUrl} target="_blank" rel="noreferrer">
                  <GitHubIcon className="size-4" /> GitHub
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href={site.npmUrl} target="_blank" rel="noreferrer">
                  npm
                </a>
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-background shadow-xl shadow-black/5 dark:shadow-black/40">
            <div className="flex h-10 items-center gap-1.5 border-b bg-muted/40 px-4" aria-hidden>
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="ml-3 font-mono text-xs text-muted-foreground">&lt;BlockEditor /&gt;</span>
            </div>
            <div className="min-h-[360px] py-6" data-testid="hero-editor">
              <HeroEditor />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-2 bg-background p-6">
              <Icon className="size-5 text-muted-foreground" />
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-20 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Two lines to a working editor</h2>
          <p className="text-muted-foreground">
            Import the component and its stylesheet. Add <code className="font-mono text-sm">persist</code>{" "}
            to keep the document in localStorage, and point uploads at your server.
          </p>
          <div>
            <Button asChild variant="outline">
              <Link href="/docs/usage">
                Read the usage guide <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>
        <CodeBlock code={usage} title="notes.tsx" />
      </section>
    </main>
  );
}
