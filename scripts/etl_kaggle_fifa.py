#!/usr/bin/env python3
"""
VITAS · ETL: Kaggle FIFA 15-FC24 → development_curves + player_history

Fuente: kaggle.com/datasets/joebeachcapital/fifa-players
Descarga automática via kagglehub (necesita Kaggle API key configurada).

Produce:
  1. development_curves: curvas promedio por posición/bracket/edad
  2. player_history: historial individual de jugadores destacados

Uso:
  pip install kagglehub pandas supabase-py python-dotenv
  python scripts/etl_kaggle_fifa.py

Configurar Kaggle API key:
  1. Ve a kaggle.com → Settings → API → Create New Token
  2. Guarda kaggle.json en ~/.kaggle/ (Linux/Mac) o %USERPROFILE%/.kaggle/ (Windows)
  O bien: set KAGGLE_USERNAME=tu_usuario y KAGGLE_KEY=tu_key
"""

import os
import sys
import glob
import pandas as pd
import numpy as np
from pathlib import Path
from dotenv import load_dotenv

# ─── Config ──────────────────────────────────────────────────────────────────

load_dotenv()
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

DATA_DIR = Path(__file__).parent / "data" / "kaggle"
METRICS = ["pace", "shooting", "passing", "dribbling", "defending", "physic"]
MIN_OVERALL_HISTORY = 75  # Solo guardar historial de jugadores 75+ OVR

# Position mapping to groups
POS_MAP = {
    "GK": "GK",
    "CB": "CB", "RCB": "CB", "LCB": "CB",
    "RB": "FB", "LB": "FB", "RWB": "FB", "LWB": "FB", "WB": "FB",
    "CDM": "DM", "DM": "DM",
    "CM": "CM", "LCM": "CM", "RCM": "CM",
    "CAM": "AM", "LM": "AM", "RM": "AM",
    "LW": "W", "RW": "W",
    "ST": "ST", "CF": "ST", "LS": "ST", "RS": "ST",
}

FIFA_VERSIONS = {
    "15": "FIFA 15", "16": "FIFA 16", "17": "FIFA 17",
    "18": "FIFA 18", "19": "FIFA 19", "20": "FIFA 20",
    "21": "FIFA 21", "22": "FIFA 22", "23": "FIFA 23",
    "24": "FC24",
}


def get_pos_group(pos: str) -> str:
    """Map a position string to a group."""
    if not pos:
        return "CM"
    # Handle multi-position like "ST, LW"
    primary = str(pos).split(",")[0].strip().upper()
    return POS_MAP.get(primary, "CM")


def get_bracket(overall: float) -> str:
    """Map overall to bracket."""
    if overall >= 90:
        return "90+"
    if overall >= 80:
        return "80-89"
    if overall >= 70:
        return "70-79"
    if overall >= 60:
        return "60-69"
    return "50-59"


def download_dataset() -> Path:
    """Download dataset via kagglehub, return path to CSV directory."""
    try:
        import kagglehub
        print("  🔽 Descargando dataset via kagglehub...")
        path = kagglehub.dataset_download("joebeachcapital/fifa-players")
        print(f"  ✅ Dataset descargado en: {path}")
        return Path(path)
    except ImportError:
        print("  ⚠️  kagglehub no instalado. Intentando carpeta local...")
        return DATA_DIR
    except Exception as e:
        print(f"  ⚠️  Error con kagglehub: {e}")
        print(f"     Intentando carpeta local {DATA_DIR}...")
        return DATA_DIR


