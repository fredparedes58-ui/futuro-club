#!/usr/bin/env python3
"""
VITAS · ETL FBref → Supabase players_indexed
Extrae stats por 90min de las principales ligas europeas.

Requisitos:
  pip install soccerdata httpx python-dotenv pandas

Uso:
  python scripts/etl_fbref.py
"""

import os
import sys
import hashlib
import time
from pathlib import Path

try:
    import soccerdata as sd
except ImportError:
    print("❌ Instala soccerdata: pip install soccerdata")
    sys.exit(1)

try:
    import httpx
except ImportError:
    print("❌ Instala httpx: pip install httpx")
    sys.exit(1)

try:
    import pandas as pd
except ImportError:
    print("❌ Instala pandas: pip install pandas")
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

# Ligas y temporadas a procesar
LEAGUES = [
    ("ESP-La Liga", "La Liga"),
    ("ENG-Premier League", "Premier League"),
    ("GER-Bundesliga", "Bundesliga"),
    ("ITA-Serie A", "Serie A"),
    ("FRA-Ligue 1", "Ligue 1"),
]

SEASONS = ["2324"]  # soccerdata usa formato "2324" para 2023-24

# Mapeo posición FBref → VITAS
POSITION_MAP = {
    "GK": "GK",
    "DF": "CB", "DF,MF": "CB", "DF,FW": "CB",
    "MF": "CM", "MF,DF": "CDM", "MF,FW": "CAM",
    "FW": "ST", "FW,MF": "ST", "FW,DF": "ST",
}


def clamp(val: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, val))


def safe_float(val, default=0.0) -> float:
    try:
        v = float(val)
        if pd.isna(v):
            return default
        return v
    except (ValueError, TypeError):
        return default


def make_id(name: str, league: str, season: str) -> str:
    raw = f"fbref_{name}_{league}_{season}".lower()
    return f"fb_{hashlib.md5(raw.encode()).hexdigest()[:12]}"


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


