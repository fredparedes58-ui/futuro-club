// Script: transformar los HTMLs de /documentacion a paleta VITAS (tema claro)
// y reemplazar iframes YouTube por animaciones SVG premium contextuales.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '..', 'documentacion');

// ============================================================
// PALETA VITAS REAL (desde src/index.css) — TEMA CLARO
// ============================================================
const LIGHT_VARS = `:root{
  --bg:#F4F7FB;--bg2:#FFFFFF;--bg3:#EEF2F8;--bg-grad:#E8EFFA;
  --blue:#0055B3;--blue-soft:#2B7BDE;
  --purple:#9A1FB5;--gold:#D9A10F;--pink:#E61A85;--cyan:#0F857A;
  --text:#0F172A;--text2:#1E293B;--muted:#475569;--muted2:#64748B;
  --line:rgba(15,23,42,0.10);--line2:rgba(15,23,42,0.06);
  --good:#0FA968;--warn:#D97706;--bad:#DC2626;
  --grad:linear-gradient(135deg,#0055B3 0%,#9A1FB5 60%,#E61A85 100%);
  --grad2:linear-gradient(135deg,#0F857A 0%,#0055B3 100%);
  --grad3:linear-gradient(135deg,#D9A10F 0%,#E61A85 100%);
  --card:rgba(255,255,255,0.8);--card-hover:rgba(255,255,255,0.96);
  --surface:#FFFFFF;--surface-elev:#FBFCFE;
  --shadow-sm:0 2px 8px rgba(15,23,42,0.06);
  --shadow-md:0 10px 30px -12px rgba(15,23,42,0.15),0 2px 8px rgba(15,23,42,0.05);
  --shadow-lg:0 25px 50px -18px rgba(0,85,179,0.25),0 10px 20px -10px rgba(154,31,181,0.15);
}`;

