import { CopyButton } from "@/components/site/copy-button";
import { cn } from "@/lib/utils";

export function HighlightedCode({
  html,
  code,
  title,
  className,
}: {
  html: string;
  code: string;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "code-block group relative overflow-hidden rounded-xl border bg-muted/40 text-[0.8125rem]",
        className,
      )}
    >
      {title ? (
        <div className="flex h-10 items-center justify-between border-b px-4 font-mono text-xs text-muted-foreground">
          <span>{title}</span>
          <CopyButton value={code} />
        </div>
      ) : (
        <CopyButton value={code} className="absolute top-2 right-2 z-10" />
      )}
      <div
        className="overflow-x-auto p-4 leading-relaxed [&_pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
