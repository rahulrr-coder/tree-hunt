import { getStore } from "@/lib/db";
import { HttpError, limitIp, route } from "@/lib/http";

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const store = await getStore();
  await limitIp(store, req, "thumb", 240, 60);
  const thumb = await store.thumb(id);
  if (!thumb) throw new HttpError(404, "No such photo.");
  return new Response(Buffer.from(thumb.split(",")[1] ?? "", "base64"), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
});
