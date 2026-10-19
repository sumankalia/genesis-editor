import { loadUpload } from "../store";

export async function GET(_request: Request, ctx: RouteContext<"/api/mock-upload/[id]">) {
  const { id } = await ctx.params;
  const upload = await loadUpload(id);
  if (!upload) return new Response("Not found", { status: 404 });
  return new Response(upload.bytes, {
    headers: {
      "Content-Type": upload.meta.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
