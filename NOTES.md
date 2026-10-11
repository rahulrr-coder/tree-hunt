# Notes

## Smoke test (Phase 0)

Not run yet. It needs a real `MODEL_API_KEY` and 5 to 8 photos in `scripts/samples/`
(`neem-1.jpg` should match, `not-neem-1.jpg` is something else photographed while claiming neem; the file name is the plant name the verifier is told).

```bash
npm run smoke
```

Paste the printed table here. The two cases worth including: curry leaf claimed as neem (should be a miss with a hint
about toothed versus smooth edges) and a blurry photo (should be `unsure`, not `match`).

| photo | expected | verdict | confidence | latency | correct |
|---|---|---|---|---|---|
| _run `npm run smoke`_ | | | | | |

If accuracy is poor: tighten the prompt in `lib/model.ts`, or the card-writing prompt in `lib/hunt.ts` (`buildSelectionPrompt`), since generated traits feed the verifier.

## Decisions

- **Model client is plain `fetch`** against the OpenAI-compatible chat endpoint, no SDK. Any provider works with 3 env vars.
- **No `react-leaflet`**: plain Leaflet in one effect is shorter than the wrapper plus a dynamic import.
- **No `/api/me`**: streak and found plants come back from `/api/hunt/:cardId?userId=`.
- **Thumbnails are served by `/api/finds/:id/thumb`** (cacheable JPEG) instead of inlined in list responses, so
  the map payload stays small.
- **String UUID ids**, not ObjectId, so nothing needs converting at the API boundary.
- **Leaderboard ranks by unique plants** first; repeat finds still count for streaks and totals.
- **In-memory store** when `MONGODB_URI` is unset (dev and tests only; production refuses to start without Mongo).
- **Hunt cards are generated** from iNaturalist sightings per ~28 km cell (see PLAN.md 1b); the curated Coimbatore card was removed.
- **Not built, by request of the spec**: accounts, comments, likes, push, offline, native app.

## Known limitations

- A nickname is the only identity: typing someone's nickname signs you in as them (their `userId` is returned).
  Fine for a casual hunt; see PLAN.md for the upgrade path.
- Nothing stops a photo of a photo. The verifier checks the plant, not that the player was there.
- Not yet verified against a real Gemma endpoint: image input via the OpenAI-compatible route should work with
  Gemma 3 vision models, but run `npm run smoke` before relying on it.
