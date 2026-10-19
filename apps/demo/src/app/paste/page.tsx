import type { Metadata } from "next";

import { PasteLanding } from "@/components/paste-landing";

export const metadata: Metadata = {
  title: "Paste HTML",
  description: "Paste published HTML through the genesis engine. Edit, then preview the same toHTML() a host stores.",
};

export default function PastePage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6 grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Paste HTML</h1>
        <p className="text-sm text-muted-foreground">
          Public proof of the HTML engine: paste first, read the conversion report, preview the exported
          HTML. Not a CMS. Not a Google Docs clone.
        </p>
      </div>
      <PasteLanding />
    </main>
  );
}