// ============================================================
// ANIMACIONES SVG "VIDEOS" PREMIUM (no-YouTube)
// ============================================================
const SVG_ANIMATIONS = {
  // RADAR de talento con puntos pulsantes — para overview/hero
  radar: ({ label = 'VITAS · Intelligence Live', sub = 'Scanning 85,000 federated players' } = {}) => `
<div class="vid-hero" data-type="radar">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
    <div class="vid-metrics">
      <span class="vid-m"><b id="rd-count">1,247</b><em>Detected</em></span>
      <span class="vid-m"><b id="rd-conf">94.3%</b><em>Confidence</em></span>
      <span class="vid-m"><b id="rd-speed">12 ms</b><em>Latency</em></span>
    </div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="rg-bg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="55%" stop-color="#EEF4FC"/>
        <stop offset="100%" stop-color="#DDE8F6"/>
      </radialGradient>
      <radialGradient id="rg-pulse" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(0,85,179,0.45)"/>
        <stop offset="50%" stop-color="rgba(0,85,179,0.15)"/>
        <stop offset="100%" stop-color="rgba(0,85,179,0)"/>
      </radialGradient>
      <linearGradient id="rg-sweep" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgba(0,85,179,0)"/>
        <stop offset="60%" stop-color="rgba(0,85,179,0.15)"/>
        <stop offset="100%" stop-color="rgba(154,31,181,0.55)"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#rg-bg)"/>
    <g stroke="rgba(15,23,42,0.08)" fill="none">
      <circle cx="400" cy="225" r="180"/>
      <circle cx="400" cy="225" r="130"/>
      <circle cx="400" cy="225" r="80"/>
      <circle cx="400" cy="225" r="30"/>
      <line x1="400" y1="30" x2="400" y2="420"/>
      <line x1="180" y1="225" x2="620" y2="225"/>
      <line x1="245" y1="70" x2="555" y2="380"/>
      <line x1="555" y1="70" x2="245" y2="380"/>
    </g>
    <circle cx="400" cy="225" r="180" fill="url(#rg-pulse)" class="rdp rdp1"/>
    <circle cx="400" cy="225" r="130" fill="url(#rg-pulse)" class="rdp rdp2"/>
    <g class="rd-sweep" transform="translate(400 225)">
      <path d="M0,0 L180,0 A180,180 0 0,0 127,-127 Z" fill="url(#rg-sweep)"/>
    </g>
    <g class="rd-dots">
      <circle cx="330" cy="180" r="6" fill="#0055B3" class="rd-dot" style="--d:0s"/>
      <circle cx="470" cy="150" r="6" fill="#9A1FB5" class="rd-dot" style="--d:0.3s"/>
      <circle cx="520" cy="260" r="6" fill="#E61A85" class="rd-dot" style="--d:0.6s"/>
      <circle cx="440" cy="310" r="6" fill="#D9A10F" class="rd-dot" style="--d:0.9s"/>
      <circle cx="310" cy="290" r="6" fill="#0F857A" class="rd-dot" style="--d:1.2s"/>
      <circle cx="370" cy="110" r="6" fill="#0055B3" class="rd-dot" style="--d:1.5s"/>
      <circle cx="560" cy="200" r="6" fill="#9A1FB5" class="rd-dot" style="--d:1.8s"/>
      <circle cx="260" cy="220" r="6" fill="#E61A85" class="rd-dot" style="--d:2.1s"/>
      <circle cx="420" cy="225" r="10" fill="#0055B3" class="rd-center"/>
    </g>
    <g class="rd-labels" font-family="Inter,sans-serif" font-size="11" font-weight="600">
      <g class="rd-label lb1"><rect x="340" y="145" width="86" height="22" rx="4" fill="#0055B3"/><text x="383" y="160" text-anchor="middle" fill="#fff">#14 · Sub-15 · CM</text></g>
      <g class="rd-label lb2"><rect x="480" y="115" width="94" height="22" rx="4" fill="#9A1FB5"/><text x="527" y="130" text-anchor="middle" fill="#fff">#07 · Sub-17 · LW</text></g>
    </g>
  </svg>
</div>`,

  // DASHBOARD LIVE — simulación de UI VITAS animada
  dashboard: ({ label = 'VITAS · Product Tour', sub = 'Real-time scouting dashboard' } = {}) => `
<div class="vid-hero" data-type="dashboard">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="db-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F7FAFE"/>
        <stop offset="100%" stop-color="#E4ECF8"/>
      </linearGradient>
      <linearGradient id="db-area" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(0,85,179,0.35)"/>
        <stop offset="100%" stop-color="rgba(0,85,179,0)"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#db-bg)"/>
    <rect x="40" y="40" width="720" height="52" rx="10" fill="#FFFFFF" stroke="rgba(15,23,42,0.08)"/>
    <circle cx="65" cy="66" r="8" fill="#0055B3"/>
    <text x="85" y="72" font-family="Rajdhani,sans-serif" font-weight="700" font-size="18" fill="#0F172A">VITAS · Intelligence</text>
    <g class="db-pulse"><circle cx="730" cy="66" r="5" fill="#0FA968"/></g>
    <text x="700" y="72" font-family="Inter,sans-serif" font-size="11" fill="#475569">LIVE</text>
    <g class="db-kpi">
      <rect x="40" y="110" width="220" height="90" rx="10" fill="#FFFFFF" stroke="rgba(15,23,42,0.08)"/>
      <text x="55" y="134" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="#64748B">ARR PROJECTED Y5</text>
      <text x="55" y="172" font-family="Rajdhani,sans-serif" font-weight="700" font-size="34" fill="#0055B3" class="db-counter" data-target="9.6">€0.0M</text>
      <text x="180" y="172" font-family="Inter,sans-serif" font-size="11" font-weight="600" fill="#0FA968">▲ 110×</text>
    </g>
    <g>
      <rect x="280" y="110" width="220" height="90" rx="10" fill="#FFFFFF" stroke="rgba(15,23,42,0.08)"/>
      <text x="295" y="134" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="#64748B">TALENT DETECTED</text>
      <text x="295" y="172" font-family="Rajdhani,sans-serif" font-weight="700" font-size="34" fill="#9A1FB5" class="db-counter" data-target="1247">0</text>
      <text x="420" y="172" font-family="Inter,sans-serif" font-size="11" font-weight="600" fill="#0FA968">▲ +34%</text>
    </g>
    <g>
      <rect x="520" y="110" width="240" height="90" rx="10" fill="#FFFFFF" stroke="rgba(15,23,42,0.08)"/>
      <text x="535" y="134" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="#64748B">PARENT PRO · B2B2C</text>
      <text x="535" y="172" font-family="Rajdhani,sans-serif" font-weight="700" font-size="34" fill="#E61A85" class="db-counter" data-target="13500">0</text>
    </g>
    <rect x="40" y="220" width="460" height="200" rx="12" fill="#FFFFFF" stroke="rgba(15,23,42,0.08)"/>
    <text x="60" y="248" font-family="Rajdhani,sans-serif" font-weight="700" font-size="15" fill="#0F172A">ARR composition · Next 60 months</text>
    <g class="db-chart">
      <path class="db-line" d="M60,380 L130,360 L200,335 L270,300 L340,258 L410,215 L475,170" fill="none" stroke="#0055B3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="db-area" d="M60,380 L130,360 L200,335 L270,300 L340,258 L410,215 L475,170 L475,395 L60,395 Z" fill="url(#db-area)"/>
      <g class="db-pts">
        <circle cx="60" cy="380" r="4" fill="#0055B3"/>
        <circle cx="130" cy="360" r="4" fill="#0055B3"/>
        <circle cx="200" cy="335" r="4" fill="#0055B3"/>
        <circle cx="270" cy="300" r="4" fill="#0055B3"/>
        <circle cx="340" cy="258" r="4" fill="#9A1FB5"/>
        <circle cx="410" cy="215" r="4" fill="#9A1FB5"/>
        <circle cx="475" cy="170" r="6" fill="#E61A85"/>
      </g>
    </g>
    <rect x="520" y="220" width="240" height="200" rx="12" fill="#FFFFFF" stroke="rgba(15,23,42,0.08)"/>
    <text x="540" y="248" font-family="Rajdhani,sans-serif" font-weight="700" font-size="15" fill="#0F172A">Top scouts · Live feed</text>
    <g class="db-list">
      <g class="db-row r1"><circle cx="555" cy="278" r="10" fill="#0055B3"/><text x="552" y="282" font-family="Rajdhani" font-weight="700" font-size="11" fill="#fff">14</text><text x="575" y="275" font-family="Inter" font-size="11" font-weight="600" fill="#0F172A">Cadete · LB</text><text x="575" y="289" font-family="Inter" font-size="10" fill="#64748B">Score 86.4 · Talent+</text><circle cx="740" cy="280" r="4" fill="#0FA968"/></g>
      <g class="db-row r2"><circle cx="555" cy="318" r="10" fill="#9A1FB5"/><text x="552" y="322" font-family="Rajdhani" font-weight="700" font-size="11" fill="#fff">09</text><text x="575" y="315" font-family="Inter" font-size="11" font-weight="600" fill="#0F172A">Juvenil · AM</text><text x="575" y="329" font-family="Inter" font-size="10" fill="#64748B">Score 81.7 · Rising</text><circle cx="740" cy="320" r="4" fill="#0FA968"/></g>
      <g class="db-row r3"><circle cx="555" cy="358" r="10" fill="#E61A85"/><text x="552" y="362" font-family="Rajdhani" font-weight="700" font-size="11" fill="#fff">22</text><text x="575" y="355" font-family="Inter" font-size="11" font-weight="600" fill="#0F172A">Infantil · ST</text><text x="575" y="369" font-family="Inter" font-size="10" fill="#64748B">Score 78.2 · PHV peak</text><circle cx="740" cy="360" r="4" fill="#D9A10F"/></g>
      <g class="db-row r4"><circle cx="555" cy="398" r="10" fill="#D9A10F"/><text x="552" y="402" font-family="Rajdhani" font-weight="700" font-size="11" fill="#fff">05</text><text x="575" y="395" font-family="Inter" font-size="11" font-weight="600" fill="#0F172A">Cadete · CB</text><text x="575" y="409" font-family="Inter" font-size="10" fill="#64748B">Score 74.9 · Steady</text><circle cx="740" cy="400" r="4" fill="#0FA968"/></g>
    </g>
  </svg>
</div>`,

  // PHV curve — crecimiento físico animado
  phv: ({ label = 'PHV Engine', sub = 'Peak Height Velocity · growth prediction' } = {}) => `
<div class="vid-hero" data-type="phv">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
    <div class="vid-metrics">
      <span class="vid-m"><b>13.2y</b><em>Current age</em></span>
      <span class="vid-m"><b>+8.4 cm</b><em>Δ 12 months</em></span>
      <span class="vid-m"><b>PEAK</b><em>Load -25%</em></span>
    </div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="phv-bg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#F7FAFE"/><stop offset="100%" stop-color="#E2EAF6"/></linearGradient>
      <linearGradient id="phv-curve" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#0F857A"/><stop offset="50%" stop-color="#0055B3"/><stop offset="80%" stop-color="#D9A10F"/><stop offset="100%" stop-color="#E61A85"/></linearGradient>
      <linearGradient id="phv-area" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="rgba(217,161,15,0.35)"/><stop offset="100%" stop-color="rgba(217,161,15,0)"/></linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#phv-bg)"/>
    <g stroke="rgba(15,23,42,0.06)" stroke-dasharray="3 4">
      <line x1="60" y1="90" x2="760" y2="90"/>
      <line x1="60" y1="170" x2="760" y2="170"/>
      <line x1="60" y1="250" x2="760" y2="250"/>
      <line x1="60" y1="330" x2="760" y2="330"/>
    </g>
    <g font-family="JetBrains Mono,monospace" font-size="10" fill="#64748B">
      <text x="20" y="94">12 cm/y</text><text x="20" y="174">9 cm/y</text><text x="20" y="254">6 cm/y</text><text x="20" y="334">3 cm/y</text>
    </g>
    <g font-family="JetBrains Mono,monospace" font-size="10" fill="#64748B">
      <text x="90" y="415">9y</text><text x="205" y="415">11y</text><text x="320" y="415">13y</text><text x="435" y="415">15y</text><text x="550" y="415">17y</text><text x="665" y="415">19y</text>
    </g>
    <rect x="300" y="50" width="120" height="340" rx="8" fill="rgba(217,161,15,0.08)" stroke="rgba(217,161,15,0.3)" stroke-dasharray="4 4"/>
    <text x="360" y="72" font-family="Rajdhani,sans-serif" font-weight="700" font-size="12" fill="#D9A10F" text-anchor="middle">PEAK PHV</text>
    <path id="phv-path" class="phv-curve" d="M60,370 Q130,355 180,340 Q240,315 300,240 Q360,90 420,110 Q490,195 560,260 Q640,310 750,330"
      fill="none" stroke="url(#phv-curve)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="phv-fill" d="M60,370 Q130,355 180,340 Q240,315 300,240 Q360,90 420,110 Q490,195 560,260 Q640,310 750,330 L750,400 L60,400 Z" fill="url(#phv-area)"/>
    <g class="phv-pts">
      <circle cx="60" cy="370" r="4" fill="#0F857A"/><circle cx="180" cy="340" r="4" fill="#0055B3"/>
      <circle cx="360" cy="90" r="7" fill="#D9A10F" class="phv-peak"/>
      <circle cx="420" cy="110" r="6" fill="#E61A85"/>
      <circle cx="560" cy="260" r="4" fill="#9A1FB5"/><circle cx="750" cy="330" r="4" fill="#0F857A"/>
    </g>
    <g class="phv-marker" font-family="Inter,sans-serif" font-size="11" font-weight="700">
      <rect x="310" y="25" width="100" height="22" rx="4" fill="#D9A10F"/>
      <text x="360" y="40" text-anchor="middle" fill="#fff">+12 cm/year</text>
    </g>
  </svg>
</div>`,

  // PARENT APP mock — app móvil de padres
  parent: ({ label = 'Parent Pro', sub = 'Family dashboard · live evaluation feed' } = {}) => `
<div class="vid-hero" data-type="parent">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pa-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FAF4FA"/><stop offset="100%" stop-color="#F0E1EF"/></linearGradient>
      <linearGradient id="pa-phone" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#F9F9FC"/></linearGradient>
      <linearGradient id="pa-title" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#E61A85"/><stop offset="100%" stop-color="#9A1FB5"/></linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#pa-bg)"/>
    <g class="pa-bubbles">
      <circle cx="120" cy="90" r="80" fill="rgba(230,26,133,0.08)" class="pa-b1"/>
      <circle cx="680" cy="360" r="100" fill="rgba(154,31,181,0.08)" class="pa-b2"/>
      <circle cx="720" cy="100" r="40" fill="rgba(15,133,122,0.1)" class="pa-b3"/>
    </g>
    <g transform="translate(300 40)">
      <rect x="0" y="0" width="200" height="380" rx="28" fill="url(#pa-phone)" stroke="rgba(15,23,42,0.12)" stroke-width="2" filter="drop-shadow(0 20px 40px rgba(154,31,181,0.2))"/>
      <rect x="70" y="10" width="60" height="14" rx="6" fill="#0F172A"/>
      <text x="20" y="55" font-family="Rajdhani,sans-serif" font-weight="700" font-size="14" fill="#0F172A">Hola, María</text>
      <text x="20" y="72" font-family="Inter,sans-serif" font-size="10" fill="#64748B">Tu hijo · Marco · Sub-14</text>
      <g class="pa-card pa-c1">
        <rect x="16" y="86" width="168" height="64" rx="10" fill="url(#pa-title)"/>
        <text x="30" y="106" font-family="Inter,sans-serif" font-size="9" fill="#fff" opacity="0.8">EVALUACIÓN MENSUAL</text>
        <text x="30" y="128" font-family="Rajdhani,sans-serif" font-weight="700" font-size="24" fill="#fff">86.4</text>
        <text x="90" y="128" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="#fff">▲ +4.2</text>
        <text x="30" y="144" font-family="Inter,sans-serif" font-size="9" fill="#fff" opacity="0.8">vs. mes anterior</text>
      </g>
      <g class="pa-card pa-c2">
        <rect x="16" y="162" width="80" height="60" rx="8" fill="#F3F6FC" stroke="rgba(15,23,42,0.06)"/>
        <text x="26" y="180" font-family="Inter,sans-serif" font-size="8" fill="#64748B">PHV</text>
        <text x="26" y="200" font-family="Rajdhani,sans-serif" font-weight="700" font-size="16" fill="#0055B3">Normal</text>
        <path d="M26,210 L40,206 L54,200 L68,195 L82,192" fill="none" stroke="#0055B3" stroke-width="1.5"/>
      </g>
      <g class="pa-card pa-c3">
        <rect x="104" y="162" width="80" height="60" rx="8" fill="#F3F6FC" stroke="rgba(15,23,42,0.06)"/>
        <text x="114" y="180" font-family="Inter,sans-serif" font-size="8" fill="#64748B">CUOTA</text>
        <text x="114" y="200" font-family="Rajdhani,sans-serif" font-weight="700" font-size="16" fill="#0FA968">Pagada</text>
        <text x="114" y="215" font-family="Inter,sans-serif" font-size="8" fill="#64748B">Nov 2026</text>
      </g>
      <g class="pa-card pa-c4">
        <rect x="16" y="232" width="168" height="56" rx="10" fill="#FFFFFF" stroke="rgba(15,23,42,0.06)"/>
        <circle cx="36" cy="260" r="10" fill="#D9A10F"/>
        <text x="50" y="256" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="#0F172A">Próximo partido</text>
        <text x="50" y="270" font-family="Inter,sans-serif" font-size="9" fill="#64748B">Sab 24 · 10:00 · Villarreal B</text>
      </g>
      <g class="pa-card pa-c5">
        <rect x="16" y="298" width="168" height="56" rx="10" fill="#FFFFFF" stroke="rgba(15,23,42,0.06)"/>
        <circle cx="36" cy="326" r="10" fill="#0F857A"/>
        <text x="50" y="322" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="#0F172A">Drill recomendado</text>
        <text x="50" y="336" font-family="Inter,sans-serif" font-size="9" fill="#64748B">Control orientado · 20 min</text>
      </g>
    </g>
    <g class="pa-badges">
      <g class="pa-badge pb1" transform="translate(60 200)">
        <rect x="0" y="0" width="150" height="40" rx="20" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>
        <circle cx="20" cy="20" r="8" fill="#0FA968"/>
        <text x="35" y="18" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="#0F172A">Convocatoria +1</text>
        <text x="35" y="31" font-family="Inter,sans-serif" font-size="9" fill="#64748B">Titular sábado</text>
      </g>
      <g class="pa-badge pb2" transform="translate(570 170)">
        <rect x="0" y="0" width="160" height="40" rx="20" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>
        <circle cx="20" cy="20" r="8" fill="#E61A85"/>
        <text x="35" y="18" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="#0F172A">Chat nuevo</text>
        <text x="35" y="31" font-family="Inter,sans-serif" font-size="9" fill="#64748B">Del preparador físico</text>
      </g>
      <g class="pa-badge pb3" transform="translate(590 280)">
        <rect x="0" y="0" width="145" height="40" rx="20" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>
        <circle cx="20" cy="20" r="8" fill="#0055B3"/>
        <text x="35" y="18" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="#0F172A">Galería +12 fotos</text>
        <text x="35" y="31" font-family="Inter,sans-serif" font-size="9" fill="#64748B">Partido pasado</text>
      </g>
    </g>
  </svg>
</div>`,

  // MAP de España con expansión FFCV / LATAM
  map: ({ label = 'FFCV · Scale', sub = '1,200 clubes · 85,000 federados · 3 provincias' } = {}) => `
<div class="vid-hero" data-type="map">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
    <div class="vid-metrics">
      <span class="vid-m"><b>Valencia</b><em>42K players</em></span>
      <span class="vid-m"><b>Alicante</b><em>28K players</em></span>
      <span class="vid-m"><b>Castellón</b><em>15K players</em></span>
    </div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mp-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#EEF4FC"/><stop offset="100%" stop-color="#DCE7F6"/></linearGradient>
      <radialGradient id="mp-pulse" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(217,161,15,0.6)"/><stop offset="70%" stop-color="rgba(217,161,15,0.15)"/><stop offset="100%" stop-color="rgba(217,161,15,0)"/></radialGradient>
    </defs>
    <rect width="800" height="450" fill="url(#mp-bg)"/>
    <!-- España silueta estilizada -->
    <path d="M120,140 Q100,180 110,220 Q115,260 140,300 Q180,340 230,360 Q290,375 350,370 Q420,360 480,340 Q560,320 620,290 Q690,250 710,200 Q715,160 680,130 Q620,100 540,95 Q440,92 340,95 Q250,100 180,115 Q140,125 120,140 Z" fill="#FFFFFF" stroke="rgba(15,23,42,0.18)" stroke-width="1.5"/>
    <!-- Comunidad Valenciana destacada -->
    <path d="M575,190 Q590,200 595,220 Q600,240 595,260 Q590,280 580,295 Q565,310 555,300 Q545,285 548,260 Q552,230 560,210 Q568,195 575,190 Z" fill="rgba(217,161,15,0.18)" stroke="#D9A10F" stroke-width="2"/>
    <!-- Pulse circles Valencia -->
    <circle cx="575" cy="240" r="70" fill="url(#mp-pulse)" class="mp-pulse mp1"/>
    <circle cx="575" cy="240" r="50" fill="url(#mp-pulse)" class="mp-pulse mp2"/>
    <!-- Dots de clubes -->
    <g class="mp-dots">
      <circle cx="575" cy="220" r="5" fill="#D9A10F" class="mp-d" style="--d:0s"/>
      <circle cx="580" cy="240" r="5" fill="#D9A10F" class="mp-d" style="--d:0.2s"/>
      <circle cx="565" cy="255" r="5" fill="#0055B3" class="mp-d" style="--d:0.4s"/>
      <circle cx="585" cy="265" r="5" fill="#9A1FB5" class="mp-d" style="--d:0.6s"/>
      <circle cx="555" cy="270" r="5" fill="#E61A85" class="mp-d" style="--d:0.8s"/>
      <circle cx="570" cy="285" r="5" fill="#0F857A" class="mp-d" style="--d:1s"/>
      <circle cx="590" cy="210" r="5" fill="#D9A10F" class="mp-d" style="--d:1.2s"/>
      <circle cx="560" cy="215" r="5" fill="#0055B3" class="mp-d" style="--d:1.4s"/>
    </g>
    <!-- Líneas de conexión que emanan -->
    <g class="mp-lines" stroke="rgba(217,161,15,0.3)" fill="none" stroke-width="1.5">
      <path class="mp-line l1" d="M575,240 Q500,150 350,120"/>
      <path class="mp-line l2" d="M575,240 Q450,280 250,330"/>
      <path class="mp-line l3" d="M575,240 Q640,180 700,140"/>
      <path class="mp-line l4" d="M575,240 Q680,300 720,380"/>
    </g>
    <!-- Labels -->
    <g class="mp-labels" font-family="Rajdhani,sans-serif" font-weight="700" font-size="14">
      <g class="mp-lb lb1">
        <rect x="535" y="195" width="100" height="60" rx="8" fill="#D9A10F"/>
        <text x="585" y="214" text-anchor="middle" fill="#fff" font-size="11" font-weight="600" letter-spacing="1">COMUNIDAD</text>
        <text x="585" y="230" text-anchor="middle" fill="#fff">VALENCIANA</text>
        <text x="585" y="248" text-anchor="middle" fill="#fff" font-family="JetBrains Mono" font-size="14">85,000</text>
      </g>
    </g>
    <!-- KPIs flotantes -->
    <g class="mp-chip mc1" transform="translate(120 100)">
      <rect x="0" y="0" width="130" height="36" rx="18" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>
      <circle cx="18" cy="18" r="7" fill="#D9A10F"/>
      <text x="32" y="16" font-family="Inter" font-size="10" font-weight="700" fill="#0F172A">Valencia</text>
      <text x="32" y="28" font-family="Inter" font-size="9" fill="#64748B">42,000 federados</text>
    </g>
    <g class="mp-chip mc2" transform="translate(630 360)">
      <rect x="0" y="0" width="130" height="36" rx="18" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>
      <circle cx="18" cy="18" r="7" fill="#0055B3"/>
      <text x="32" y="16" font-family="Inter" font-size="10" font-weight="700" fill="#0F172A">Alicante</text>
      <text x="32" y="28" font-family="Inter" font-size="9" fill="#64748B">28,000 federados</text>
    </g>
    <g class="mp-chip mc3" transform="translate(120 350)">
      <rect x="0" y="0" width="130" height="36" rx="18" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>
      <circle cx="18" cy="18" r="7" fill="#9A1FB5"/>
      <text x="32" y="16" font-family="Inter" font-size="10" font-weight="700" fill="#0F172A">Castellón</text>
      <text x="32" y="28" font-family="Inter" font-size="9" fill="#64748B">15,000 federados</text>
    </g>
  </svg>
</div>`,

  // AI red neuronal procesando video/datos
  ai: ({ label = 'AI Pipeline', sub = 'Multi-modal intelligence · 7 models' } = {}) => `
<div class="vid-hero" data-type="ai">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
    <div class="vid-metrics">
      <span class="vid-m"><b>Claude 4.7</b><em>Reasoning</em></span>
      <span class="vid-m"><b>Gemini 2.5</b><em>Video</em></span>
      <span class="vid-m"><b>Voyage</b><em>Embeddings</em></span>
    </div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ai-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F6F8FC"/><stop offset="100%" stop-color="#E4ECF8"/></linearGradient>
      <linearGradient id="ai-line" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="rgba(0,85,179,0.7)"/><stop offset="100%" stop-color="rgba(154,31,181,0.7)"/></linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#ai-bg)"/>
    <!-- Input nodes (datos) -->
    <g class="ai-input">
      <rect x="40" y="90" width="110" height="36" rx="18" fill="#FFFFFF" stroke="#0055B3" stroke-width="1.5"/>
      <text x="95" y="113" text-anchor="middle" font-family="Inter" font-size="11" font-weight="700" fill="#0055B3">Video 4K</text>
      <rect x="40" y="160" width="110" height="36" rx="18" fill="#FFFFFF" stroke="#9A1FB5" stroke-width="1.5"/>
      <text x="95" y="183" text-anchor="middle" font-family="Inter" font-size="11" font-weight="700" fill="#9A1FB5">Scouting data</text>
      <rect x="40" y="230" width="110" height="36" rx="18" fill="#FFFFFF" stroke="#0F857A" stroke-width="1.5"/>
      <text x="95" y="253" text-anchor="middle" font-family="Inter" font-size="11" font-weight="700" fill="#0F857A">PHV measures</text>
      <rect x="40" y="300" width="110" height="36" rx="18" fill="#FFFFFF" stroke="#D9A10F" stroke-width="1.5"/>
      <text x="95" y="323" text-anchor="middle" font-family="Inter" font-size="11" font-weight="700" fill="#D9A10F">Match events</text>
    </g>
    <!-- Hidden layers -->
    <g class="ai-hidden">
      <circle cx="280" cy="120" r="12" fill="#0055B3" class="ai-node n1"/>
      <circle cx="280" cy="180" r="12" fill="#0055B3" class="ai-node n2"/>
      <circle cx="280" cy="240" r="12" fill="#0055B3" class="ai-node n3"/>
      <circle cx="280" cy="300" r="12" fill="#0055B3" class="ai-node n4"/>
      <circle cx="400" cy="100" r="12" fill="#9A1FB5" class="ai-node n5"/>
      <circle cx="400" cy="170" r="12" fill="#9A1FB5" class="ai-node n6"/>
      <circle cx="400" cy="240" r="12" fill="#9A1FB5" class="ai-node n7"/>
      <circle cx="400" cy="310" r="12" fill="#9A1FB5" class="ai-node n8"/>
      <circle cx="400" cy="380" r="12" fill="#9A1FB5" class="ai-node n9"/>
      <circle cx="520" cy="150" r="12" fill="#E61A85" class="ai-node n10"/>
      <circle cx="520" cy="220" r="12" fill="#E61A85" class="ai-node n11"/>
      <circle cx="520" cy="290" r="12" fill="#E61A85" class="ai-node n12"/>
    </g>
    <!-- Output -->
    <g class="ai-output">
      <rect x="630" y="120" width="130" height="36" rx="10" fill="#0055B3"/>
      <text x="695" y="143" text-anchor="middle" font-family="Rajdhani" font-weight="700" font-size="13" fill="#fff">Talent Score</text>
      <rect x="630" y="180" width="130" height="36" rx="10" fill="#9A1FB5"/>
      <text x="695" y="203" text-anchor="middle" font-family="Rajdhani" font-weight="700" font-size="13" fill="#fff">Tactical Fit</text>
      <rect x="630" y="240" width="130" height="36" rx="10" fill="#E61A85"/>
      <text x="695" y="263" text-anchor="middle" font-family="Rajdhani" font-weight="700" font-size="13" fill="#fff">Injury Risk</text>
      <rect x="630" y="300" width="130" height="36" rx="10" fill="#D9A10F"/>
      <text x="695" y="323" text-anchor="middle" font-family="Rajdhani" font-weight="700" font-size="13" fill="#fff">Dev. Roadmap</text>
    </g>
    <!-- Lines -->
    <g class="ai-lines" stroke="url(#ai-line)" fill="none" stroke-width="1" opacity="0.5">
      <line x1="150" y1="108" x2="268" y2="120"/><line x1="150" y1="108" x2="268" y2="180"/><line x1="150" y1="108" x2="268" y2="240"/>
      <line x1="150" y1="178" x2="268" y2="120"/><line x1="150" y1="178" x2="268" y2="180"/><line x1="150" y1="178" x2="268" y2="240"/><line x1="150" y1="178" x2="268" y2="300"/>
      <line x1="150" y1="248" x2="268" y2="180"/><line x1="150" y1="248" x2="268" y2="240"/><line x1="150" y1="248" x2="268" y2="300"/>
      <line x1="150" y1="318" x2="268" y2="240"/><line x1="150" y1="318" x2="268" y2="300"/>
      <line x1="292" y1="120" x2="388" y2="100"/><line x1="292" y1="120" x2="388" y2="170"/>
      <line x1="292" y1="180" x2="388" y2="170"/><line x1="292" y1="180" x2="388" y2="240"/>
      <line x1="292" y1="240" x2="388" y2="240"/><line x1="292" y1="240" x2="388" y2="310"/>
      <line x1="292" y1="300" x2="388" y2="310"/><line x1="292" y1="300" x2="388" y2="380"/>
      <line x1="412" y1="100" x2="508" y2="150"/><line x1="412" y1="170" x2="508" y2="150"/><line x1="412" y1="170" x2="508" y2="220"/>
      <line x1="412" y1="240" x2="508" y2="220"/><line x1="412" y1="240" x2="508" y2="290"/>
      <line x1="412" y1="310" x2="508" y2="290"/><line x1="412" y1="380" x2="508" y2="290"/>
      <line x1="532" y1="150" x2="628" y2="138"/>
      <line x1="532" y1="220" x2="628" y2="198"/>
      <line x1="532" y1="290" x2="628" y2="258"/>
      <line x1="532" y1="290" x2="628" y2="318"/>
    </g>
    <!-- Data packets flowing -->
    <g class="ai-packets">
      <circle r="4" fill="#0055B3" class="ai-pkt p1"><animateMotion dur="3s" repeatCount="indefinite" path="M150,108 L280,180 L400,240 L520,220 L695,198"/></circle>
      <circle r="4" fill="#9A1FB5" class="ai-pkt p2"><animateMotion dur="3s" repeatCount="indefinite" begin="0.6s" path="M150,178 L280,180 L400,170 L520,150 L695,138"/></circle>
      <circle r="4" fill="#E61A85" class="ai-pkt p3"><animateMotion dur="3s" repeatCount="indefinite" begin="1.2s" path="M150,248 L280,240 L400,310 L520,290 L695,258"/></circle>
      <circle r="4" fill="#D9A10F" class="ai-pkt p4"><animateMotion dur="3s" repeatCount="indefinite" begin="1.8s" path="M150,318 L280,300 L400,310 L520,290 L695,318"/></circle>
    </g>
  </svg>
</div>`,

  // SCENARIOS 3 líneas divergentes
  scenarios: ({ label = '3 Scenarios', sub = 'Conservador · Realista · Agresivo · Y1→Y5' } = {}) => `
<div class="vid-hero" data-type="scenarios">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
    <div class="vid-metrics">
      <span class="vid-m" style="color:#D9A10F"><b>€4.8M</b><em>Conservador</em></span>
      <span class="vid-m" style="color:#0055B3"><b>€9.6M</b><em>Realista</em></span>
      <span class="vid-m" style="color:#9A1FB5"><b>€18.2M</b><em>Agresivo</em></span>
    </div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sc-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F7FAFE"/><stop offset="100%" stop-color="#E2EAF6"/></linearGradient>
      <linearGradient id="sc-area-agg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="rgba(154,31,181,0.25)"/><stop offset="100%" stop-color="rgba(154,31,181,0)"/></linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#sc-bg)"/>
    <g stroke="rgba(15,23,42,0.06)" stroke-dasharray="3 4">
      <line x1="80" y1="100" x2="760" y2="100"/><line x1="80" y1="170" x2="760" y2="170"/>
      <line x1="80" y1="240" x2="760" y2="240"/><line x1="80" y1="310" x2="760" y2="310"/>
    </g>
    <g font-family="JetBrains Mono" font-size="10" fill="#64748B">
      <text x="30" y="104">€20M</text><text x="30" y="174">€15M</text><text x="30" y="244">€10M</text><text x="30" y="314">€5M</text><text x="30" y="384">€1M</text>
    </g>
    <g font-family="JetBrains Mono" font-size="10" fill="#64748B" font-weight="600">
      <text x="100" y="410">Y1</text><text x="240" y="410">Y2</text><text x="380" y="410">Y3</text><text x="520" y="410">Y4</text><text x="660" y="410">Y5</text>
    </g>
    <!-- Línea Agresivo -->
    <path class="sc-line sc-agg-area" d="M100,385 L240,340 L380,250 L520,150 L660,80 L660,400 L100,400 Z" fill="url(#sc-area-agg)"/>
    <path class="sc-line sc-agg" d="M100,385 L240,340 L380,250 L520,150 L660,80" fill="none" stroke="#9A1FB5" stroke-width="3.5" stroke-linecap="round"/>
    <!-- Línea Realista -->
    <path class="sc-line sc-real" d="M100,388 L240,365 L380,305 L520,240 L660,170" fill="none" stroke="#0055B3" stroke-width="3.5" stroke-linecap="round"/>
    <!-- Línea Conservador -->
    <path class="sc-line sc-cons" d="M100,390 L240,380 L380,350 L520,310 L660,270" fill="none" stroke="#D9A10F" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="6 4"/>
    <!-- Endpoints -->
    <g class="sc-pts">
      <circle cx="660" cy="80" r="7" fill="#9A1FB5" class="sc-pt"/>
      <circle cx="660" cy="170" r="7" fill="#0055B3" class="sc-pt"/>
      <circle cx="660" cy="270" r="7" fill="#D9A10F" class="sc-pt"/>
    </g>
    <!-- Labels -->
    <g class="sc-lbl" font-family="Inter" font-size="11" font-weight="700">
      <rect x="675" y="68" width="90" height="24" rx="4" fill="#9A1FB5"/><text x="720" y="85" text-anchor="middle" fill="#fff">Agresivo · 25%</text>
      <rect x="675" y="158" width="90" height="24" rx="4" fill="#0055B3"/><text x="720" y="175" text-anchor="middle" fill="#fff">Realista · 60%</text>
      <rect x="675" y="258" width="90" height="24" rx="4" fill="#D9A10F"/><text x="720" y="275" text-anchor="middle" fill="#fff">Cons. · 55%</text>
    </g>
  </svg>
</div>`,

  // RIVAL / Competitive radar
  rival: ({ label = 'Competitive analysis', sub = 'VITAS vs. Wyscout · InStat · Hudl · Once Eleven' } = {}) => `
<div class="vid-hero" data-type="rival">
  <div class="vid-overlay">
    <div class="vid-chip"><span class="vid-dot"></span>LIVE · ${label}</div>
    <div class="vid-title">${sub}</div>
  </div>
  <svg class="vid-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="rv-bg" cx="50%" cy="50%" r="65%"><stop offset="0%" stop-color="#F9FBFE"/><stop offset="100%" stop-color="#DDE8F6"/></radialGradient>
    </defs>
    <rect width="800" height="450" fill="url(#rv-bg)"/>
    <!-- Hexágono radar -->
    <g transform="translate(400 230)" stroke="rgba(15,23,42,0.1)" fill="none">
      <polygon points="0,-170 147,-85 147,85 0,170 -147,85 -147,-85"/>
      <polygon points="0,-140 121,-70 121,70 0,140 -121,70 -121,-70"/>
      <polygon points="0,-110 95,-55 95,55 0,110 -95,55 -95,-55"/>
      <polygon points="0,-80 69,-40 69,40 0,80 -69,40 -69,-40"/>
      <polygon points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25"/>
      <line x1="0" y1="0" x2="0" y2="-170"/><line x1="0" y1="0" x2="147" y2="-85"/><line x1="0" y1="0" x2="147" y2="85"/>
      <line x1="0" y1="0" x2="0" y2="170"/><line x1="0" y1="0" x2="-147" y2="85"/><line x1="0" y1="0" x2="-147" y2="-85"/>
    </g>
    <!-- Área competidor promedio -->
    <g transform="translate(400 230)" class="rv-comp">
      <polygon points="0,-70 78,-45 54,31 0,56 -54,31 -78,-45" fill="rgba(100,116,139,0.25)" stroke="#64748B" stroke-width="2"/>
    </g>
    <!-- Área VITAS -->
    <g transform="translate(400 230)" class="rv-vitas">
      <polygon points="0,-160 140,-82 135,78 0,158 -138,82 -138,-80" fill="rgba(0,85,179,0.25)" stroke="#0055B3" stroke-width="3"/>
      <circle cx="0" cy="-160" r="6" fill="#0055B3"/><circle cx="140" cy="-82" r="6" fill="#0055B3"/>
      <circle cx="135" cy="78" r="6" fill="#0055B3"/><circle cx="0" cy="158" r="6" fill="#0055B3"/>
      <circle cx="-138" cy="82" r="6" fill="#0055B3"/><circle cx="-138" cy="-80" r="6" fill="#0055B3"/>
    </g>
    <!-- Labels de ejes -->
    <g font-family="Rajdhani" font-weight="700" font-size="13" fill="#0F172A">
      <text x="400" y="48" text-anchor="middle">Scouting IA</text>
      <text x="580" y="145" text-anchor="middle">Video IA</text>
      <text x="580" y="330" text-anchor="middle">PHV</text>
      <text x="400" y="420" text-anchor="middle">B2B2C Padres</text>
      <text x="220" y="330" text-anchor="middle">RAG técnico</text>
      <text x="220" y="145" text-anchor="middle">Precio/valor</text>
    </g>
    <!-- Legend -->
    <g transform="translate(40 40)">
      <rect x="0" y="0" width="180" height="60" rx="10" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>
      <circle cx="16" cy="22" r="6" fill="#0055B3"/>
      <text x="30" y="26" font-family="Inter" font-size="12" font-weight="700" fill="#0055B3">VITAS · 9.2/10</text>
      <circle cx="16" cy="44" r="6" fill="#64748B"/>
      <text x="30" y="48" font-family="Inter" font-size="12" font-weight="600" fill="#64748B">Competidor medio · 4.8/10</text>
    </g>
    <!-- Score badges animados -->
    <g class="rv-badges" font-family="JetBrains Mono" font-size="11" font-weight="700">
      <g class="rv-b b1" transform="translate(360 25)">
        <rect x="0" y="0" width="80" height="24" rx="12" fill="#0FA968"/>
        <text x="40" y="16" text-anchor="middle" fill="#fff">9.4/10</text>
      </g>
    </g>
  </svg>
</div>`,
};

