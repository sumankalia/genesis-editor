"use client";

import dynamic from "next/dynamic";

// The editor reads localStorage for its initial content, so it only renders in the browser.
export const PlaygroundLoader = dynamic(() => import("@/components/playground/playground"), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-h-[60dvh] animate-pulse rounded-xl border bg-muted/30" />
      <div className="hidden h-96 animate-pulse rounded-xl border bg-muted/30 lg:block" />
    </div>
  ),
});
