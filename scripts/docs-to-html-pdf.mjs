/**
 * VITAS — Convierte docs .md a .html y .pdf con diseño VITAS
 * Uso: node scripts/docs-to-html-pdf.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, "../docs");
const OUT_DIR = path.resolve(__dirname, "../docs/export");

const FILES = [
  "KPIS_Y_ESTADISTICAS",
  "FLUJO_DE_TRABAJO",
  "FUNCIONALIDADES_COMPLETAS",
  "RANKING_COMPETITIVO",
  "BRAND_CONTEXT",
  "ANALISIS_COMPETITIVO_DETALLADO",
  "ARQUITECTURA_ROBUSTA",
];

// ── VITAS HTML Template ──────────────────────────────────────────────
function htmlTemplate(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — VITAS Football Intelligence</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    /* ── VITAS Design System ─────────────────────────────── */
    :root {
      --bg:           #0a0e17;
      --bg-card:      #111827;
      --bg-surface:   #1a2233;
      --bg-elevated:  #1f2b3d;
      --border:       #2a3548;
      --text:         #e2e8f0;
      --text-muted:   #8b9ab5;
      --text-dim:     #5a6a82;
      --primary:      #0066b8;
      --primary-light:#3399ff;
      --electric:     #a855f7;
      --electric-light:#c084fc;
      --gold:         #d4940a;
      --gold-light:   #f5b731;
      --cyan:         #06b6d4;
      --danger:       #ef4444;
      --success:      #22c55e;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      font-size: 15px;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Layout ──────────────────────────────────────────── */
    .page-wrapper {
      max-width: 960px;
      margin: 0 auto;
      padding: 40px 48px 80px;
    }

    /* ── Header ──────────────────────────────────────────── */
    .doc-header {
      text-align: center;
      padding: 48px 0 40px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 48px;
      position: relative;
    }
    .doc-header::before {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 50%;
      transform: translateX(-50%);
      width: 120px;
      height: 2px;
      background: linear-gradient(90deg, var(--primary), var(--electric), var(--cyan));
      border-radius: 2px;
    }
    .doc-header .brand {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 6px;
      text-transform: uppercase;
      color: var(--primary-light);
      margin-bottom: 12px;
    }
    .doc-header .brand span { color: var(--electric-light); }
    .doc-header .subtitle {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      color: var(--text-dim);
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-top: 8px;
    }

    /* ── Typography ──────────────────────────────────────── */
    h1 {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
      font-size: 32px;
      color: #fff;
      letter-spacing: -0.5px;
      margin: 56px 0 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    h1:first-child { margin-top: 0; }

    h2 {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
      font-size: 22px;
      color: var(--primary-light);
      margin: 40px 0 16px;
      padding-left: 14px;
      border-left: 3px solid var(--primary);
      letter-spacing: 0.3px;
    }

    h3 {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 600;
      font-size: 17px;
      color: var(--electric-light);
      margin: 28px 0 10px;
    }

    h4 {
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 14px;
      color: var(--gold-light);
      margin: 20px 0 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    p {
      margin: 0 0 14px;
      color: var(--text);
    }

    strong {
      color: #fff;
      font-weight: 600;
    }

    em {
      color: var(--text-muted);
      font-style: italic;
    }

    a {
      color: var(--primary-light);
      text-decoration: none;
      border-bottom: 1px solid var(--primary-light);
      transition: all 0.2s;
    }
    a:hover {
      color: var(--electric-light);
      border-color: var(--electric-light);
    }

    /* ── Blockquote ──────────────────────────────────────── */
    blockquote {
      border-left: 3px solid var(--electric);
      background: linear-gradient(135deg, rgba(168,85,247,0.06), rgba(0,102,184,0.04));
      padding: 16px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    blockquote p {
      color: var(--text-muted);
      font-size: 13px;
      margin: 0;
    }

    /* ── Code ────────────────────────────────────────────── */
    code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
      background: var(--bg-surface);
      color: var(--cyan);
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    pre {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px 24px;
      overflow-x: auto;
      margin: 16px 0 20px;
      position: relative;
    }
    pre::before {
      content: 'CODE';
      position: absolute;
      top: 8px;
      right: 12px;
      font-family: 'Rajdhani', sans-serif;
      font-size: 9px;
      letter-spacing: 2px;
      color: var(--text-dim);
      text-transform: uppercase;
    }
    pre code {
      background: none;
      border: none;
      padding: 0;
      color: var(--text);
      font-size: 12.5px;
      line-height: 1.8;
    }

    /* ── Tables ──────────────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 16px 0 24px;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border);
      font-size: 13.5px;
    }

    thead {
      background: linear-gradient(135deg, var(--bg-surface), var(--bg-elevated));
    }
    thead th {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--primary-light);
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    tbody tr {
      background: var(--bg-card);
      transition: background 0.2s;
    }
    tbody tr:nth-child(even) {
      background: rgba(26,34,51,0.5);
    }
    tbody tr:hover {
      background: rgba(0,102,184,0.08);
    }

    tbody td {
      padding: 10px 16px;
      border-bottom: 1px solid rgba(42,53,72,0.5);
      color: var(--text);
      vertical-align: top;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }

    /* ── Lists ───────────────────────────────────────────── */
    ul, ol {
      padding-left: 24px;
      margin: 8px 0 16px;
    }
    li {
      margin: 4px 0;
      color: var(--text);
    }
    li::marker {
      color: var(--primary-light);
    }

    /* ── Horizontal Rule ─────────────────────────────────── */
    hr {
      border: none;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--border), var(--primary), var(--border), transparent);
      margin: 40px 0;
    }

    /* ── Footer ──────────────────────────────────────────── */
    .doc-footer {
      text-align: center;
      padding-top: 40px;
      margin-top: 60px;
      border-top: 1px solid var(--border);
      position: relative;
    }
    .doc-footer::before {
      content: '';
      position: absolute;
      top: -1px;
      left: 50%;
      transform: translateX(-50%);
      width: 80px;
      height: 2px;
      background: linear-gradient(90deg, var(--primary), var(--electric));
      border-radius: 2px;
    }
    .doc-footer p {
      font-family: 'Rajdhani', sans-serif;
      font-size: 10px;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: var(--text-dim);
    }

    /* ── Print / PDF ─────────────────────────────────────── */
    @media print {
      body { background: #0a0e17 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-wrapper { padding: 24px 32px 48px; }
      h1 { font-size: 26px; margin-top: 36px; }
      h2 { font-size: 18px; margin-top: 28px; }
      pre { font-size: 11px; }
      table { font-size: 11.5px; }
    }

    /* ── Special highlights ──────────────────────────────── */
    td:first-child, th:first-child {
      font-weight: 500;
    }

    /* VITAS keyword highlights in tables */
    td strong {
      color: var(--primary-light);
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="doc-header">
      <div class="brand">VITAS<span>.</span> Football Intelligence</div>
      <div class="subtitle">Prophet Horizon Technology · Build 2.1.0 · Abril 2026</div>
    </div>

    <div class="doc-content">
      ${bodyHtml}
    </div>

    <div class="doc-footer">
      <p>VITAS Platform · Build 2.1.0 · &copy; 2026 Prophet Horizon Technology</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  // Create output directory
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Configure marked
  marked.setOptions({ gfm: true, breaks: false });

  // Generate HTML files
  console.log("📄 Generando HTMLs...");
  const htmlPaths = [];

  for (const name of FILES) {
    const mdPath = path.join(DOCS_DIR, `${name}.md`);
    const md = fs.readFileSync(mdPath, "utf-8");

    // Extract title from first H1
    const titleMatch = md.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].replace(/[·]/g, "—") : name;

    const bodyHtml = marked.parse(md);
    const fullHtml = htmlTemplate(title, bodyHtml);

    const htmlPath = path.join(OUT_DIR, `${name}.html`);
    fs.writeFileSync(htmlPath, fullHtml, "utf-8");
    htmlPaths.push({ name, htmlPath, title });
    console.log(`  ✅ ${name}.html`);
  }

  // Generate PDFs with Puppeteer
  console.log("\n📑 Generando PDFs...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  for (const { name, htmlPath } of htmlPaths) {
    const page = await browser.newPage();
    const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
    await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for fonts to load
    await page.evaluateHandle("document.fonts.ready");

    const pdfPath = path.join(OUT_DIR, `${name}.pdf`);
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "24mm", bottom: "24mm", left: "16mm", right: "16mm" },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width:100%;text-align:center;font-family:sans-serif;font-size:8px;color:#5a6a82;letter-spacing:3px;text-transform:uppercase;padding-top:8px;">
          VITAS · Football Intelligence
        </div>`,
      footerTemplate: `
        <div style="width:100%;display:flex;justify-content:space-between;font-family:sans-serif;font-size:8px;color:#5a6a82;padding:0 24mm;">
          <span>© 2026 Prophet Horizon Technology</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });

    await page.close();
    console.log(`  ✅ ${name}.pdf`);
  }

  await browser.close();
  console.log(`\n🎉 Listo! Archivos en: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