// ============================================================
// MAPEO: YouTube ID → tipo de animación
// ============================================================
const VIDEO_MAPPING = {
  'Bhen4AVupS8': 'radar',      // Overview VITAS
  'jvZQeGMAHY4': 'dashboard',  // Product tour
  'rlR4PJn8b8I': 'ai',         // AI pipeline
  'w3WluaCNO9o': 'rival',      // Competencia
  '9uhjrYgcEBY': 'phv',        // PHV moat
  'fvxDZVTrCps': 'parent',     // Parents B2B2C
  'sXQxhojSdZM': 'scenarios',  // Escenarios
  'aAhp_p8e_LA': 'map',        // LATAM / testimonial
};

// ============================================================
// CSS COMÚN para los "videos"
// ============================================================
const VIDEO_CSS = `
.vid-hero{position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(15,23,42,0.08);margin:20px 0 40px;aspect-ratio:16/9;background:#F6F8FC;box-shadow:0 24px 48px -18px rgba(0,85,179,0.25),0 6px 16px -8px rgba(154,31,181,0.12)}
.vid-svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.vid-overlay{position:absolute;inset:0;z-index:5;padding:22px;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;pointer-events:none;background:linear-gradient(180deg,rgba(15,23,42,0) 40%,rgba(15,23,42,0.08) 100%)}
.vid-chip{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.92);border:1px solid rgba(15,23,42,0.1);font-family:'Inter',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#0F172A;backdrop-filter:blur(8px)}
.vid-dot{width:8px;height:8px;border-radius:50%;background:#0FA968;box-shadow:0 0 0 0 rgba(15,169,104,0.6);animation:vid-ping 1.8s ease-out infinite}
@keyframes vid-ping{0%{box-shadow:0 0 0 0 rgba(15,169,104,0.6)}100%{box-shadow:0 0 0 12px rgba(15,169,104,0)}}
.vid-title{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:22px;color:#0F172A;line-height:1.15;max-width:520px;text-shadow:0 1px 12px rgba(255,255,255,0.7)}
.vid-metrics{display:flex;gap:14px;flex-wrap:wrap;margin-top:4px}
.vid-m{display:inline-flex;flex-direction:column;padding:8px 14px;border-radius:10px;background:rgba(255,255,255,0.92);border:1px solid rgba(15,23,42,0.08);backdrop-filter:blur(8px);font-family:'Inter',sans-serif}
.vid-m b{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:18px;color:#0055B3;line-height:1}
.vid-m em{font-style:normal;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;margin-top:3px}

/* RADAR animations */
.rdp{animation:rd-pulse 3s ease-out infinite;transform-origin:center;transform-box:fill-box}
.rdp2{animation-delay:1.5s}
@keyframes rd-pulse{0%{transform:scale(0.4);opacity:1}100%{transform:scale(1.8);opacity:0}}
.rd-sweep{animation:rd-rotate 6s linear infinite;transform-origin:400px 225px}
@keyframes rd-rotate{to{transform:translate(400px,225px) rotate(360deg)}}
.rd-dot{opacity:0;animation:rd-fade 4s ease-out infinite var(--d,0s);transform-origin:center;transform-box:fill-box}
@keyframes rd-fade{0%,10%{opacity:0;transform:scale(0.4)}15%{opacity:1;transform:scale(1.3)}40%,100%{opacity:0.85;transform:scale(1)}}
.rd-center{animation:rd-core 2s ease-in-out infinite}
@keyframes rd-core{0%,100%{r:6}50%{r:10}}
.rd-label{opacity:0;animation:rd-lbl 8s ease-in-out infinite}
.lb2{animation-delay:4s}
@keyframes rd-lbl{0%,5%,50%,100%{opacity:0;transform:translateY(-6px)}10%,40%{opacity:1;transform:translateY(0)}}

/* DASHBOARD animations */
.db-pulse circle{animation:vid-ping 1.8s ease-out infinite}
.db-line{stroke-dasharray:700;stroke-dashoffset:700;animation:db-draw 3s ease-out forwards infinite alternate}
.db-area{opacity:0;animation:db-fill 3s ease-out 0.5s forwards infinite alternate}
@keyframes db-draw{to{stroke-dashoffset:0}}
@keyframes db-fill{to{opacity:1}}
.db-pts circle{opacity:0;animation:db-pop 5s ease-out infinite}
.db-pts circle:nth-child(1){animation-delay:0.2s}.db-pts circle:nth-child(2){animation-delay:0.5s}
.db-pts circle:nth-child(3){animation-delay:0.8s}.db-pts circle:nth-child(4){animation-delay:1.1s}
.db-pts circle:nth-child(5){animation-delay:1.4s}.db-pts circle:nth-child(6){animation-delay:1.7s}
.db-pts circle:nth-child(7){animation-delay:2s}
@keyframes db-pop{0%,5%{opacity:0;transform:scale(0)}10%,80%{opacity:1;transform:scale(1)}100%{opacity:0.85}}
.db-row{opacity:0;animation:db-row-in 6s ease-out infinite;transform-origin:left}
.r2{animation-delay:0.6s}.r3{animation-delay:1.2s}.r4{animation-delay:1.8s}
@keyframes db-row-in{0%,5%{opacity:0;transform:translateX(-20px)}15%,90%{opacity:1;transform:translateX(0)}100%{opacity:0.9}}

/* PHV */
.phv-curve{stroke-dasharray:1200;stroke-dashoffset:1200;animation:phv-draw 4s ease-in-out infinite alternate}
@keyframes phv-draw{to{stroke-dashoffset:0}}
.phv-fill{opacity:0;animation:phv-fadein 4s ease-in-out 1s infinite alternate}
@keyframes phv-fadein{to{opacity:1}}
.phv-peak{animation:phv-peak 2s ease-in-out infinite}
@keyframes phv-peak{0%,100%{r:7}50%{r:11;filter:drop-shadow(0 0 8px #D9A10F)}}
.phv-marker{animation:phv-marker 4s ease-in-out infinite}
@keyframes phv-marker{0%,20%{opacity:0;transform:translateY(10px)}30%,80%{opacity:1;transform:translateY(0)}100%{opacity:0}}

/* PARENT APP */
.pa-bubbles circle{animation:pa-float 6s ease-in-out infinite}
.pa-b2{animation-delay:2s}.pa-b3{animation-delay:4s}
@keyframes pa-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.pa-card{opacity:0;animation:pa-card-in 5s ease-out infinite}
.pa-c1{animation-delay:0.3s}.pa-c2{animation-delay:0.7s}.pa-c3{animation-delay:1s}.pa-c4{animation-delay:1.3s}.pa-c5{animation-delay:1.6s}
@keyframes pa-card-in{0%,5%{opacity:0;transform:translateY(10px)}15%,90%{opacity:1;transform:translateY(0)}100%{opacity:0.95}}
.pa-badge{opacity:0;animation:pa-badge-in 7s ease-in-out infinite}
.pb1{animation-delay:2s}.pb2{animation-delay:3.2s}.pb3{animation-delay:4.4s}
@keyframes pa-badge-in{0%,10%{opacity:0;transform:translateY(20px) scale(0.9)}18%,85%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-8px)}}

/* MAP */
.mp-pulse{animation:rd-pulse 3s ease-out infinite;transform-origin:575px 240px;transform-box:fill-box}
.mp2{animation-delay:1.5s}
.mp-d{opacity:0;animation:rd-fade 4s ease-out infinite var(--d,0s)}
.mp-line{stroke-dasharray:300;stroke-dashoffset:300;animation:mp-draw 4s ease-out infinite}
.l2{animation-delay:0.8s}.l3{animation-delay:1.6s}.l4{animation-delay:2.4s}
@keyframes mp-draw{0%{stroke-dashoffset:300}60%{stroke-dashoffset:0}100%{stroke-dashoffset:0;opacity:0.3}}
.mp-chip{opacity:0;animation:pa-badge-in 8s ease-in-out infinite}
.mc1{animation-delay:1s}.mc2{animation-delay:2.5s}.mc3{animation-delay:4s}

/* AI */
.ai-node{animation:ai-pulse 2s ease-in-out infinite}
.n2{animation-delay:0.1s}.n3{animation-delay:0.2s}.n4{animation-delay:0.3s}.n5{animation-delay:0.4s}
.n6{animation-delay:0.5s}.n7{animation-delay:0.6s}.n8{animation-delay:0.7s}.n9{animation-delay:0.8s}
.n10{animation-delay:0.9s}.n11{animation-delay:1s}.n12{animation-delay:1.1s}
@keyframes ai-pulse{0%,100%{r:12;opacity:0.7}50%{r:15;opacity:1}}

/* SCENARIOS */
.sc-line{stroke-dasharray:900;stroke-dashoffset:900;animation:sc-draw 3.5s ease-out infinite alternate}
.sc-real{animation-delay:0.3s}.sc-agg{animation-delay:0.6s}
@keyframes sc-draw{to{stroke-dashoffset:0}}
.sc-pt{opacity:0;animation:db-pop 4s ease-out 2s infinite}
.sc-pt:nth-child(2){animation-delay:2.3s}.sc-pt:nth-child(3){animation-delay:2.6s}

/* RIVAL */
.rv-vitas polygon{animation:rv-scale 3s ease-out infinite alternate;transform-origin:center;transform-box:fill-box}
@keyframes rv-scale{from{transform:scale(0.3);opacity:0.4}to{transform:scale(1);opacity:1}}
.rv-badges .rv-b{opacity:0;animation:pa-badge-in 5s ease-in-out infinite 1.5s}

@media (prefers-reduced-motion:reduce){
  *{animation-duration:0.01s!important;animation-iteration-count:1!important}
}
`;

