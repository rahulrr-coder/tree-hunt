// Phase 0 check: run the verifier on real photos before trusting it with the game.
//   Put photos in scripts/samples/ named <plantId>-<n>.jpg (should match) or
//   not-<plantId>-<n>.jpg (should NOT match the claimed plant), then: npm run smoke
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultCardId, getCard } from "../lib/huntCards";
import { verifyPlant } from "../lib/model";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const dir = join(__dirname, "samples");
  const files = readdirSync(dir).filter((f) => /\.(jpe?g)$/i.test(f)).sort();
  if (!files.length) return console.log("No photos in scripts/samples/. Add e.g. neem-1.jpg and not-neem-1.jpg.");

  const plants = getCard(defaultCardId)!.plants;
  const rows: string[] = [];
  const latencies: number[] = [];
  let right = 0;

  for (const file of files) {
    const m = file.match(/^(not-)?(.+)-\d+\.jpe?g$/i);
    const plant = plants.find((p) => p.id === m?.[2]);
    if (!m || !plant) {
      console.log(`skip ${file}: name must look like neem-1.jpg or not-neem-1.jpg`);
      continue;
    }
    const expectMatch = !m[1];
    const imageDataUrl = `data:image/jpeg;base64,${readFileSync(join(dir, file)).toString("base64")}`;
    const t0 = Date.now();
    let verdict = "error", confidence = 0, reason = "";
    try {
      const r = await verifyPlant({ imageDataUrl, plant });
      ({ verdict, confidence, reason } = r);
    } catch (e) {
      reason = (e as Error).message;
    }
    const ms = Date.now() - t0;
    const ok = expectMatch ? verdict === "match" : verdict !== "match"; // a miss must never become a match
    if (ok) right++;
    latencies.push(ms);
    rows.push(`| ${file} | ${expectMatch ? "match" : "not " + plant.id} | ${verdict} | ${confidence.toFixed(2)} | ${ms} ms | ${ok ? "yes" : "NO"} | ${reason.replace(/\|/g, "/")} |`);
  }

  latencies.sort((a, b) => a - b);
  console.log(`Model: ${process.env.MODEL_NAME} via ${process.env.MODEL_BASE_URL}\n`);
  console.log("| photo | expected | verdict | confidence | latency | correct | reason |\n|---|---|---|---|---|---|---|");
  console.log(rows.join("\n"));
  console.log(`\nAccuracy: ${right}/${rows.length}. Median latency: ${latencies[Math.floor(latencies.length / 2)] ?? 0} ms.`);
}

main();
