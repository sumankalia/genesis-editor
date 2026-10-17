"use client";

import dynamic from "next/dynamic";

// The editor reads localStorage for its initial content, so it only renders in the browser.
export const EditorLoader = dynamic(() => import("@/components/demo/demo-app"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh flex-col">
      <div className="h-14 border-b border-border/60" />
      <div className="mx-auto w-full max-w-3xl space-y-4 px-6 pt-12 sm:px-[54px]">
        <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      </div>
    </div>
  ),
});
