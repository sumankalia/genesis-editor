import { connection } from "next/server";

import { llmsFull, loadAllDocs, markdownHeaders } from "@/lib/llms";

/** Every docs page as one Markdown file. */
export async function GET(request: Request) {
  await connection();
  const pages = await loadAllDocs(new URL(request.url).origin);
  return new Response(llmsFull(pages), { headers: markdownHeaders("text/plain") });
}
