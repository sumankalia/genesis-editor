"use client";

import type { ReactNode } from "react";

import { HighlightedCode } from "@/components/site/highlighted-code";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Source = { file: string; code: string; html: string };

export function ExampleTabs({
  name,
  sources,
  preview,
  minHeight = 220,
}: {
  name: string;
  sources: Source[];
  preview: ReactNode;
  minHeight?: number;
}) {
  return (
    <Tabs defaultValue="preview" className="not-prose my-6 gap-3" data-example={name}>
      <TabsList variant="line">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="preview" forceMount className="data-[state=inactive]:hidden">
        <div
          className="example-preview rounded-xl border bg-background py-6"
          style={{ minHeight }}
        >
          {preview}
        </div>
      </TabsContent>
      {/* The example's source for the Markdown versions of the docs, which can't open the Code tab.
          Not a <template>: its text moves into template.content, which React can't hydrate. */}
      {sources.map((source) => (
        <div key={source.file} hidden data-source={source.file} data-language={source.file.split(".").pop()}>
          {source.code}
        </div>
      ))}
      <TabsContent value="code" className="flex flex-col gap-3">
        {sources.map((source) => (
          <HighlightedCode
            key={source.file}
            title={sources.length > 1 ? source.file : undefined}
            html={source.html}
            code={source.code}
            language={source.file.split(".").pop()}
          />
        ))}
      </TabsContent>
    </Tabs>
  );
}
