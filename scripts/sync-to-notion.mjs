/**
 * VITAS · Sync docs/*.md → Notion
 *
 * Reads a configurable list of Markdown files, converts them to Notion
 * blocks via @tryfabric/martian, and replaces the content of a target
 * Notion page.
 *
 * Triggered by GitHub Actions on push to main when docs/ changes.
 * Can also be run locally with: `node scripts/sync-to-notion.mjs`
 *
 * Required env vars:
 *   NOTION_TOKEN    — Internal Integration Secret from Notion
 *   NOTION_PAGE_ID  — Target page ID (find at the end of the page URL)
 *
 * Optional env vars:
 *   NOTION_SYNC_FILES — Comma-separated list of files to sync
 *                       (default: docs/VITAS_MASTER.md only)
 *   NOTION_DRY_RUN    — If set to "1", only logs what would be uploaded
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client, isFullBlock } from "@notionhq/client";
import { markdownToBlocks } from "@tryfabric/martian";

// ── Config ───────────────────────────────────────────────────────────
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;
const DRY_RUN = process.env.NOTION_DRY_RUN === "1";

const DEFAULT_FILES = ["docs/VITAS_MASTER.md"];
const FILES = (process.env.NOTION_SYNC_FILES ?? DEFAULT_FILES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Notion API only accepts 100 blocks per request — we batch
const NOTION_MAX_BLOCKS_PER_REQUEST = 100;

// ── Validation ───────────────────────────────────────────────────────
function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!NOTION_TOKEN) fail("NOTION_TOKEN not set");
if (!NOTION_PAGE_ID) fail("NOTION_PAGE_ID not set");

const notion = new Client({ auth: NOTION_TOKEN });

// ── Helpers ──────────────────────────────────────────────────────────
async function readMarkdownFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  try {
    const content = await fs.readFile(abs, "utf8");
    return content;
  } catch (err) {
    console.warn(`⚠️  Cannot read ${filePath}: ${err.message}`);
    return null;
  }
}

function summaryHeader(filename, sizeBytes) {
  return `\n\n---\n\n📄 **Synced from:** \`${filename}\` · ${(sizeBytes / 1024).toFixed(1)} KB · Last synced: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n\n---\n\n`;
}

/** Clear all existing children of a Notion page */
async function clearPageChildren(pageId) {
  console.log(`🧹 Clearing existing blocks from page ${pageId}…`);
  let cursor;
  let deleted = 0;

  do {
    const resp = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of resp.results) {
      if (!isFullBlock(block)) continue;
      try {
        await notion.blocks.delete({ block_id: block.id });
        deleted++;
      } catch (err) {
        console.warn(`   ⚠️  Could not delete block ${block.id}: ${err.message}`);
      }
    }

    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  console.log(`   Deleted ${deleted} blocks`);
}

/** Append blocks in batches of 100 (Notion API limit) */
async function appendBlocksInBatches(pageId, blocks) {
  console.log(`📤 Appending ${blocks.length} blocks in batches of ${NOTION_MAX_BLOCKS_PER_REQUEST}…`);
  let total = 0;

  for (let i = 0; i < blocks.length; i += NOTION_MAX_BLOCKS_PER_REQUEST) {
    const batch = blocks.slice(i, i + NOTION_MAX_BLOCKS_PER_REQUEST);
    try {
      await notion.blocks.children.append({
        block_id: pageId,
        children: batch,
      });
      total += batch.length;
      console.log(
        `   Batch ${Math.floor(i / NOTION_MAX_BLOCKS_PER_REQUEST) + 1} → ${batch.length} blocks (${total}/${blocks.length})`,
      );
    } catch (err) {
      console.error(`   ❌ Batch failed: ${err.message}`);
      if (err.body) console.error(`      Body: ${JSON.stringify(err.body).slice(0, 500)}`);
      throw err;
    }
  }

  return total;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 VITAS Notion sync starting`);
  console.log(`   Page ID: ${NOTION_PAGE_ID}`);
  console.log(`   Files: ${FILES.join(", ")}`);
  console.log(`   Dry run: ${DRY_RUN ? "YES" : "NO"}`);
  console.log("");

  // 1. Read all source files
  const sources = [];
  for (const file of FILES) {
    const content = await readMarkdownFile(file);
    if (!content) continue;
    sources.push({ file, content });
  }

  if (sources.length === 0) fail("No source files could be read");

  // 2. Build combined markdown
  let combined = "";
  for (const { file, content } of sources) {
    combined += summaryHeader(file, Buffer.byteLength(content, "utf8"));
    combined += content;
  }
  combined = combined.trim();

  console.log(`📖 Combined markdown: ${combined.length} chars from ${sources.length} files`);

  // 3. Convert to Notion blocks
  // strictImageUrls=false → allow relative img paths to not break the converter
  const blocks = markdownToBlocks(combined, {
    notionLimits: { truncate: true },
    strictImageUrls: false,
  });
  console.log(`🔄 Converted to ${blocks.length} Notion blocks`);

  if (DRY_RUN) {
    console.log("🌵 DRY RUN — first 3 blocks preview:");
    console.log(JSON.stringify(blocks.slice(0, 3), null, 2));
    console.log(`\n✅ Dry run complete. Would have replaced page with ${blocks.length} blocks.`);
    return;
  }

  // 4. Verify the page is accessible
  try {
    await notion.pages.retrieve({ page_id: NOTION_PAGE_ID });
  } catch (err) {
    fail(
      `Cannot access Notion page ${NOTION_PAGE_ID}. Make sure the integration has access. Error: ${err.message}`,
    );
  }

  // 5. Clear existing content
  await clearPageChildren(NOTION_PAGE_ID);

  // 6. Append new content
  const appended = await appendBlocksInBatches(NOTION_PAGE_ID, blocks);

  // 7. Done
  console.log("");
  console.log(`✅ Sync complete! ${appended} blocks now on the Notion page.`);
  console.log(`   https://www.notion.so/${NOTION_PAGE_ID.replace(/-/g, "")}`);
}

main().catch((err) => {
  console.error("");
  console.error("❌ Sync failed:", err.message);
  if (err.body) console.error("   Body:", JSON.stringify(err.body).slice(0, 1000));
  process.exit(1);
});
