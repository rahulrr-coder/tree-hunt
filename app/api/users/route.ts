import { getStore } from "@/lib/db";
import { json, limitIp, parseBody, route } from "@/lib/http";
import { UserBody } from "@/lib/schemas";

// No login: the returned userId is a bearer token kept in the player's localStorage.
export const POST = route(async (req: Request) => {
  const { nickname } = await parseBody(req, UserBody);
  const store = await getStore();
  await limitIp(store, req, "users", 10, 3600, "Too many sign-ups from this network. Please try again later.");
  const user = await store.createOrGetUser(nickname);
  return json({ userId: user._id, nickname: user.nickname });
});
