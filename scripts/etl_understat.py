#!/usr/bin/env python3
"""
VITAS - ETL Understat -> Supabase players_indexed
Extrae xG de tiros por jugador de las 6 ligas europeas principales.

Solo usa httpx (sin aiohttp ni libreria understat).
Parsea el JSON embebido en el HTML de Understat directamente.

Requisitos:
  pip install httpx python-dotenv

Uso:
  python scripts/etl_understat.py
"""

import os
import sys
import json
import re
import hashlib
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    print("ERROR: Instala httpx: pip install httpx")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

# -- Config --
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env")
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

SEASONS = [2023, 2022, 2024]  # 2023-24, 2022-23, 2024-25

POSITION_MAP = {
    "GK": "GK", "D": "CB", "D C": "CB", "D L": "LB", "D R": "RB",
    "M": "CM", "M C": "CM", "M L": "LW", "M R": "RW",
    "M S": "CAM", "AM": "CAM", "AM C": "CAM", "AM L": "LW", "AM R": "RW",
    "F": "ST", "F C": "ST", "F L": "LW", "F R": "RW",
    "S": "ST", "Sub": "CM",
}

# Defaults realistas por posicion (Understat NO tiene defending ni speed)
POSITION_DEFAULTS = {
    "GK":  {"defending": 75, "speed": 35},
    "CB":  {"defending": 75, "speed": 45},
    "RB":  {"defending": 62, "speed": 70},
    "LB":  {"defending": 62, "speed": 70},
    "CDM": {"defending": 70, "speed": 55},
    "CM":  {"defending": 55, "speed": 60},
    "CAM": {"defending": 40, "speed": 62},
    "LW":  {"defending": 35, "speed": 75},
    "RW":  {"defending": 35, "speed": 75},
    "ST":  {"defending": 30, "speed": 68},
}


def clamp(val: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, val))


def make_id(name: str, league: str, season: int) -> str:
    raw = f"understat_{name}_{league}_{season}".lower()
    return f"us_{hashlib.md5(raw.encode()).hexdigest()[:12]}"


def map_position(pos_str: str) -> str:
    if not pos_str:
        return "CM"
    primary = pos_str.split(",")[0].strip()
    return POSITION_MAP.get(primary, "CM")


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
            print(f"  [WARN] Supabase error {r.status_code}: {r.text[:200]}")
        else:
            print(f"  [OK] Upsert {len(chunk)} jugadores")


def fetch_league_players(league_code: str, season: int) -> list[dict]:
    """Fetch player data from Understat JSON API endpoint."""
    url = f"https://understat.com/getLeagueData/{league_code}/{season}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
    }

    try:
        r = httpx.get(url, headers=headers, timeout=30, follow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        print(f"  [WARN] HTTP error: {e}")
        return []

    try:
        data = r.json()
    except json.JSONDecodeError as e:
        print(f"  [WARN] JSON parse error: {e}")
        return []

    # API returns {"teams": {...}, "players": {...}, "dates": [...]}
    players_dict = data.get("players", {})
    if isinstance(players_dict, dict):
        return list(players_dict.values())
    elif isinstance(players_dict, list):
        return players_dict
    return []


def process_league(league_code: str, league_name: str, season: int) -> list[dict]:
    season_display = f"{season}-{str(season + 1)[2:]}"
    print(f"\n> {league_name} {season_display}")

    players = fetch_league_players(league_code, season)
    if not players:
        print("  Sin datos")
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

            # -- Metricas VSI (rebalanceadas) --
            xg_p90 = xg * per90
            xag_p90 = xag * per90
            shots_p90 = shots * per90
            kp_p90 = key_passes * per90
            xgchain_p90 = float(p.get("xGChain", 0)) * per90
            xgbuildup_p90 = float(p.get("xGBuildup", 0)) * per90

            # Metricas REALES (Understat tiene datos directos)
            metric_shooting = clamp(xg_p90 * 150 + shots_p90 * 8)
            metric_vision = clamp(kp_p90 * 20 + xag_p90 * 80)
            metric_stamina = clamp(minutes / (games * 90) * 70 + 20) if games > 0 else 50

            # Technique: xGChain = participacion en jugadas de gol
            # xGBuildup = contribucion en construccion — proxy de tecnica
            metric_technique = clamp(
                xgchain_p90 * 60 + xgbuildup_p90 * 40 +
                (goals + assists) * per90 * 30 + 35
            )

            # Metricas ESTIMADAS por posicion
            pos_defaults = POSITION_DEFAULTS.get(position, {"defending": 50, "speed": 55})
            metric_defending = pos_defaults["defending"]
            metric_speed = pos_defaults["speed"]

            # VSI ponderado: metricas reales pesan mas que estimadas
            # Reales (shooting, vision, stamina, technique) = 75%
            # Estimadas (defending, speed) = 25%
            vsi = round(
                (metric_shooting * 0.20 +
                 metric_vision * 0.20 +
                 metric_technique * 0.18 +
                 metric_stamina * 0.17 +
                 metric_defending * 0.12 +
                 metric_speed * 0.13), 1
            )

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

    print(f"  Jugadores validos: {len(rows)}")
    return rows


def main():
    print("=" * 60)
    print("  VITAS - ETL Understat -> Supabase")
    print("=" * 60)

    all_rows = []
    for league_code, league_name in LEAGUES:
        for season in SEASONS:
            rows = process_league(league_code, league_name, season)
            all_rows.extend(rows)
            # Rate limiting
            if rows:
                print("  Esperando 3s (rate limiting)...")
                time.sleep(3)

    print(f"\n{'='*60}")
    print(f"Total jugadores a insertar: {len(all_rows)}")

    if all_rows:
        upsert_batch(all_rows)

    print(f"\nETL Understat completado. {len(all_rows)} jugadores indexados.")


if __name__ == "__main__":
    main()