// ============================================================
// TRANSFORMACIONES
// ============================================================
function applyLightPalette(html){
  // 1) Reemplazar el bloque :root completo (si coincide con el mío)
  html = html.replace(
    /:root\{[\s\S]*?--grad3?:[\s\S]*?\}/,
    LIGHT_VARS
  );
  // fallback: si no matcheó, inyectar al inicio del style
  if(!html.includes('--bg:#F4F7FB')){
    html = html.replace(/<style>/, `<style>\n${LIGHT_VARS}\n`);
  }

  // 2) Fondos oscuros generales
  html = html
    .replace(/background:#05070f/g,'background:#F4F7FB')
    .replace(/background:#0b1223/g,'background:#FFFFFF')
    .replace(/background:#03060d/g,'background:#FFFFFF')
    .replace(/#05070f/g,'#F4F7FB')
    .replace(/#0b1223/g,'#FFFFFF')
    .replace(/#03060d/g,'#FFFFFF')
    .replace(/rgba\(255,255,255,0\.04\)/g,'rgba(15,23,42,0.03)')
    .replace(/rgba\(255,255,255,0\.03\)/g,'rgba(15,23,42,0.02)')
    .replace(/rgba\(255,255,255,0\.02\)/g,'rgba(15,23,42,0.015)')
    .replace(/rgba\(255,255,255,0\.06\)/g,'rgba(15,23,42,0.04)')
    .replace(/rgba\(255,255,255,0\.08\)/g,'rgba(15,23,42,0.06)')
    .replace(/rgba\(255,255,255,0\.1\)/g,'rgba(15,23,42,0.08)')
    .replace(/rgba\(11,18,35,0\.85\)/g,'rgba(246,248,252,0.9)')
    .replace(/rgba\(11,18,35,0\.9\)/g,'rgba(246,248,252,0.95)')
    .replace(/rgba\(11,18,35,0\.8\)/g,'rgba(246,248,252,0.85)')
    .replace(/background:rgba\(5,7,15,0\.85\)/g,'background:rgba(246,248,252,0.9)');

  // 3) Colores de texto específicos
  html = html
    .replace(/color:#e7ecf7/g,'color:#0F172A')
    .replace(/color:#9aa5c4/g,'color:#475569')
    .replace(/color:#7a87a6/g,'color:#64748B')
    .replace(/color:#5c6784/g,'color:#64748B')
    .replace(/color:#FF6B8E/g,'color:#DC2626')
    .replace(/#7B8CFF/g,'#2B7BDE');

  // 4) Gradientes específicos de fondos
  html = html.replace(
    /linear-gradient\(180deg,rgba\(255,255,255,0\.04\),rgba\(255,255,255,0\.01\)\)/g,
    'linear-gradient(180deg,#FFFFFF,#F8FAFD)'
  );

  // 5) Colores vivos (migrar al tono más sobrio VITAS tema claro)
  html = html
    .replace(/#0066FF/g,'#0055B3')
    .replace(/#C025E0/g,'#9A1FB5')
    .replace(/#E1A20F/g,'#D9A10F')
    .replace(/#00B4C6/g,'#0F857A')
    .replace(/#18C27A/g,'#0FA968')
    .replace(/#FFB020/g,'#D97706')
    .replace(/#FF3D71/g,'#DC2626');

  // 6) Cambiar theme:'dark' de ApexCharts por 'light'
  html = html.replace(/theme:'dark'/g,"theme:'light'");
  html = html.replace(/theme:"dark"/g,'theme:"light"');

  // 7) Actualizar el objeto theme JS del <script>
  html = html.replace(
    /const theme=\{blue:'#[^']+',purple:'#[^']+',gold:'#[^']+',pink:'#[^']+',cyan:'#[^']+'/g,
    "const theme={blue:'#0055B3',purple:'#9A1FB5',gold:'#D9A10F',pink:'#E61A85',cyan:'#0F857A'"
  );
  html = html.replace(
    /muted:'#9aa5c4'/g, "muted:'#475569'"
  );
  html = html.replace(
    /grid:'rgba\(255,255,255,0\.08\)'/g, "grid:'rgba(15,23,42,0.08)'"
  );
  html = html.replace(
    /text:'#e7ecf7'/g, "text:'#0F172A'"
  );

  // 8) ApexCharts foreColor
  html = html.replace(/foreColor:theme\.text/g,'foreColor:"#0F172A"');

  // 9) Añadir CSS de videos animados si no está
  if(!html.includes('.vid-hero')){
    html = html.replace(/<\/style>/, `\n${VIDEO_CSS}\n</style>`);
  }

  return html;
}

function replaceYouTubeIframes(html){
  // Patrón: <div class="video-block">... iframe ... </div>
  // Reemplazar por el SVG correspondiente
  const iframeRe = /<div class="video-block">\s*<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]+)[^"]*"[^>]*><\/iframe>\s*<\/div>/g;
  html = html.replace(iframeRe, (_match, ytId) => {
    const type = VIDEO_MAPPING[ytId] || 'dashboard';
    return SVG_ANIMATIONS[type]();
  });
  // Fallback por si viene sin el wrapper
  const rawIframeRe = /<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]+)[^"]*"[^>]*><\/iframe>/g;
  html = html.replace(rawIframeRe, (_match, ytId) => {
    const type = VIDEO_MAPPING[ytId] || 'dashboard';
    return SVG_ANIMATIONS[type]();
  });
  return html;
}

function processFile(file){
  const fullPath = path.join(DOCS, file);
  let html = fs.readFileSync(fullPath, 'utf8');
  const before = html.length;
  html = applyLightPalette(html);
  html = replaceYouTubeIframes(html);
  fs.writeFileSync(fullPath, html, 'utf8');
  const after = html.length;
  console.log(`✔ ${file.padEnd(42)} ${before} → ${after} bytes`);
}

// Procesar todos los HTMLs
const files = fs.readdirSync(DOCS).filter(f => f.endsWith('.html'));
console.log(`\nTransformando ${files.length} archivos en ${DOCS}\n`);
for (const file of files) processFile(file);
console.log('\n✅ Terminado.');
