#!/usr/bin/env python3
"""
Valida fixtures/ — el ground truth HUMANO de identidad (G9.0) y golden (G2/G3/G4).

Qué hace:
  - Recorre fixtures/identidad/<clip>/ y fixtures/golden/<clip>/ (ignora _plantilla/).
  - Comprueba el esquema de cada fixture real.
  - RECHAZA: ficheros vacíos, marcados como plantilla (__plantilla__ / <rellenar> /
    PLANTILLA), dorsales fuera de convocatoria, y patrones que delatan origen
    sintético (p. ej. dorsal_real == track_id en TODAS las filas).
  - Para identidad, imprime el REPORTE G9.0: nº de pistas, % de frames legibles,
    distribución por pista, y pistas ilegibles en TODOS los frames (techo físico).

Salida:
  - 0  si todo fixture real conforma (o si solo hay plantillas → banner PENDIENTE).
  - 1  si algún fixture real está mal formado.
  --require-fixtures  fuerza salida 1 si no existe ningún fixture real (para CI
                      cuando ya se espera ground truth).
"""
import sys, os, json, csv, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FIXTURES = os.path.join(REPO, "fixtures")

_TTY = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None
RESET, RED, YEL, GRN, DIM = (
    ("\033[0m", "\033[31m", "\033[33m", "\033[32m", "\033[2m") if _TTY else ("", "", "", "", "")
)

errors = []   # (clip, msg)
notes = []    # informativo


def _placeholder_in(obj):
    """True si algún string del objeto es un marcador de plantilla sin rellenar.
    OJO: un string vacío NO es un marcador — un campo opcional vacío (p. ej. color)
    es legítimo. La ausencia de campos REQUERIDOS se comprueba explícitamente aparte."""
    if isinstance(obj, str):
        s = obj.strip()
        return (s.startswith("<") and s.endswith(">")) or "PLANTILLA" in s
    if isinstance(obj, dict):
        return any(_placeholder_in(v) for k, v in obj.items() if not k.startswith("__"))
    if isinstance(obj, list):
        return any(_placeholder_in(v) for v in obj)
    return False


