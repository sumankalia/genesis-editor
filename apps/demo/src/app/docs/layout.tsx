import { DocsNavLinks } from "@/components/site/docs-nav-links";
import { DocsPager } from "@/components/site/docs-pager";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-10 px-4 sm:px-6">
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 md:block">
        <DocsNavLinks />
      </aside>
      <main className="min-w-0 flex-1 py-8 lg:py-12">
        <article className="docs-prose mx-auto max-w-3xl">{children}</article>
        <div className="mx-auto max-w-3xl">
          <DocsPager />
        </div>
      </main>
    </div>
  );
}
