#!/usr/bin/env python3
"""
VITAS · ETL Master — Ejecuta todos los ETL en secuencia.

Uso:
  pip install -r scripts/requirements-etl.txt
  python scripts/etl_all.py
"""

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent


def run_etl(name: str, script: str):
    print(f"\n{'='*60}")
    print(f"  Ejecutando ETL: {name}")
    print(f"{'='*60}\n")

    result = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / script)],
        cwd=str(SCRIPTS_DIR.parent),
    )

    if result.returncode != 0:
        print(f"\n⚠️ ETL {name} terminó con errores (código {result.returncode})")
    else:
        print(f"\n✅ ETL {name} completado exitosamente")

    return result.returncode


def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  VITAS · ETL Master — Todas las fuentes                    ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    etls = [
        ("FBref (más rápido)", "etl_fbref.py"),
        ("Understat (async)", "etl_understat.py"),
        ("StatsBomb (eventos, más lento)", "etl_statsbomb.py"),
    ]

    results = {}
    for name, script in etls:
        results[name] = run_etl(name, script)

    print(f"\n{'='*60}")
    print("  RESUMEN FINAL")
    print(f"{'='*60}")
    for name, code in results.items():
        status = "✅ OK" if code == 0 else f"❌ Error ({code})"
        print(f"  {name}: {status}")

    total_ok = sum(1 for c in results.values() if c == 0)
    print(f"\n  {total_ok}/{len(etls)} ETLs completados sin errores")


if __name__ == "__main__":
    main()
