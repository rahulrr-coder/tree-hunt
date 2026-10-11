import { getStore } from "@/lib/db";
import { json, route } from "@/lib/http";
import { FindsQuery } from "@/lib/schemas";

// Map pins. No userId (it is a bearer token) and no thumbnails (fetched lazily per pin).
export const GET = route(async (req: Request) => {
  const { limit } = FindsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const finds = await (await getStore()).mapFinds(limit);
  return json({ finds: finds.map(({ _id, ...f }) => ({ id: _id, ...f })) });
});
