import type { ReactNode } from "react";

export function DocsHeader({ title, description }: { title: string; description: ReactNode }) {
  return (
    <header className="mb-10 flex flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="text-lg text-muted-foreground">{description}</p>
    </header>
  );
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function H2({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slugify(children);
  return (
    <h2 id={anchor} className="group scroll-mt-20">
      <a href={`#${anchor}`} className="no-underline">
        {children}
        <span className="ml-2 text-muted-foreground opacity-0 group-hover:opacity-100">#</span>
      </a>
    </h2>
  );
}

export function H3({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slugify(children);
  return (
    <h3 id={anchor} className="scroll-mt-20">
      {children}
    </h3>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground [&_code]:text-foreground">
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.75rem] text-foreground shadow-[inset_0_-1px_0_var(--border)]">
      {children}
    </kbd>
  );
}
