import type { Metadata } from "next";

import { PlaygroundLoader } from "@/components/playground/playground-loader";

export const metadata: Metadata = { title: "Playground" };

export default function PlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6 grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="text-sm text-muted-foreground">
          Try the props live. The document is saved to this browser, and the panel
          below shows its JSON, Markdown, HTML, and the code for your configuration.
          Paste HTML loads your own markup and reports what the engine kept.
        </p>
      </div>
      <PlaygroundLoader />
    </main>
  );
}
