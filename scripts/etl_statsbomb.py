#!/usr/bin/env python3
"""
VITAS · ETL StatsBomb Open Data → Supabase players_indexed
Extrae eventos de partidos gratuitos y calcula métricas VSI por jugador.

Requisitos:
  pip install statsbombpy httpx python-dotenv

Uso:
  python scripts/etl_statsbomb.py
"""

import os
import sys
import json
import math
import hashlib
from pathlib import Path
from collections import defaultdict

try:
    from statsbombpy import sb
except ImportError:
    print("❌ Instala statsbombpy: pip install statsbombpy")
    sys.exit(1)

try:
    import httpx
except ImportError:
    print("❌ Instala httpx: pip install httpx")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    # Cargar .env del proyecto
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass  # Sin dotenv, usa variables de entorno del sistema

# ── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env")
    sys.exit(1)

# Competiciones gratuitas de StatsBomb
FREE_COMPETITIONS = [
    (11, 90, "La Liga", "2019-20"),          # La Liga 2019/20
    (11, 42, "La Liga", "2019-20"),          # La Liga 2019/20
    (2, 44, "Premier League", "2003-04"),    # Premier League 03/04
    (16, 4, "Champions League", "2018-19"),  # UCL 18/19
    (43, 106, "FIFA World Cup", "2022"),     # Mundial 2022
    (55, 43, "UEFA Euro", "2020"),           # Euro 2020
    (72, 107, "Women's World Cup", "2023"),  # Women's WC 2023
]

# Mapeo posición StatsBomb → VITAS
POSITION_MAP = {
    "Goalkeeper": "GK",
    "Right Back": "RB", "Left Back": "LB",
    "Right Wing Back": "RB", "Left Wing Back": "LB",
    "Right Center Back": "CB", "Left Center Back": "CB", "Center Back": "CB",
    "Right Defensive Midfield": "CDM", "Left Defensive Midfield": "CDM",
    "Center Defensive Midfield": "CDM",
    "Right Center Midfield": "CM", "Left Center Midfield": "CM",
    "Center Midfield": "CM",
    "Right Attacking Midfield": "CAM", "Left Attacking Midfield": "CAM",
    "Center Attacking Midfield": "CAM",
    "Right Wing": "RW", "Left Wing": "LW",
    "Right Center Forward": "ST", "Left Center Forward": "ST",
    "Center Forward": "ST", "Striker": "ST",
}


def clamp(val: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, val))


def compute_vsi_metrics(stats: dict) -> dict:
    """Convierte stats agregadas por jugador en métricas VSI 0-100."""
    minutes = max(stats.get("minutes", 1), 1)
    per90 = 90 / minutes

    shots_p90 = stats.get("shots", 0) * per90
    xg_p90 = stats.get("xg", 0) * per90
    passes_p90 = stats.get("passes", 0) * per90
    key_passes_p90 = stats.get("key_passes", 0) * per90
    dribbles_p90 = stats.get("dribbles_success", 0) * per90
    pressures_p90 = stats.get("pressures", 0) * per90
    tackles_p90 = stats.get("tackles", 0) * per90
    carries_dist_p90 = stats.get("carries_distance", 0) * per90

    return {
        "metric_shooting":  clamp(xg_p90 * 150 + shots_p90 * 8),
        "metric_vision":    clamp(key_passes_p90 * 25 + passes_p90 * 0.15),
        "metric_technique": clamp(dribbles_p90 * 20 + stats.get("dribbles_success_rate", 50) * 0.5),
        "metric_defending": clamp(pressures_p90 * 4 + tackles_p90 * 10),
        "metric_stamina":   clamp(minutes / 90 * 50 + pressures_p90 * 3),
        "metric_speed":     clamp(carries_dist_p90 * 0.3 + stats.get("sprints", 0) * per90 * 5),
    }


def make_id(name: str, comp: str, season: str) -> str:
    raw = f"statsbomb_{name}_{comp}_{season}".lower()
    return f"sb_{hashlib.md5(raw.encode()).hexdigest()[:12]}"


def upsert_batch(rows: list[dict]):
    """Upsert batch a Supabase via REST API."""
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/players_indexed"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    # Upsert en chunks de 50
    for i in range(0, len(rows), 50):
        chunk = rows[i : i + 50]
        r = httpx.post(url, json=chunk, headers=headers, timeout=30)
        if r.status_code >= 400:
            print(f"  ⚠️ Supabase error {r.status_code}: {r.text[:200]}")
        else:
            print(f"  ✅ Upsert {len(chunk)} jugadores OK")