def load_csvs() -> pd.DataFrame:
    """Load all FIFA CSV files — auto-download via kagglehub or use local."""
    # Intentar kagglehub primero, luego carpeta local
    data_path = DATA_DIR
    csv_files = sorted(glob.glob(str(DATA_DIR / "*.csv")))

    if not csv_files:
        # Auto-download
        data_path = download_dataset()
        # kagglehub puede poner CSVs en subdirectorios
        csv_files = sorted(glob.glob(str(data_path / "**" / "*.csv"), recursive=True))

    if not csv_files:
        print(f"❌ No se encontraron CSVs")
        print(f"   Opciones:")
        print(f"   1. pip install kagglehub → configurar Kaggle API key")
        print(f"   2. Descargar manualmente y poner CSVs en {DATA_DIR}/")
        sys.exit(1)

    frames = []
    for f in csv_files:
        fname = Path(f).stem.lower()
        # Try to detect FIFA version from filename
        version = None
        for key in FIFA_VERSIONS:
            if key in fname:
                version = FIFA_VERSIONS[key]
                break
        if not version:
            # Try numeric extraction
            nums = "".join(c for c in fname if c.isdigit())
            if nums in FIFA_VERSIONS:
                version = FIFA_VERSIONS[nums]
            else:
                version = fname  # fallback

        print(f"  📄 Cargando {Path(f).name} → {version}")
        df = pd.read_csv(f, low_memory=False)
        df["fifa_version"] = version
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    print(f"\n📊 Total filas cargadas: {len(combined):,}")
    return combined


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names across FIFA versions."""
    # Common column name variations
    renames = {}
    cols_lower = {c.lower(): c for c in df.columns}

    # player_id might be sofifa_id, player_id, or ID
    for candidate in ["sofifa_id", "player_id", "id"]:
        if candidate in cols_lower:
            renames[cols_lower[candidate]] = "player_id"
            break

    # short_name or Name
    for candidate in ["short_name", "name"]:
        if candidate in cols_lower:
            renames[cols_lower[candidate]] = "player_name"
            break

    # Overall
    for candidate in ["overall", "ovr"]:
        if candidate in cols_lower:
            renames[cols_lower[candidate]] = "overall"
            break

    # Potential
    for candidate in ["potential", "pot"]:
        if candidate in cols_lower:
            renames[cols_lower[candidate]] = "potential"
            break

    # Age
    if "age" in cols_lower:
        renames[cols_lower["age"]] = "age"

    # Position
    for candidate in ["player_positions", "position", "best_position"]:
        if candidate in cols_lower:
            renames[cols_lower[candidate]] = "position"
            break

    # Club
    for candidate in ["club_name", "club"]:
        if candidate in cols_lower:
            renames[cols_lower[candidate]] = "club"
            break

    # Metrics
    for metric in METRICS:
        if metric in cols_lower:
            renames[cols_lower[metric]] = metric

    df = df.rename(columns=renames)

    # Ensure numeric
    for col in ["overall", "potential", "age"] + METRICS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Drop rows without essential data
    essential = ["player_id", "age", "overall"] + METRICS
    existing = [c for c in essential if c in df.columns]
    df = df.dropna(subset=existing)

    return df


def compute_development_curves(df: pd.DataFrame) -> pd.DataFrame:
    """Compute average development curves by position group and overall bracket."""
    # Add position group
    df["pos_group"] = df["position"].apply(get_pos_group)

    # For each player, find their peak overall across all versions
    peak_overall = df.groupby("player_id")["overall"].max().reset_index()
    peak_overall.columns = ["player_id", "peak_overall"]
    df = df.merge(peak_overall, on="player_id", how="left")

    # Bracket based on peak overall (not current)
    df["bracket"] = df["peak_overall"].apply(get_bracket)

    # For each metric, compute pct_of_peak per player
    for metric in METRICS:
        player_peaks = df.groupby("player_id")[metric].max().reset_index()
        player_peaks.columns = ["player_id", f"peak_{metric}"]
        df = df.merge(player_peaks, on="player_id", how="left")
        df[f"pct_{metric}"] = df[metric] / df[f"peak_{metric}"]
        df[f"pct_{metric}"] = df[f"pct_{metric}"].clip(0, 1)

    # Also compute pct_of_peak for overall
    df["pct_overall"] = df["overall"] / df["peak_overall"]

    # Group by position, bracket, age → average
    agg_cols = ["pct_overall"] + [f"pct_{m}" for m in METRICS]
    curves = df.groupby(["pos_group", "bracket", "age"]).agg(
        **{col: (col, "mean") for col in agg_cols},
        sample_size=("player_id", "count"),
    ).reset_index()

    # Filter: only ages 16-35 with enough samples
    curves = curves[(curves["age"] >= 16) & (curves["age"] <= 35)]
    curves = curves[curves["sample_size"] >= 5]

    print(f"\n📈 Curvas generadas: {len(curves):,} filas")
    print(f"   Posiciones: {sorted(curves['pos_group'].unique())}")
    print(f"   Brackets: {sorted(curves['bracket'].unique())}")
    print(f"   Edades: {int(curves['age'].min())}-{int(curves['age'].max())}")

    return curves


def extract_player_history(df: pd.DataFrame) -> pd.DataFrame:
    """Extract individual history for notable players (75+ OVR at some point)."""
    # Find players who reached 75+ OVR
    notable_ids = df[df["overall"] >= MIN_OVERALL_HISTORY]["player_id"].unique()
    history = df[df["player_id"].isin(notable_ids)].copy()

    # Keep relevant columns
    cols = ["player_id", "player_name", "fifa_version", "age", "overall", "potential",
            "position", "club"] + METRICS
    existing = [c for c in cols if c in history.columns]
    history = history[existing]

    # Deduplicate (one entry per player per version)
    history = history.drop_duplicates(subset=["player_id", "fifa_version"])

    print(f"\n👤 Historial extraído: {len(history):,} registros de {len(notable_ids):,} jugadores")

    return history


def upload_to_supabase(curves: pd.DataFrame, history: pd.DataFrame):
    """Upload results to Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("\n⚠️  Sin credenciales Supabase — guardando como CSV local")
        output_dir = Path(__file__).parent / "data" / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        curves.to_csv(output_dir / "development_curves.csv", index=False)
        history.to_csv(output_dir / "player_history.csv", index=False)
        print(f"   Guardado en {output_dir}/")
        return

    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Upload curves
    print("\n⬆️  Subiendo development_curves...")
    curve_records = []
    for _, row in curves.iterrows():
        curve_records.append({
            "position_group": row["pos_group"],
            "overall_bracket": row["bracket"],
            "age": int(row["age"]),
            "pct_of_peak": round(float(row["pct_overall"]), 4),
            "pct_pace": round(float(row["pct_pace"]), 4),
            "pct_shooting": round(float(row["pct_shooting"]), 4),
            "pct_passing": round(float(row["pct_passing"]), 4),
            "pct_dribbling": round(float(row["pct_dribbling"]), 4),
            "pct_defending": round(float(row["pct_defending"]), 4),
            "pct_physic": round(float(row["pct_physic"]), 4),
            "sample_size": int(row["sample_size"]),
        })

    # Batch upsert (500 at a time)
    batch_size = 500
    for i in range(0, len(curve_records), batch_size):
        batch = curve_records[i:i + batch_size]
        sb.table("development_curves").upsert(
            batch,
            on_conflict="position_group,overall_bracket,age"
        ).execute()
    print(f"   ✅ {len(curve_records)} curvas subidas")

    # Upload history
    print("⬆️  Subiendo player_history...")
    hist_records = []
    for _, row in history.iterrows():
        record = {
            "player_id": str(row["player_id"]),
            "player_name": str(row["player_name"]),
            "fifa_version": str(row["fifa_version"]),
            "age": int(row["age"]),
            "position": str(row.get("position", "")),
            "club": str(row.get("club", "")),
        }
        for col in ["overall", "potential"] + METRICS:
            if col in row and pd.notna(row[col]):
                record[col] = int(row[col])
        hist_records.append(record)

    for i in range(0, len(hist_records), batch_size):
        batch = hist_records[i:i + batch_size]
        sb.table("player_history").upsert(
            batch,
            on_conflict="player_id,fifa_version"
        ).execute()
    print(f"   ✅ {len(hist_records)} registros históricos subidos")


def main():
    print("=" * 60)
    print("VITAS · ETL Kaggle FIFA 15-FC24")
    print("=" * 60)

    # 1. Load CSVs
    print("\n📂 Cargando CSVs...")
    df = load_csvs()

    # 2. Normalize columns
    print("\n🔧 Normalizando columnas...")
    df = normalize_columns(df)
    print(f"   Columnas disponibles: {list(df.columns)}")
    print(f"   Jugadores únicos: {df['player_id'].nunique():,}")

    # 3. Compute development curves
    print("\n📈 Calculando curvas de desarrollo...")
    curves = compute_development_curves(df)

    # 4. Extract player history
    print("\n👤 Extrayendo historial de jugadores...")
    history = extract_player_history(df)

    # 5. Upload
    upload_to_supabase(curves, history)

    print("\n✅ ETL completado!")


if __name__ == "__main__":
    main()
