#!/usr/bin/env python3
"""
VITAS · ETL Understat → Supabase players_indexed
Extrae xG de tiros por jugador de las 6 ligas europeas principales.

Requisitos:
  pip install understat httpx aiohttp python-dotenv

Uso:
  python scripts/etl_understat.py
"""

import os
import sys
import json
import hashlib
import asyncio
from pathlib import Path

try:
    import understat
except ImportError:
    print("❌ Instala understat: pip install understat")
    sys.exit(1)

try:
    import httpx
except ImportError:
    print("❌ Instala httpx: pip install httpx")
    sys.exit(1)

try:
    import aiohttp
except ImportError:
    print("❌ Instala aiohttp: pip install aiohttp")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

# ── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env")
    sys.exit(1)

# Ligas disponibles en Understat
LEAGUES = [
    ("La_liga", "La Liga"),
    ("EPL", "Premier League"),
    ("Bundesliga", "Bundesliga"),
    ("Serie_A", "Serie A"),
    ("Ligue_1", "Ligue 1"),
    ("RFPL", "Russian Premier League"),
]

SEASON = 2023  # Understat usa años: 2023 = temporada 2023-24

POSITION_MAP = {
    "GK": "GK", "D": "CB", "D C": "CB", "D L": "LB", "D R": "RB",
    "M": "CM", "M C": "CM", "M L": "LW", "M R": "RW",
    "M S": "CAM", "AM": "CAM", "AM C": "CAM", "AM L": "LW", "AM R": "RW",
    "F": "ST", "F C": "ST", "F L": "LW", "F R": "RW",
    "S": "ST", "Sub": "CM",
}


def clamp(val: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, val))


def make_id(name: str, league: str, season: int) -> str:
    raw = f"understat_{name}_{league}_{season}".lower()
    return f"us_{hashlib.md5(raw.encode()).hexdigest()[:12]}"


def upsert_batch(rows: list[dict]):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/players_indexed"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    for i in range(0, len(rows), 50):
        chunk = rows[i : i + 50]
        r = httpx.post(url, json=chunk, headers=headers, timeout=30)
        if r.status_code >= 400:
            print(f"  ⚠️ Supabase error {r.status_code}: {r.text[:200]}")
        else:
            print(f"  ✅ Upsert {len(chunk)} jugadores OK")


def map_position(pos_str: str) -> str:
    """Mapea posición Understat a formato VITAS."""
    if not pos_str:
        return "CM"
    # Understat usa formato "M C, AM C" — tomar la primera
    primary = pos_str.split(",")[0].strip()
    return POSITION_MAP.get(primary, "CM")


async def process_league(league_code: str, league_name: str, season: int) -> list[dict]:
    """Procesa una liga de Understat."""
    season_display = f"{season}-{str(season + 1)[2:]}"
    print(f"\n▸ {league_name} {season_display}")

    try:
        async with aiohttp.ClientSession() as session:
            client = understat.Understat(session)
            players = await client.get_league_players(league_code, season)
    except Exception as e:
        print(f"  ⚠️ Error: {e}")
        return []

    if not players:
        print("  ⚠️ Sin datos")
        return []

    print(f"  Jugadores encontrados: {len(players)}")

    rows = []
    for p in players:
        try:
            name = p.get("player_name", "")
            if not name:
                continue

            games = int(p.get("games", 0))
            minutes = int(p.get("time", 0))
            if minutes < 200:
                continue

            per90 = 90.0 / max(minutes, 1)

            goals = int(p.get("goals", 0))
            assists = int(p.get("assists", 0))
            shots = int(p.get("shots", 0))
            xg = float(p.get("xG", 0))
            xag = float(p.get("xA", 0))
            npg = int(p.get("npg", goals))
            npxg = float(p.get("npxG", xg))
            key_passes = int(p.get("key_passes", 0))

            position = map_position(p.get("position", ""))
            team = p.get("team_title", "")

            # Métricas VSI
            xg_p90 = xg * per90
            xag_p90 = xag * per90
            shots_p90 = shots * per90
            kp_p90 = key_passes * per90

            metric_shooting = clamp(xg_p90 * 150 + shots_p90 * 8)
            metric_vision = clamp(kp_p90 * 20 + xag_p90 * 80)
            metric_technique = clamp(
                (goals * per90 * 50) + (assists * per90 * 40) +
                (float(p.get("xGChain", 0)) * per90 * 20) + 25
            )
            metric_defending = clamp(30)  # Understat no tiene datos defensivos
            metric_stamina = clamp(minutes / (games * 90) * 70 + 20) if games > 0 else 30
            metric_speed = clamp(35)  # Understat no tiene datos de velocidad

            # Ajustar defending/speed según posición
            if position in ("CB", "CDM", "RB", "LB"):
                metric_defending = clamp(metric_defending + 25)
            if position in ("LW", "RW", "ST"):
                metric_speed = clamp(metric_speed + 20)

            vsi = round((metric_shooting + metric_vision + metric_technique +
                        metric_defending + metric_stamina + metric_speed) / 6, 1)

            raw_stats = {
                "games": games, "minutes": minutes,
                "goals": goals, "assists": assists, "shots": shots,
                "xG": round(xg, 2), "xA": round(xag, 2),
                "npg": npg, "npxG": round(npxg, 2),
                "key_passes": key_passes,
                "xGChain": round(float(p.get("xGChain", 0)), 2),
                "xGBuildup": round(float(p.get("xGBuildup", 0)), 2),
            }

            rows.append({
                "id": make_id(name, league_name, season),
                "source": "understat",
                "name": name,
                "short_name": name.split()[-1] if " " in name else name,
                "position": position,
                "age": None,
                "nationality": None,
                "club": team,
                "league": league_name,
                "season": season_display,
                "metric_speed": round(metric_speed, 1),
                "metric_shooting": round(metric_shooting, 1),
                "metric_vision": round(metric_vision, 1),
                "metric_technique": round(metric_technique, 1),
                "metric_defending": round(metric_defending, 1),
                "metric_stamina": round(metric_stamina, 1),
                "vsi_estimated": vsi,
                "raw_stats": raw_stats,
            })

        except Exception:
            continue

    print(f"  Jugadores válidos: {len(rows)}")
    return rows


async def main_async():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  VITAS · ETL Understat → Supabase                          ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    all_rows = []
    for league_code, league_name in LEAGUES:
        rows = await process_league(league_code, league_name, SEASON)
        all_rows.extend(rows)

    print(f"\n{'='*60}")
    print(f"Total jugadores a insertar: {len(all_rows)}")

    if all_rows:
        upsert_batch(all_rows)

    print(f"\n🎉 ETL Understat completado. {len(all_rows)} jugadores indexados.")


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
