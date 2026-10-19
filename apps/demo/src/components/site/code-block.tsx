import { HighlightedCode } from "@/components/site/highlighted-code";
import { highlight, type CodeLanguage } from "@/lib/highlight";

export async function CodeBlock({
  code,
  lang = "tsx",
  title,
  className,
}: {
  code: string;
  lang?: CodeLanguage;
  title?: string;
  className?: string;
}) {
  const html = await highlight(code, lang);
  return <HighlightedCode html={html} code={code} title={title} language={lang} className={className} />;
}
