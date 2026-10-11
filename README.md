# Tree Hunt

Put the phone down. Go find the trees around you.

You pick a nickname and a place. Tree Hunt builds a hunt card of 8 plants that people have really photographed
near you, with a sample photo and a clue for each. You go outside, find them, and photograph each one. A vision
model checks that the photo shows that plant. Verified finds land on a shared community map and build your daily streak.

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 1 ("Touch Grass").

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME
npm run dev                  # http://localhost:3000
```

With `MONGODB_URI` empty the app uses an in-memory store, so you only need a model key to try it. Data resets on
restart, and production refuses to boot without a real database.

| Command | What it does |
|---|---|
| `npm test` | Unit tests: streaks, model parsing and retries, hunt-card generation, request validation |
| `npm run smoke` | Runs the verifier on photos in `scripts/samples/` and prints accuracy and latency |
| `npm run build && npm start` | Production build |

On a phone, the camera and GPS need HTTPS. Test on the deployed URL, or tunnel your dev server.

## How a hunt is built

```
player's place --> cell (~28 km)  --cache miss-->  iNaturalist: most-sighted plants + licensed photos
                                                        |
                                              model: pick 8 beginner-friendly plants, write clues
                                                        |
                                              Mongo `hunt_cards` (first writer wins, shared by the cell)
```

- **Real sightings decide which plants.** The model can only choose ids from the iNaturalist candidate list, so it
  cannot invent a plant that nobody has photographed nearby. If the model is down, the card is built from the
  sightings and Wikipedia summaries alone.
- **One card per ~28 km cell**, cached, so cost is per area and not per player. The first player in a new area waits
  about 15 to 20 seconds; everyone after that gets it instantly.
- **Sample photos** are only used when iNaturalist lists them under a reusable licence (CC0, CC BY, CC BY-SA, or the
  non-commercial variants). The credit and a link back are shown with every photo.
- **Place search** uses Open-Meteo's free geocoder. "Use my location" sends a position rounded to about 1 km.

## Use any model

`lib/model.ts` is the only file that talks to a model. It calls the OpenAI-compatible
`POST {MODEL_BASE_URL}/chat/completions` endpoint (with an image for verification, text-only for building cards), so
a provider switch is three env vars:

| Provider | MODEL_BASE_URL | MODEL_NAME (example) |
|---|---|---|
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemma-3-27b-it` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemma-3-27b-it` |
| Groq / Together | their `/openai/v1` or `/v1` endpoint | a vision model they host |
| Ollama (local) | `http://localhost:11434/v1` | `gemma3:27b` |
| OpenAI | `https://api.openai.com/v1` | any vision model |
| Azure AI Foundry | `https://<resource>.services.ai.azure.com/openai/v1` | your deployment name |

The client sends only `model` and `messages` (plus `temperature` when the model accepts it), so models that reject
`max_tokens` or custom temperatures work too. The DEV challenge requires an open-weight model, so use Gemma for the
submission build; the app itself does not care.

## Other rules

- **Photos are re-encoded in the browser** (1024 px JPEG), which strips EXIF. Only a 480 px thumbnail is stored.
  Find locations are rounded to 3 decimals (about 110 m) on the phone before they are sent.
- **Honest verdicts:** a `match` below 0.6 confidence becomes `unsure`; failed attempts are never stored.
- **Streaks** use the player's own timezone. A repeat find keeps the streak but the card shows a plant once.
- **Leaderboard** ranks by different plants found, then total finds, so one tree photographed 20 times can't win.

## Environment

See `.env.example`. `MODEL_*` select the model; `MONGODB_URI` / `MONGODB_DB` select storage;
`VERIFY_RATE_LIMIT_PER_HOUR` caps photo checks per player; `APP_TIMEZONE` is the fallback streak timezone.

## Deploy

Netlify runs it with no config (set the env vars in the dashboard). `render.yaml` is a Render blueprint. Either needs a
MongoDB Atlas database, and Atlas must allow the host's outbound IPs (`0.0.0.0/0` for a demo). Function timeout of
60 s is enough: building a card takes about 20 s.

## Credits

Plant sightings and photos: [iNaturalist](https://www.inaturalist.org) contributors, under the licences shown with each
photo. Place search: [Open-Meteo](https://open-meteo.com). Map: [Leaflet](https://leafletjs.com) with
[OpenStreetMap](https://www.openstreetmap.org/copyright) tiles. Fonts: Fraunces and Inter. Icons: lucide.
All application code is original and was written inside the challenge window.
