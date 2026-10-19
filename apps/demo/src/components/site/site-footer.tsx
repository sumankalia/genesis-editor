import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {site.name} is MIT licensed. Built on{" "}
          <a className="underline underline-offset-4 hover:text-foreground" href="https://www.blocknotejs.org/">
            BlockNote
          </a>
          .
        </p>
        <div className="flex gap-4">
          <a className="hover:text-foreground" href={site.repoUrl}>
            GitHub
          </a>
          <a className="hover:text-foreground" href={site.npmUrl}>
            npm
          </a>
          <a className="hover:text-foreground" href="/llms.txt">
            llms.txt
          </a>
        </div>
      </div>
    </footer>
  );
}
