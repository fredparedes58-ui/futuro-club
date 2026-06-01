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

/**
 * Sanitize Markdown links that Notion's API rejects.
 *
 * Notion only accepts links with an absolute http(s):// or mailto: URL.
 * It rejects:
 *   - Internal anchors:           [foo](#section)
 *   - Empty href:                 [foo]()
 *   - Relative file links:        [foo](./bar.md)  [foo](../bar.md)
 *   - Bare paths/domains:         [foo](bar)       [foo](www.x.com)
 *   - File scheme:                [foo](file://…)
 *
 * Strategy: strip the broken link wrapper but KEEP the visible text.
 *   - For #anchor links → render as **bold** text (looks intentional)
 *   - For everything else → plain text
 *
 * Also normalises bare domains (www.x.com) to https://www.x.com so they
 * stay clickable.
 */
function sanitizeMarkdownLinks(md) {
  const stats = { anchors: 0, empty: 0, relative: 0, bareDomain: 0 };

  // 1. [text](#anchor) — drop link, keep text as **bold**
  md = md.replace(/\[([^\]]+)\]\(\s*#[^)]*\)/g, (_, text) => {
    stats.anchors++;
    return `**${text}**`;
  });

  // 2. [text]() — empty href, just keep the text
  md = md.replace(/\[([^\]]+)\]\(\s*\)/g, (_, text) => {
    stats.empty++;
    return text;
  });

  // 3. [text](./foo) or [text](../foo) or [text](foo.md) — relative
  md = md.replace(
    /\[([^\]]+)\]\(\s*(?:\.{1,2}\/|[a-zA-Z0-9_-]+\.md(?:#[^)]*)?)[^)]*\)/g,
    (_, text) => {
      stats.relative++;
      return text;
    },
  );

  // 4. [text](bare-path-without-scheme) — drop link, keep text
  //    Anything that doesn't start with http(s):// or mailto: is dropped.
  md = md.replace(/\[([^\]]+)\]\(\s*([^)]+?)\s*\)/g, (full, text, url) => {
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return full; // keep as is
    if (/^mailto:/i.test(trimmed)) return full; // keep mailto
    // www.foo.com → upgrade to https://
    if (/^www\./i.test(trimmed)) {
      stats.bareDomain++;
      return `[${text}](https://${trimmed})`;
    }
    // Anything else → drop the link, keep text
    stats.relative++;
    return text;
  });

  const total = stats.anchors + stats.empty + stats.relative + stats.bareDomain;
  if (total > 0) {
    console.log(
      `🧽 Sanitized ${total} links: ` +
        `${stats.anchors} #anchors, ${stats.empty} empty, ` +
        `${stats.relative} relative, ${stats.bareDomain} bare-domain upgraded`,
    );
  }
  return md;
}

/**
 * Normalise Markdown tables so every row has exactly as many cells as the
 * header. Notion rejects tables where a row's cell count differs from the
 * table width ("Number of cells in table row must match the table width").
 * Rows with too few cells are padded with empty cells; rows with too many are
 * trimmed. Pipes are not unescaped here — we only count top-level "|".
 */
function normalizeMarkdownTables(md) {
  const lines = md.split('\n');
  const out = [];
  let fixed = 0;
  let i = 0;

  const splitRow = (line) => {
    // strip one leading/trailing pipe, then split on unescaped pipes
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split(/(?<!\\)\|/);
  };

  while (i < lines.length) {
    const isTableRow = /^\s*\|/.test(lines[i]);
    if (!isTableRow) { out.push(lines[i]); i++; continue; }

    // gather the contiguous table block
    const block = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i]); i++; }

    const width = splitRow(block[0]).length;
    for (let r = 0; r < block.length; r++) {
      const indent = block[r].match(/^\s*/)[0];
      const isSeparator = /^\s*\|?\s*:?-{1,}/.test(block[r]) && /-/.test(block[r]) && !/[^\s|:\-]/.test(block[r]);
      let cells = splitRow(block[r]);
      if (cells.length !== width) {
        if (cells.length < width) {
          while (cells.length < width) cells.push(isSeparator ? '---' : ' ');
        } else {
          cells = cells.slice(0, width);
        }
        fixed++;
      }
      out.push(indent + '| ' + cells.map((c) => c.trim()).join(' | ') + ' |');
    }
  }

  if (fixed > 0) console.log(`\uD83E\uDDF0 Normalized ${fixed} malformed table row(s) to match header width`);
  return out.join('\n');
}

/**
 * Clear all existing children of a Notion page.
 *
 * Notion API rate-limit is ~3 req/s. With sequential deletes a 800-block page
 * takes ~4.5 min just to clear, blowing past CI timeouts. We:
 *   1. Page through all children collecting IDs (fast, batched 100 at a time)
 *   2. Delete in parallel with a concurrency of 3 (saturates the rate limit
 *      without getting 429s)
 */
async function clearPageChildren(pageId) {
  console.log(`🧹 Clearing existing blocks from page ${pageId}…`);

  // 1. Collect all block IDs first
  const ids = [];
  let cursor;
  do {
    const resp = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of resp.results) {
      if (isFullBlock(block)) ids.push(block.id);
    }
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  console.log(`   Found ${ids.length} blocks to delete`);
  if (ids.length === 0) return;

  // 2. Delete with concurrency 3 (Notion rate-limit is ~3 req/s)
  const CONCURRENCY = 3;
  let deleted = 0;
  let failed = 0;

  async function worker(slice) {
    for (const id of slice) {
      try {
        await notion.blocks.delete({ block_id: id });
        deleted++;
        if (deleted % 100 === 0) {
          console.log(`   Deleted ${deleted}/${ids.length}`);
        }
      } catch (err) {
        failed++;
        if (failed <= 5) {
          console.warn(`   ⚠️  Could not delete block ${id}: ${err.message}`);
        }
      }
    }
  }

  // Split ids into N slices and run them concurrently
  const slices = Array.from({ length: CONCURRENCY }, () => []);
  ids.forEach((id, i) => slices[i % CONCURRENCY].push(id));
  await Promise.all(slices.map(worker));

  console.log(`   Deleted ${deleted}/${ids.length} blocks (${failed} failed)`);
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

  // 2.5. Sanitize links so Notion's strict URL validator doesn't reject the batch
  combined = sanitizeMarkdownLinks(combined);
  combined = normalizeMarkdownTables(combined);

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
