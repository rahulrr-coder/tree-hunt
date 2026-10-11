import { getStore } from "@/lib/db";
import { json, parseBody, route } from "@/lib/http";
import { UserBody } from "@/lib/schemas";

// No login: the returned userId is a bearer token kept in the player's localStorage.
export const POST = route(async (req: Request) => {
  const { nickname } = await parseBody(req, UserBody);
  const user = await (await getStore()).createOrGetUser(nickname);
  return json({ userId: user._id, nickname: user.nickname });
});
