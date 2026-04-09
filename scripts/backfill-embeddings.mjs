/**
 * Backfill missing embeddings in knowledge_base
 * Run: node scripts/backfill-embeddings.mjs
 *
 * Requires .env with VOYAGE_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const VOYAGE_KEY = env.VOYAGE_API_KEY;
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!VOYAGE_KEY) { console.error("Missing VOYAGE_API_KEY in .env"); process.exit(1); }
if (!SUPABASE_URL) { console.error("Missing VITE_SUPABASE_URL in .env"); process.exit(1); }
if (!SUPABASE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env"); process.exit(1); }

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";

async function main() {
  // 1. Get rows without embeddings
  console.log("Fetching rows without embeddings...");
  const queryRes = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_base?embedding=is.null&select=id,content&limit=500`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );

  if (!queryRes.ok) {
    console.error("Failed to query:", await queryRes.text());
    process.exit(1);
  }

  const rows = await queryRes.json();
  console.log(`Found ${rows.length} rows without embeddings`);

  if (rows.length === 0) {
    console.log("All rows already have embeddings!");
    return;
  }

  let updated = 0;
  let errors = 0;

  // 2. Process one by one to avoid token limits
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const truncated = row.content.slice(0, 8000); // Voyage limit safety
    process.stdout.write(`[${i + 1}/${rows.length}] Embedding ${row.id.slice(0, 8)}... `);

    try {
      // Call Voyage
      const voyageRes = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VOYAGE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VOYAGE_MODEL,
          input: [truncated],
          input_type: "document",
        }),
      });

      if (!voyageRes.ok) {
        const err = await voyageRes.text();
        console.log(`VOYAGE ERROR: ${err.slice(0, 100)}`);
        errors++;
        continue;
      }

      const voyageData = await voyageRes.json();
      const embedding = voyageData.data?.[0]?.embedding;

      if (!embedding) {
        console.log("NO EMBEDDING RETURNED");
        errors++;
        continue;
      }

      // Update Supabase
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/knowledge_base?id=eq.${row.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ embedding: `[${embedding.join(",")}]` }),
        },
      );

      if (updateRes.ok) {
        updated++;
        console.log("OK");
      } else {
        const err = await updateRes.text();
        console.log(`UPDATE ERROR: ${err.slice(0, 100)}`);
        errors++;
      }
    } catch (e) {
      console.log(`EXCEPTION: ${e.message}`);
      errors++;
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone! Updated: ${updated}, Errors: ${errors}, Total: ${rows.length}`);
}

main().catch(console.error);