def load_json(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def read_csv_rows(path):
    """Devuelve (header, rows) saltando líneas de comentario que empiezan por #."""
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        lines = [ln for ln in f if not ln.lstrip().startswith("#")]
    reader = csv.reader(lines)
    data = [r for r in reader if any(c.strip() for c in r)]
    if not data:
        return [], []
    return [c.strip() for c in data[0]], [r for r in data[1:]]


def is_template_dir(name):
    return name == "_plantilla" or name.startswith("_") or name.startswith(".")


def real_clip_dirs(branch):
    base = os.path.join(FIXTURES, branch)
    if not os.path.isdir(base):
        return []
    return [
        os.path.join(base, d)
        for d in sorted(os.listdir(base))
        if os.path.isdir(os.path.join(base, d)) and not is_template_dir(d)
    ]


# ── identidad ─────────────────────────────────────────────────────────────
def validate_identidad(clip_dir):
    clip = os.path.relpath(clip_dir, FIXTURES)
    err = lambda m: errors.append((clip, m))
    need = ["clip.meta.json", "convocatoria.json", "anotacion.csv"]
    for fn in need:
        if not os.path.exists(os.path.join(clip_dir, fn)):
            err(f"falta {fn}")
    if errors and errors[-1][0] == clip:
        return

    meta = load_json(os.path.join(clip_dir, "clip.meta.json"))
    if meta.get("__plantilla__") or _placeholder_in(meta):
        return err("clip.meta.json sin rellenar (plantilla)")
    if not (isinstance(meta.get("fps"), (int, float)) and meta["fps"] > 0):
        err("clip.meta.json: fps debe ser > 0")
    if not (isinstance(meta.get("duracion_s"), (int, float)) and meta["duracion_s"] > 0):
        err("clip.meta.json: duracion_s debe ser > 0")
    if meta.get("camara") not in ("fija", "movil"):
        err("clip.meta.json: camara debe ser 'fija' o 'movil'")
    if not str(meta.get("anotador", "")).strip() or _placeholder_in(meta.get("anotador", "")):
        err("clip.meta.json: anotador (humano) obligatorio")

    conv = load_json(os.path.join(clip_dir, "convocatoria.json"))
    if conv.get("__plantilla__") or _placeholder_in(conv):
        return err("convocatoria.json sin rellenar (plantilla)")
    rosters = {}
    for side in ("equipo_local", "equipo_visitante"):
        team = conv.get(side, {})
        dor = team.get("dorsales", [])
        key = "local" if side == "equipo_local" else "visitante"
        if not (isinstance(dor, list) and dor and all(isinstance(x, int) for x in dor)):
            err(f"convocatoria.json: {side}.dorsales debe ser lista no vacía de enteros")
        elif len(set(dor)) != len(dor):
            err(f"convocatoria.json: {side}.dorsales tiene duplicados")
        rosters[key] = set(dor) if isinstance(dor, list) else set()

    header, rows = read_csv_rows(os.path.join(clip_dir, "anotacion.csv"))
    expected = ["frame", "track_id", "dorsal_real", "equipo", "dorsal_legible"]
    if header != expected:
        return err(f"anotacion.csv: cabecera debe ser {','.join(expected)} (es {','.join(header)})")
    if not rows:
        return err("anotacion.csv: sin filas de datos (vacío)")

    same_as_track = 0
    parsed = []
    for i, r in enumerate(rows, 1):
        if len(r) != 5:
            err(f"anotacion.csv fila {i}: se esperan 5 columnas")
            continue
        fr, tid, dre, eq, leg = (c.strip() for c in r)
        if not fr.isdigit():
            err(f"anotacion.csv fila {i}: frame no entero '{fr}'")
        if eq not in ("local", "visitante"):
            err(f"anotacion.csv fila {i}: equipo debe ser local|visitante '{eq}'")
        if leg not in ("0", "1"):
            err(f"anotacion.csv fila {i}: dorsal_legible debe ser 0|1 '{leg}'")
        if dre != "":  # dorsal vacío = pista anónima, válido
            if not dre.isdigit():
                err(f"anotacion.csv fila {i}: dorsal_real no entero '{dre}'")
            elif eq in rosters and int(dre) not in rosters[eq]:
                err(f"anotacion.csv fila {i}: dorsal {dre} fuera de convocatoria de {eq}")
            if dre == tid:
                same_as_track += 1
        parsed.append((tid, leg, dre))

    if rows and same_as_track == len(rows):
        err("anotacion.csv: dorsal_real == track_id en TODAS las filas → parece sintético")

    if any(e[0] == clip for e in errors):
        return

    # ── Reporte G9.0 ──
    tracks = {}
    for tid, leg, dre in parsed:
        t = tracks.setdefault(tid, {"leg": 0, "tot": 0, "dorsal": dre})
        t["tot"] += 1
        if leg == "1":
            t["leg"] += 1
    total = sum(t["tot"] for t in tracks.values())
    legible = sum(t["leg"] for t in tracks.values())
    never = [tid for tid, t in tracks.items() if t["leg"] == 0]
    print(f"{GRN}✓ identidad/{os.path.basename(clip_dir)}{RESET}  "
          f"({meta.get('camara')}, {meta.get('condiciones', '?')})")
    print(f"    pistas anotadas: {len(tracks)}")
    print(f"    % frames con dorsal legible (global): {100*legible/total:.0f}%  ({legible}/{total})")
    print(f"    techo físico de cobertura: {len(tracks)-len(never)}/{len(tracks)} pistas "
          f"legibles en ≥1 frame  ({100*(len(tracks)-len(never))/len(tracks):.0f}%)")
    if never:
        print(f"    {YEL}pistas ilegibles en TODOS los frames (anónimas por techo): "
              f"{len(never)} → {', '.join(never[:12])}{RESET}")
    # distribución por pista (compacta)
    dist = "  ".join(f"{tid}:{100*t['leg']//t['tot']}%" for tid, t in sorted(tracks.items())[:16])
    print(f"    {DIM}legibilidad por pista: {dist}{RESET}")


# ── golden ────────────────────────────────────────────────────────────────
def validate_golden(clip_dir):
    clip = os.path.relpath(clip_dir, FIXTURES)
    err = lambda m: errors.append((clip, m))
    present = []

    p = os.path.join(clip_dir, "calibracion.json")
    if os.path.exists(p):
        cal = load_json(p)
        if not (cal.get("__plantilla__") or _placeholder_in(cal)):
            present.append("calibración")
            if cal.get("metodo") not in ("puntos_campo_medidos", "gps"):
                err("calibracion.json: metodo debe ser puntos_campo_medidos|gps")
            if cal.get("metodo") == "puntos_campo_medidos":
                pts = cal.get("puntos", [])
                if len([q for q in pts if len(q.get("px", [])) == 2 and len(q.get("mundo_m", [])) == 2]) < 4:
                    err("calibracion.json: puntos_campo_medidos exige ≥4 puntos con px y mundo_m")

    p = os.path.join(clip_dir, "distancia_gt.json")
    if os.path.exists(p):
        d = load_json(p)
        if not (d.get("__plantilla__") or _placeholder_in(d)):
            present.append("distancia")
            if not str(d.get("fuente", "")).strip():
                err("distancia_gt.json: fuente obligatoria (de dónde sale el metro)")
            if d.get("metodo") not in ("gps", "manual_calibrado"):
                err("distancia_gt.json: metodo debe ser gps|manual_calibrado")
            for dor, v in (d.get("jugadores") or {}).items():
                if not (isinstance(v.get("distancia_m"), (int, float)) and v["distancia_m"] > 0):
                    err(f"distancia_gt.json: jugador {dor} distancia_m debe ser > 0")

    p = os.path.join(clip_dir, "duelos_gt.csv")
    if os.path.exists(p):
        header, rows = read_csv_rows(p)
        exp = ["t_inicio_s", "t_fin_s", "jugador_a", "jugador_b", "ganador", "tipo", "anotador"]
        if header == exp and rows:
            present.append("duelos")
            for i, r in enumerate(rows, 1):
                if len(r) != 7:
                    err(f"duelos_gt.csv fila {i}: se esperan 7 columnas"); continue
                ja, jb, gan = r[2].strip(), r[3].strip(), r[4].strip()
                if gan not in (ja, jb, "neutro"):
                    err(f"duelos_gt.csv fila {i}: ganador debe ser {ja}|{jb}|neutro (es '{gan}')")
        elif header and header != exp:
            err(f"duelos_gt.csv: cabecera inesperada {','.join(header)}")

    p = os.path.join(clip_dir, "vsi_gt.json")
    if os.path.exists(p):
        v = load_json(p)
        if not (v.get("__plantilla__") or _placeholder_in(v)):
            present.append("VSI")
            if not str(v.get("evaluador", "")).strip():
                err("vsi_gt.json: evaluador (humano) obligatorio")
            if not (v.get("jugadores") or {}):
                err("vsi_gt.json: sin jugadores evaluados")

    if not present:
        err("directorio golden sin ningún fichero de verdad relleno")
    elif not any(e[0] == clip for e in errors):
        print(f"{GRN}✓ golden/{os.path.basename(clip_dir)}{RESET}  ramas: {', '.join(present)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--require-fixtures", action="store_true",
                    help="salir 1 si no existe ningún fixture real")
    args = ap.parse_args()

    print(f"{DIM}fixtures/ en {FIXTURES}{RESET}\n")
    id_dirs = real_clip_dirs("identidad")
    gd_dirs = real_clip_dirs("golden")

    for d in id_dirs:
        validate_identidad(d)
    for d in gd_dirs:
        validate_golden(d)

    n_real = len(id_dirs) + len(gd_dirs)
    print()
    if n_real == 0:
        msg = (f"{YEL}PENDIENTE: 0 fixtures reales (solo plantillas).{RESET}\n"
               f"   G2-distancia, G3-duelos, G4-VSI y G9 quedan bloqueados por falta de\n"
               f"   ground truth HUMANO — no por falta de código. Ver fixtures/README.md.")
        print(msg)
        return 1 if args.require_fixtures else 0

    if errors:
        print(f"{RED}✗ {len(errors)} problema(s) en fixtures reales:{RESET}")
        for clip, m in errors:
            print(f"   {RED}·{RESET} {clip}: {m}")
        return 1
    print(f"{GRN}✓ {n_real} fixture(s) real(es), todos conformes.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
