"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

function EditorSkeleton() {
  return (
    <div className="space-y-3 px-15 py-2" aria-hidden>
      <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

// The editor needs the DOM, so examples render on the client only.
const load = (loader: () => Promise<{ default: ComponentType }>) =>
  dynamic(loader, { ssr: false, loading: EditorSkeleton });

const examples = {
  minimal: load(() => import("./minimal")),
  uncontrolled: load(() => import("./uncontrolled")),
  controlled: load(() => import("./controlled")),
  persist: load(() => import("./persist")),
  "read-only": load(() => import("./read-only")),
  "ref-methods": load(() => import("./ref-methods")),
  "image-by-url": load(() => import("./image-by-url")),
  "upload-url": load(() => import("./upload-url")),
  "upload-custom": load(() => import("./upload-custom")),
  "theme-switch": load(() => import("./theme-switch")),
  "custom-theme": load(() => import("./custom-theme")),
  "tools-basic": load(() => import("./tools-basic")),
  "tools-minimal-toolbar": load(() => import("./tools-minimal-toolbar")),
  "tools-fixed-toolbar": load(() => import("./tools-fixed-toolbar")),
  "plugin-callout": load(() => import("./plugin-callout")),
  "html-value": load(() => import("./html-value")),
  "html-paste": load(() => import("./html-paste")),
  "block-meta": load(() => import("./block-meta")),
  "image-rehost": load(() => import("./image-rehost")),
  embeds: load(() => import("./embeds")),
  "embed-code": load(() => import("./embed-code")),
  colors: load(() => import("./colors")),
  "font-size": load(() => import("./font-size")),
};

export type ExampleName = keyof typeof examples;

export function ExamplePreview({ name }: { name: ExampleName }) {
  const Component = examples[name];
  return <Component />;
}
