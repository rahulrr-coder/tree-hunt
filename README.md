# Tree Hunt

Put the phone down. Go find 8 trees.

A mobile web app that turns a walk into a scavenger hunt for the plants of your city. You get a hunt card of
8 common plants, go outside, and photograph each one. A vision model checks that the photo really shows that
plant. Verified finds land on a shared community map and build your daily streak.

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 1 ("Touch Grass").

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in MODEL_API_KEY (and MODEL_NAME if you changed provider)
npm run dev                  # http://localhost:3000
```

With `MONGODB_URI` empty the app uses an in-memory store, so you can try everything with just a model key.
Data resets on restart, and `npm start` / production refuses to boot without a real database.

| Command | What it does |
|---|---|
| `npm test` | Unit tests: streak rules, model JSON parsing and retries, coordinate rounding, request validation |
| `npm run smoke` | Runs the verifier on photos in `scripts/samples/` and prints accuracy and latency |
| `npm run build && npm start` | Production build |

On a phone, the camera and GPS need HTTPS. Test on the deployed URL, or tunnel your dev server.

## Use any model

`lib/model.ts` is the only file that talks to a model. It calls the OpenAI-compatible
`POST {MODEL_BASE_URL}/chat/completions` endpoint with an image, so a provider switch is three env vars:

| Provider | MODEL_BASE_URL | MODEL_NAME (example) |
|---|---|---|
| Google AI Studio (default) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemma-3-27b-it` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemma-3-27b-it` |
| Groq / Together | their `/openai/v1` or `/v1` endpoint | a vision model they host |
| Ollama (local) | `http://localhost:11434/v1` | `gemma3:27b` |
| OpenAI | `https://api.openai.com/v1` | any vision model |

The challenge requires an open-weight model, so keep a Gemma model for the submission. The app itself does not care.

## How it works

```
phone  --(resized JPEG + 480px thumb + rounded GPS)-->  /api/verify  --> lib/model.ts --> any vision model
                                                            |
                                                      MongoDB Atlas  <--  /api/finds, /api/leaderboard, /api/hunt
```

- **One Next.js app** serves the UI and the API route handlers. One deploy.
- **Hunt cards are hand-written JSON** in `data/hunt-cards/`. The model never invents them.
- **Photos are re-encoded in the browser** (1024 px, JPEG), which strips EXIF. Only a 480 px thumbnail is stored.
  Location is rounded to 3 decimals (about 110 m) on the phone before it is sent.
- **Honest verdicts:** `match` below 0.6 confidence becomes `unsure`; failed attempts are never stored.
- **Streaks** use Asia/Kolkata midnight (`APP_TIMEZONE`). A repeat find of a plant keeps the streak but the card shows it once.
- **Leaderboard** ranks by different plants found, then total finds, so one tree photographed 20 times can't win.

## Environment

See `.env.example`. `MODEL_API_KEY`, `MODEL_BASE_URL`, `MODEL_NAME` select the model; `MONGODB_URI` / `MONGODB_DB`
select storage; `VERIFY_RATE_LIMIT_PER_HOUR` caps photo checks per player; `APP_TIMEZONE` sets the streak day boundary.

## Deploy (Render)

`render.yaml` is a blueprint: connect the repo, set `MODEL_API_KEY` and `MONGODB_URI`, deploy. In Atlas, allow
Render's outbound IPs (or `0.0.0.0/0` for a demo).

## Credits

Map: [Leaflet](https://leafletjs.com) with [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles.
Fonts: Fraunces and Inter. Icons: lucide. All application code is original and was written inside the challenge window.
