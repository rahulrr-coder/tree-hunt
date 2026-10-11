import { getStore } from "@/lib/db";
import { HttpError, route } from "@/lib/http";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const thumb = await (await getStore()).thumb(id);
  if (!thumb) throw new HttpError(404, "No such photo.");
  return new Response(Buffer.from(thumb.split(",")[1] ?? "", "base64"), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
});
