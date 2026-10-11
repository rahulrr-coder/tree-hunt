import { getStore } from "@/lib/db";
import { kindsFor } from "@/lib/categories";
import { json, limitIp, route } from "@/lib/http";
import { FindsQuery } from "@/lib/schemas";

// Map pins. No userId (it is a bearer token) and no thumbnails (fetched lazily per pin).
export const GET = route(async (req: Request) => {
  const { limit, kind } = FindsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const store = await getStore();
  await limitIp(store, req, "read", 120, 60);
  const finds = await store.mapFinds(limit, kindsFor(kind));
  return json({ finds: finds.map(({ _id, ...f }) => ({ id: _id, ...f })) });
});
