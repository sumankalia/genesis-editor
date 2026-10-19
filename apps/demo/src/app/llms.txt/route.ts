import { connection } from "next/server";

import { llmsIndex, loadAllDocs, markdownHeaders } from "@/lib/llms";

/** https://llmstxt.org index of the docs, with each page's own description. */
export async function GET(request: Request) {
  await connection();
  const pages = await loadAllDocs(new URL(request.url).origin);
  return new Response(llmsIndex(pages), { headers: markdownHeaders("text/plain") });
}