def process_competition(comp_id: int, season_id: int, league: str, season: str):
    """Procesa una competición StatsBomb y retorna filas para upsert."""
    print(f"\n▸ {league} {season} (comp={comp_id}, season={season_id})")

    try:
        matches = sb.matches(competition_id=comp_id, season_id=season_id)
    except Exception as e:
        print(f"  ⚠️ No se pudo obtener partidos: {e}")
        return []

    if matches is None or (hasattr(matches, "empty") and matches.empty):
        print("  ⚠️ Sin partidos disponibles")
        return []

    match_ids = matches["match_id"].tolist() if hasattr(matches, "match_id") else []
    print(f"  Partidos encontrados: {len(match_ids)}")

    # Agregar stats por jugador
    player_stats: dict[str, dict] = defaultdict(lambda: {
        "name": "", "position": "", "team": "", "nationality": "",
        "minutes": 0, "shots": 0, "xg": 0, "passes": 0, "key_passes": 0,
        "dribbles_success": 0, "dribbles_total": 0, "pressures": 0,
        "tackles": 0, "carries_distance": 0, "sprints": 0, "goals": 0,
    })

    for idx, match_id in enumerate(match_ids[:30]):  # Limitar a 30 partidos para velocidad
        try:
            events = sb.events(match_id=match_id)
        except Exception:
            continue

        if events is None or (hasattr(events, "empty") and events.empty):
            continue

        for _, ev in events.iterrows():
            pid = str(ev.get("player_id", ""))
            if not pid or pid == "nan":
                continue

            ps = player_stats[pid]
            if not ps["name"]:
                ps["name"] = str(ev.get("player", ""))
                ps["team"] = str(ev.get("team", ""))
                raw_pos = str(ev.get("position", ""))
                ps["position"] = POSITION_MAP.get(raw_pos, "CM")
                ps["nationality"] = str(ev.get("nationality", "")) if "nationality" in ev.index else ""

            ev_type = str(ev.get("type", ""))

            if ev_type == "Shot":
                ps["shots"] += 1
                xg = ev.get("shot_statsbomb_xg", 0)
                if xg and not math.isnan(float(xg)):
                    ps["xg"] += float(xg)
                outcome = str(ev.get("shot_outcome", ""))
                if outcome == "Goal":
                    ps["goals"] += 1

            elif ev_type == "Pass":
                ps["passes"] += 1
                if ev.get("pass_goal_assist") or ev.get("pass_shot_assist"):
                    ps["key_passes"] += 1

            elif ev_type == "Dribble":
                ps["dribbles_total"] += 1
                if str(ev.get("dribble_outcome", "")) == "Complete":
                    ps["dribbles_success"] += 1

            elif ev_type == "Pressure":
                ps["pressures"] += 1

            elif ev_type == "Duel":
                if "Tackle" in str(ev.get("duel_type", "")):
                    ps["tackles"] += 1

            elif ev_type == "Carry":
                dist = ev.get("carry_distance", 0)
                if dist and not math.isnan(float(dist)):
                    ps["carries_distance"] += float(dist)

        if (idx + 1) % 10 == 0:
            print(f"  Procesados {idx + 1}/{min(len(match_ids), 30)} partidos...")

    # Estimar minutos (aproximación: 90 por partido aparecido)
    # Contar partidos por jugador
    for pid, ps in player_stats.items():
        total_events = (ps["shots"] + ps["passes"] + ps["pressures"] +
                       ps["dribbles_total"] + ps["tackles"])
        # Estimación rough: ~50 eventos por 90min
        ps["minutes"] = max(45, total_events * 1.8)
        ps["dribbles_success_rate"] = (
            (ps["dribbles_success"] / ps["dribbles_total"] * 100)
            if ps["dribbles_total"] > 0 else 50
        )

    # Convertir a filas
    rows = []
    for pid, ps in player_stats.items():
        if not ps["name"] or ps["name"] == "nan":
            continue
        # Mínimo de actividad
        if (ps["shots"] + ps["passes"] + ps["pressures"]) < 5:
            continue

        metrics = compute_vsi_metrics(ps)
        vsi = round(sum(metrics.values()) / 6, 1)

        rows.append({
            "id": make_id(ps["name"], league, season),
            "source": "statsbomb",
            "name": ps["name"],
            "short_name": ps["name"].split()[-1] if " " in ps["name"] else ps["name"],
            "position": ps["position"],
            "age": None,  # StatsBomb no incluye edad
            "nationality": ps["nationality"] or None,
            "club": ps["team"],
            "league": league,
            "season": season,
            "metric_speed": round(metrics["metric_speed"], 1),
            "metric_shooting": round(metrics["metric_shooting"], 1),
            "metric_vision": round(metrics["metric_vision"], 1),
            "metric_technique": round(metrics["metric_technique"], 1),
            "metric_defending": round(metrics["metric_defending"], 1),
            "metric_stamina": round(metrics["metric_stamina"], 1),
            "vsi_estimated": vsi,
            "raw_stats": {k: round(v, 2) if isinstance(v, float) else v
                         for k, v in ps.items()},
        })

    print(f"  Jugadores procesados: {len(rows)}")
    return rows


def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  VITAS · ETL StatsBomb Open Data → Supabase                ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    all_rows = []
    for comp_id, season_id, league, season in FREE_COMPETITIONS:
        rows = process_competition(comp_id, season_id, league, season)
        all_rows.extend(rows)

    print(f"\n{'='*60}")
    print(f"Total jugadores a insertar: {len(all_rows)}")

    if all_rows:
        upsert_batch(all_rows)

    print(f"\n🎉 ETL StatsBomb completado. {len(all_rows)} jugadores indexados.")


if __name__ == "__main__":
    main()
