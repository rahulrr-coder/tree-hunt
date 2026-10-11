# Implementation plan, tech stack and scaling

## 1. What changed from the original spec, and why

The goal was the same product with fewer moving parts. Everything below is already built.

| Spec | Built | Why |
|---|---|---|
| `openai` SDK + `@google/genai` fallback | One `fetch` to `/chat/completions` | The OpenAI-compatible protocol is spoken by Google AI Studio, OpenRouter, Groq, Together, OpenAI, Ollama and vLLM. A provider switch is 3 env vars, no code, no SDK. |
| `GEMMA_MODEL` | `MODEL_NAME` | Any model, not just Gemma. |
| `react-leaflet` + dynamic import | Plain `leaflet` in one effect | Less code and one fewer dependency. |
| Separate `/hunt`, `/hunt/[plantId]` routes | Plant detail, camera, checking and result are one bottom sheet | A single state machine instead of four screens and route plumbing. |
| `/api/me` | Folded into `/api/hunt/:cardId` | Same data, one fewer route. |
| Thumbnails inlined in `/api/finds` | `/api/finds/:id/thumb` (cached JPEG) | 200 pins x ~60 KB would be a 12 MB map response. |
| ObjectId everywhere | String UUID `_id` | No conversion at the API boundary. |
| Leaderboard by total finds | By unique plants, then total | Repeat finds count for streaks, but cannot buy the top spot. |
| Mongo required to run | In-memory store when `MONGODB_URI` is unset | Clone, add a model key, run. Production refuses to boot without Mongo. |
| `seed-dev.ts` | Dropped | The in-memory store plus the UI is enough for local testing. |

Dependencies, total: `next`, `react`, `react-dom`, `mongodb`, `zod`, `leaflet`, `lucide-react`. Dev: TypeScript,
Tailwind, Vitest, tsx.

## 1b. Update: hunt cards are generated from real sightings

The hand-written Coimbatore card is gone. Any place on Earth now gets a card:

1. The player picks "Use my location" or searches a town. Only a position rounded to ~1 km is sent.
2. The server snaps it to a ~28 km cell and checks `hunt_cards` in Mongo.
3. On a miss it asks iNaturalist for the ~30 most-sighted plants within 20 km (species with a common name), fetches
   their Wikipedia summaries and licensed photos in one compact v2 call (80 KB), and asks the model to pick 8
   beginner-friendly ones and write the clue, traits and lookalikes.
4. The model can only return ids from the candidate list. Anything else is dropped, and the card is topped up from the
   most-sighted plants. If the model fails, the card is built from sightings and summaries alone.
5. The card is saved first-writer-wins, so everyone in a cell shares one hunt (and one community).

Guardrails: 6 new areas per player per hour; at least 5 plants with a reusable photo or the area is refused;
photos shown with credit and a link; clues labelled as AI-written.

Trade-off: generated traits are less reliable than hand-written ones, so the verifier will be less sharp in obscure
places. Grounding in real sightings keeps the *species* honest; the *descriptions* are the model's.

## 2. Stack

| Layer | Choice | Swap path |
|---|---|---|
| App + API | Next.js (App Router) + TypeScript strict | API handlers are plain `Request -> Response` functions, portable to any runtime. |
| Styling | Tailwind CSS v4, tokens in `globals.css` | |
| Map | Leaflet + OpenStreetMap tiles | Any tile URL (MapTiler, self-hosted) is a one-line change in `MapView`. |
| Validation | zod, at every trust boundary (request bodies, model output) | |
| Storage | MongoDB Atlas via a 10-function `Store` interface (`lib/db.ts`) | Postgres/SQLite would implement the same interface. |
| Model | Any vision model through `lib/model.ts` | Env vars only. Ollama or vLLM for self-hosting. |
| Hosting | Render web service (`render.yaml`) | Any Node host or container. The app is stateless. |

## 3. Build order (all done except the owner steps)

1. Scaffold, config, hunt card JSON. Done.
2. `lib/streak.ts`, `lib/model.ts`, `lib/db.ts`, `lib/schemas.ts`, with unit tests (18 passing). Done.
3. API: users, hunt, verify, finds, thumb, leaderboard. Exercised with curl, including 429 rate limiting. Done.
4. UI: welcome, hunt grid, plant sheet with stamp, map, board, bottom nav. Checked at 390 px. Done.
5. MongoDB store checked against a real mongod (case-insensitive nicknames, upsert, aggregation). Done.

Owner steps still needed (they need your accounts and photos):

1. Put real values in `.env.local` (`MODEL_API_KEY`, `MODEL_NAME`, `MONGODB_URI`).
2. Add 5 to 8 photos to `scripts/samples/`, run `npm run smoke`, paste the table into `NOTES.md`. Tighten the
   `traits` in the hunt card if accuracy is poor.
3. Push to GitHub, connect Render with `render.yaml`, set the two secrets.
4. Test on a phone over HTTPS (camera and GPS require it).

## 4. Scaling: what breaks first, in order

Each row is a trigger, not a task for today.

| # | Pressure | Symptom | Fix |
|---|---|---|---|
| 1 | **Model cost and latency** (the only real variable cost) | Slow checks, quota errors | Per-user rate limit already exists. Add: cache by image hash, a smaller or cheaper model via env var, queue + polling instead of a held request, or self-host with vLLM/Ollama (code unchanged). |
| 2 | **Thumbnails stored in Mongo** | Atlas free tier (512 MB) fills at roughly 8,000 finds | Move JPEGs to object storage (R2/S3); store a URL in the find. The `/api/finds/:id/thumb` route is already the seam: redirect to the bucket. |
| 3 | **Identity is a nickname** | Anyone can type your nickname and become you | Issue a secret token per device and make nickname claims explicit, or add passkeys / magic-link login. `userId` is already the only identity the API uses, so only `/api/users` changes. |
| 4 | **Sign-up spam bypasses the per-user rate limit** | One person, many nicknames, many model calls | Per-IP limit, a bot check on `/api/users` (Turnstile), and a global daily model budget. |
| 5 | **Leaderboard aggregation scans all finds** | `/api/leaderboard` slows past ~100k finds | Maintain per-user counters on write (`$inc` in the verify route) and index them; cache the response for 30 s. |
| 6 | **Map returns the latest 200 pins globally** | Cluttered or irrelevant when there are many cities | Add a 2dsphere index and a bounding-box query; cluster pins client-side. |
| 7 | **Stale or low-quality generated cards** | A card built once never changes; odd picks stick | Add `createdAt`-based refresh (seasonal), a thumbs-down on a plant that rebuilds the card, and a reviewed flag for popular cells. Cell boundaries split towns: switch to place-based keys (iNaturalist place ids) if that bites. |
| 8 | **Cheating** | Photos of screens, spoofed GPS | Out of scope for a casual game. If it matters: require a second angle, ask for a specific detail ("the underside of a leaf"), and compare against the clue. |
| 9 | **Observability** | | `verify_log` already records verdict, confidence and latency (7-day TTL). Ship it to a dashboard and alert on error rate. |

What does not need to change: the app is stateless (all state is in the database), so horizontal scaling is "run
more instances". There is no queue, cache, or service to operate today, and none is justified until row 1 bites.
