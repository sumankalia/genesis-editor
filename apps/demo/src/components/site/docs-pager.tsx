"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { docsNav } from "@/lib/site";

const pages = docsNav.flatMap((section) => section.items);

export function DocsPager() {
  const pathname = usePathname();
  const index = pages.findIndex((page) => page.href === pathname);
  if (index === -1) return null;
  const previous = pages[index - 1];
  const next = pages[index + 1];

  return (
    <nav aria-label="Pagination" className="mt-16 flex justify-between gap-4 border-t pt-6 text-sm">
      {previous ? (
        <Link href={previous.href} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {previous.title}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          {next.title} <ArrowRightIcon className="size-4" />
        </Link>
      )}
    </nav>
  );
}
