// Phase 0 check: run the verifier on real photos before trusting it with the game.
//   Put photos in scripts/samples/ named <plant-name>-<n>.jpg (should match) or
//   not-<plant-name>-<n>.jpg (is something else, photographed while claiming that plant), e.g.
//   neem-1.jpg, not-neem-1.jpg, golden-shower-tree-1.jpg. Then: npm run smoke
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyPlant } from "../lib/model";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const dir = join(__dirname, "samples");
  const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
  if (!files.length) return console.log("No photos in scripts/samples/. Add e.g. neem-1.jpg and not-neem-1.jpg.");

  const rows: string[] = [];
  const latencies: number[] = [];
  let right = 0;

  for (const file of files) {
    const m = file.match(/^(not-)?(.+)-\d+\.jpe?g$/i);
    if (!m) {
      console.log(`skip ${file}: name must look like neem-1.jpg or not-neem-1.jpg`);
      continue;
    }
    const expectMatch = !m[1];
    const name = m[2].replace(/-/g, " ");
    const imageDataUrl = `data:image/jpeg;base64,${readFileSync(join(dir, file)).toString("base64")}`;
    const t0 = Date.now();
    let verdict = "error", confidence = 0, reason = "";
    try {
      ({ verdict, confidence, reason } = await verifyPlant({ imageDataUrl, plant: { name, scientific: "", traits: "", lookalikes: "" } }));
    } catch (e) {
      reason = (e as Error).message;
    }
    const ms = Date.now() - t0;
    const ok = expectMatch ? verdict === "match" : verdict !== "match"; // a miss must never become a match
    if (ok) right++;
    latencies.push(ms);
    rows.push(`| ${file} | ${expectMatch ? "match" : "not " + name} | ${verdict} | ${confidence.toFixed(2)} | ${ms} ms | ${ok ? "yes" : "NO"} | ${reason.replace(/\|/g, "/")} |`);
  }

  latencies.sort((a, b) => a - b);
  console.log(`Model: ${process.env.MODEL_NAME} via ${process.env.MODEL_BASE_URL}\n`);
  console.log("| photo | expected | verdict | confidence | latency | correct | reason |\n|---|---|---|---|---|---|---|");
  console.log(rows.join("\n"));
  console.log(`\nAccuracy: ${right}/${rows.length}. Median latency: ${latencies[Math.floor(latencies.length / 2)] ?? 0} ms.`);
}

main();