def process_league(league_code: str, league_name: str, season: str) -> list[dict]:
    """Procesa una liga de FBref y retorna filas."""
    season_display = f"20{season[:2]}-{season[2:]}"
    print(f"\n▸ {league_name} {season_display}")

    try:
        fbref = sd.FBref(leagues=[league_code], seasons=[season])
    except Exception as e:
        print(f"  ⚠️ Error inicializando FBref: {e}")
        return []

    # Obtener stats estándar
    try:
        print("  Descargando stats estándar...")
        stats = fbref.read_player_season_stats(stat_type="standard")
        time.sleep(4)  # Rate limiting FBref
    except Exception as e:
        print(f"  ⚠️ Error obteniendo stats: {e}")
        return []

    if stats is None or stats.empty:
        print("  ⚠️ Sin datos")
        return []

    # Intentar stats de tiro
    shooting = None
    try:
        print("  Descargando stats de tiro...")
        shooting = fbref.read_player_season_stats(stat_type="shooting")
        time.sleep(4)
    except Exception:
        print("  ⚠️ Stats de tiro no disponibles")

    # Intentar stats de pase
    passing = None
    try:
        print("  Descargando stats de pase...")
        passing = fbref.read_player_season_stats(stat_type="passing")
        time.sleep(4)
    except Exception:
        print("  ⚠️ Stats de pase no disponibles")

    # Intentar stats defensivas
    defense = None
    try:
        print("  Descargando stats defensivas...")
        defense = fbref.read_player_season_stats(stat_type="defense")
        time.sleep(4)
    except Exception:
        print("  ⚠️ Stats defensivas no disponibles")

    print(f"  Procesando {len(stats)} jugadores...")

    rows = []
    for idx in stats.index:
        try:
            row = stats.loc[idx]

            # Extraer nombre del jugador del índice
            if isinstance(idx, tuple):
                player_name = str(idx[-1]) if len(idx) > 0 else "Unknown"
            else:
                player_name = str(idx)

            if not player_name or player_name == "nan":
                continue

            # Stats básicas
            minutes = safe_float(row.get("Min", row.get("minutes", 0)))
            if minutes < 200:  # Mínimo 200 minutos
                continue

            goals = safe_float(row.get("Gls", 0))
            assists = safe_float(row.get("Ast", 0))
            age_raw = row.get("Age", None)
            age = int(safe_float(age_raw)) if age_raw else None
            pos_raw = str(row.get("Pos", "MF"))
            position = POSITION_MAP.get(pos_raw, "CM")
            team = str(row.get("Squad", "")) if "Squad" in row.index else ""
            nation = str(row.get("Nation", "")) if "Nation" in row.index else ""

            # Calcular métricas
            per90 = 90.0 / max(minutes, 1)

            # Shooting metrics
            xg = 0.0
            shots = 0.0
            if shooting is not None:
                try:
                    sh_row = shooting.loc[idx]
                    xg = safe_float(sh_row.get("xG", sh_row.get("npxG", 0)))
                    shots = safe_float(sh_row.get("Sh", 0))
                except (KeyError, TypeError):
                    pass
            xg_p90 = xg * per90
            shots_p90 = shots * per90

            # Passing metrics
            key_passes_p90 = 0.0
            pass_completion = 50.0
            xag = 0.0
            if passing is not None:
                try:
                    pa_row = passing.loc[idx]
                    key_passes_p90 = safe_float(pa_row.get("KP", 0)) * per90
                    pass_completion = safe_float(pa_row.get("Cmp%", 50))
                    xag = safe_float(pa_row.get("xAG", pa_row.get("xA", 0)))
                except (KeyError, TypeError):
                    pass

            # Defense metrics
            tackles_p90 = 0.0
            interceptions_p90 = 0.0
            if defense is not None:
                try:
                    df_row = defense.loc[idx]
                    tackles_p90 = safe_float(df_row.get("Tkl", 0)) * per90
                    interceptions_p90 = safe_float(df_row.get("Int", 0)) * per90
                except (KeyError, TypeError):
                    pass

            # Progressive distance (de stats estándar si existe)
            prog_dist = safe_float(row.get("PrgDist", row.get("PrgC", 0))) * per90

            # Calcular VSI metrics
            metric_shooting = clamp(xg_p90 * 150 + shots_p90 * 8)
            metric_vision = clamp(key_passes_p90 * 20 + xag * per90 * 80 + pass_completion * 0.3)
            metric_technique = clamp(goals * per90 * 50 + assists * per90 * 40 + 30)
            metric_defending = clamp((tackles_p90 + interceptions_p90) * 12)
            metric_stamina = clamp(minutes / (38 * 90) * 80 + 20)  # % de minutos posibles
            metric_speed = clamp(prog_dist * 0.4 + 20)

            vsi = round((metric_shooting + metric_vision + metric_technique +
                        metric_defending + metric_stamina + metric_speed) / 6, 1)

            raw_stats = {
                "minutes": minutes, "goals": goals, "assists": assists,
                "xg": round(xg, 2), "xag": round(xag, 2),
                "shots_p90": round(shots_p90, 2),
                "key_passes_p90": round(key_passes_p90, 2),
                "tackles_p90": round(tackles_p90, 2),
                "interceptions_p90": round(interceptions_p90, 2),
                "pass_completion": round(pass_completion, 1),
            }

            rows.append({
                "id": make_id(player_name, league_name, season_display),
                "source": "fbref",
                "name": player_name,
                "short_name": player_name.split()[-1] if " " in player_name else player_name,
                "position": position,
                "age": age,
                "nationality": nation[:3].upper() if nation else None,
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

        except Exception as e:
            continue  # Skip problematic players

    print(f"  Jugadores válidos: {len(rows)}")
    return rows


def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  VITAS · ETL FBref → Supabase                              ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    all_rows = []
    for league_code, league_name in LEAGUES:
        for season in SEASONS:
            rows = process_league(league_code, league_name, season)
            all_rows.extend(rows)
            # Rate limiting entre ligas
            if rows:
                print("  Esperando 10s para rate limiting...")
                time.sleep(10)

    print(f"\n{'='*60}")
    print(f"Total jugadores a insertar: {len(all_rows)}")

    if all_rows:
        upsert_batch(all_rows)

    print(f"\n🎉 ETL FBref completado. {len(all_rows)} jugadores indexados.")


if __name__ == "__main__":
    main()
