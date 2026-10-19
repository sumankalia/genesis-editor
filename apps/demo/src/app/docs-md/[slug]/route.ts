import { connection } from "next/server";

import { docsPages, loadDocsPage, markdownHeaders } from "@/lib/llms";

/** `/docs/<page>.md` (rewritten here in next.config.ts): the Markdown version of a docs page. */
export async function GET(request: Request, ctx: RouteContext<"/docs-md/[slug]">) {
  await connection();
  const { slug } = await ctx.params;
  const href = `/docs/${slug}`;
  if (!docsPages.some((page) => page.href === href)) return new Response("Not found", { status: 404 });
  const page = await loadDocsPage(new URL(request.url).origin, href);
  return new Response(page.markdown, { headers: markdownHeaders("text/markdown") });
}
