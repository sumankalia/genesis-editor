/** Published-article view of `toHTML()` / `getHTML()`. No editor chrome. */

export function ArticlePreview({
  html,
  emptyLabel = "Nothing to preview. The document has no HTML yet.",
}: {
  html: string;
  emptyLabel?: string;
}) {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<p></p>") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="article-preview-empty">
        {emptyLabel}
      </p>
    );
  }
  return <article className="genesis-article" data-testid="article-preview" dangerouslySetInnerHTML={{ __html: trimmed }} />;
}
