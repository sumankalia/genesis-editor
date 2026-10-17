"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import { DocsNavLinks } from "@/components/site/docs-nav-links";
import { GitHubIcon, NpmIcon } from "@/components/site/icons";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { mainNav, site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{site.name}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-6 px-4 pb-6">
              <nav className="flex flex-col gap-1 text-sm" aria-label="Site">
                {mainNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md px-2 py-1.5 font-medium hover:bg-muted"
                  >
                    {item.title}
                  </Link>
                ))}
              </nav>
              <DocsNavLinks onNavigate={() => setMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-md bg-foreground text-xs font-bold text-background"
          >
            G
          </span>
          {site.name}
        </Link>
        <Badge variant="secondary" className="hidden font-mono sm:inline-flex">
          v{site.version}
        </Badge>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 text-sm md:flex">
          {mainNav.map((item) => {
            const active =
              item.href === "/playground"
                ? pathname === "/playground"
                : pathname.startsWith("/docs");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground",
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon" asChild>
            <a href={site.repoUrl} target="_blank" rel="noreferrer" aria-label="GitHub repository">
              <GitHubIcon className="size-4" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href={site.npmUrl} target="_blank" rel="noreferrer" aria-label="npm package">
              <NpmIcon className="size-4" />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
