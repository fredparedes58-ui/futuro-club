#!/usr/bin/env python3
"""
audit_metrics.py — Auditoría de procedencia de métricas (Vitas).

Compara el código contra config/metrics.json y falla si encuentra una métrica que
pueda mentir. Pensado para correr en pre-commit y en el goal de cierre.

Sale 0 si todo cumple. Sale 1 si hay incumplimientos. Sale 2 si el registro no
existe todavía (modo bootstrap: avisa pero no bloquea).

Uso:
    python scripts/audit_metrics.py
    python scripts/audit_metrics.py --strict     # bootstrap también falla
    python scripts/audit_metrics.py --json       # salida legible por máquina
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
REGISTRY = REPO / "config" / "metrics.json"

PROVENANCES = {"MEDIDA", "DERIVADA", "ESTIMADA_LLM", "CONSTANTE", "MOCK"}

# Procedencias cuyas rutas de cálculo no admiten constantes mágicas.
NO_MAGIC_LITERALS = {"MEDIDA", "DERIVADA"}

# Literales que nunca cuentan como "mágicos".
BENIGN_LITERALS = {0, 1, 2, -1, 100, 1000}

# Palabras que la UI no puede contener como literal: la etiqueta se deriva de
# provenance, nunca se escribe a mano.
FORBIDDEN_UI_LITERALS = [
    r"\bmedidos?\b",
    r"Datos cuantitativos medidos",
]

# Señales de dato sintético presentado como real.
SYNTHETIC_PATTERNS = [
    (r"hash\s*\(\s*.*\b(id|player_?id|jugador)", "valor derivado de un hash de identificador"),
    (r"\bseededRandom\b|\bmulberry32\b|\bxorshift\b", "PRNG determinista sobre identificador"),
]

REQUIRED_FIELDS = ("id", "name", "concept", "provenance", "calc_paths")

CODE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".py"}


@dataclass
class Finding:
    level: str          # ERROR | WARN
    code: str
    metric: str
    detail: str
    where: str = ""

    def render(self) -> str:
        loc = f"  ({self.where})" if self.where else ""
        return f"[{self.level}] {self.code} · {self.metric}: {self.detail}{loc}"

    def key(self) -> str:
        """Firma para el baseline: code + métrica + FICHERO (sin nº de línea).
        Robusta a desplazamientos de línea al editar. Una violación en un fichero/
        métrica ya conocidos se considera deuda existente; una NUEVA (otro fichero,
        otra métrica, otro código de check) sí bloquea."""
        where = re.sub(r":\d+$", "", self.where)
        return f"{self.code}::{self.metric}::{where}"


@dataclass
class Audit:
    findings: list[Finding] = field(default_factory=list)

    def error(self, code: str, metric: str, detail: str, where: str = "") -> None:
        self.findings.append(Finding("ERROR", code, metric, detail, where))

    def warn(self, code: str, metric: str, detail: str, where: str = "") -> None:
        self.findings.append(Finding("WARN", code, metric, detail, where))

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "ERROR"]


# --------------------------------------------------------------------------- #
# Limpieza de fuente
# --------------------------------------------------------------------------- #

def strip_noise(src: str, suffix: str) -> str:
    """Quita comentarios y cadenas para no contar literales que no lo son."""
    if suffix == ".py":
        src = re.sub(r'"""(?:.|\n)*?"""', " ", src)
        src = re.sub(r"'''(?:.|\n)*?'''", " ", src)
        src = re.sub(r"#[^\n]*", " ", src)
    else:
        src = re.sub(r"/\*(?:.|\n)*?\*/", " ", src)
        src = re.sub(r"//[^\n]*", " ", src)
        src = re.sub(r"`(?:[^`\\]|\\.)*`", '""', src)
    src = re.sub(r'"(?:[^"\\\n]|\\.)*"', '""', src)
    src = re.sub(r"'(?:[^'\\\n]|\\.)*'", "''", src)
    return src


NUM_RE = re.compile(r"(?<![\w.])(-?\d+(?:\.\d+)?)(?![\w.])")


def magic_literals(src: str, suffix: str, allowed: set[float]) -> list[tuple[int, str]]:
    """Devuelve (linea, literal) de constantes numéricas no permitidas."""
    cleaned = strip_noise(src, suffix)
    out: list[tuple[int, str]] = []
    for lineno, line in enumerate(cleaned.splitlines(), start=1):
        # Índices de array y slices no son constantes de cálculo.
        line = re.sub(r"\[\s*-?\d+\s*(:\s*-?\d+\s*)?\]", "[]", line)
        for m in NUM_RE.finditer(line):
            raw = m.group(1)
            try:
                val = float(raw)
            except ValueError:
                continue
            if val in BENIGN_LITERALS or val in allowed:
                continue
            out.append((lineno, raw))
    return out


def read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


# --------------------------------------------------------------------------- #
# Comprobaciones
# --------------------------------------------------------------------------- #

def check_registry_shape(metrics: list[dict], audit: Audit) -> None:
    seen_ids: set[str] = set()
    for i, m in enumerate(metrics):
        mid = m.get("id") or f"<sin id #{i}>"
        for f in REQUIRED_FIELDS:
            if f not in m:
                audit.error("REG001", mid, f"falta el campo obligatorio '{f}'")
        prov = m.get("provenance")
        if prov and prov not in PROVENANCES:
            audit.error("REG002", mid, f"provenance '{prov}' no está en {sorted(PROVENANCES)}")
        if mid in seen_ids:
            audit.error("REG003", mid, "id duplicado en el registro")
        seen_ids.add(mid)
        if not m.get("calc_paths"):
            audit.error("REG004", mid, "calc_paths vacío: toda métrica declara dónde se calcula")


def check_paths_exist(metrics: list[dict], audit: Audit) -> None:
    for m in metrics:
        mid = m.get("id", "?")
        for p in list(m.get("calc_paths", [])) + list(m.get("ui_paths", [])):
            if not (REPO / p).exists():
                audit.error("PATH001", mid, f"ruta declarada que no existe: {p}")


def check_duplicate_concepts(metrics: list[dict], audit: Audit) -> None:
    by_concept: dict[str, list[dict]] = {}
    for m in metrics:
        by_concept.setdefault(m.get("concept", "?"), []).append(m)
    for concept, group in by_concept.items():
        paths = {p for m in group for p in m.get("calc_paths", [])}
        if len(group) > 1 and len(paths) > 1:
            ids = ", ".join(m.get("id", "?") for m in group)
            audit.error(
                "DUP001", concept,
                f"el mismo concepto se calcula en {len(paths)} rutas distintas ({ids}). "
                "Un concepto, una implementación.",
                ", ".join(sorted(paths)),
            )


def check_magic_literals(metrics: list[dict], audit: Audit) -> None:
    for m in metrics:
        if m.get("provenance") not in NO_MAGIC_LITERALS:
            continue
        mid = m.get("id", "?")
        allowed = {float(x) for x in m.get("allowed_literals", [])}
        for p in m.get("calc_paths", []):
            path = REPO / p
            if path.suffix not in CODE_SUFFIXES:
                continue
            src = read(path)
            if src is None:
                continue
            for lineno, lit in magic_literals(src, path.suffix, allowed):
                audit.error(
                    "LIT001", mid,
                    f"constante literal {lit} en ruta de cálculo con provenance "
                    f"{m['provenance']}. Muévela a config con su procedencia o "
                    f"decláralo en allowed_literals.",
                    f"{p}:{lineno}",
                )


def check_ui_literals(metrics: list[dict], audit: Audit) -> None:
    for m in metrics:
        mid = m.get("id", "?")
        for p in m.get("ui_paths", []):
            path = REPO / p
            src = read(path)
            if src is None:
                continue
            for pat in FORBIDDEN_UI_LITERALS:
                for match in re.finditer(pat, src, flags=re.IGNORECASE):
                    lineno = src[: match.start()].count("\n") + 1
                    audit.error(
                        "UI001", mid,
                        f"literal '{match.group(0)}' en componente. La etiqueta se "
                        "deriva de provenance, no se escribe a mano.",
                        f"{p}:{lineno}",
                    )


def check_synthetic(metrics: list[dict], audit: Audit) -> None:
    for m in metrics:
        mid = m.get("id", "?")
        for p in list(m.get("calc_paths", [])) + list(m.get("ui_paths", [])):
            path = REPO / p
            src = read(path)
            if src is None:
                continue
            for pat, why in SYNTHETIC_PATTERNS:
                for match in re.finditer(pat, src):
                    lineno = src[: match.start()].count("\n") + 1
                    audit.error(
                        "SYN001", mid,
                        f"{why}. Eso es MOCK disfrazado de dato real.",
                        f"{p}:{lineno}",
                    )


def check_constante_not_rendered(metrics: list[dict], audit: Audit) -> None:
    for m in metrics:
        if m.get("provenance") != "CONSTANTE":
            continue
        if m.get("ui_paths"):
            audit.error(
                "CONST001", m.get("id", "?"),
                "métrica CONSTANTE con ui_paths declarados. Una constante no es un "
                "resultado: su value debe ser null y no renderizarse como cifra.",
                ", ".join(m["ui_paths"]),
            )


def check_mock_banner(metrics: list[dict], audit: Audit) -> None:
    for m in metrics:
        if m.get("provenance") != "MOCK":
            continue
        if not m.get("banner"):
            audit.error(
                "MOCK001", m.get("id", "?"),
                "métrica MOCK sin 'banner: true' declarado. Todo dato de ejemplo en "
                "vista de cliente exige banner visible.",
            )


def check_orphans(metrics: list[dict], registry: dict, audit: Audit) -> None:
    """Ficheros bajo scan_roots que parecen ruta de cálculo y nadie declara."""
    roots = registry.get("scan_roots", [])
    if not roots:
        return
    declared = {p for m in metrics for p in m.get("calc_paths", [])}
    hint = re.compile(registry.get("calc_file_hint", r"metric|score|speed|track|vsi|phv"), re.I)
    for root in roots:
        base = REPO / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in CODE_SUFFIXES or not path.is_file():
                continue
            # as_posix() normaliza a '/' — en Windows str(PurePath) da '\', que nunca
            # casa con las rutas del registro (siempre '/') → 17 falsos ORPH001.
            rel = path.relative_to(REPO).as_posix()
            if rel in declared:
                continue
            if hint.search(path.name):
                audit.warn(
                    "ORPH001", "-",
                    "fichero con pinta de ruta de cálculo sin entrada en el registro",
                    rel,
                )


# --------------------------------------------------------------------------- #

def main() -> int:
    # Windows: la consola cp1252 lanza UnicodeEncodeError con ·/→. Forzamos UTF-8
    # para que ni el audit ni el pre-commit crasheen al imprimir hallazgos.
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        except Exception:
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true",
                    help="fallar también si el registro no existe todavía")
    ap.add_argument("--json", action="store_true", help="salida JSON")
    ap.add_argument("--baseline", nargs="?", const="config/metrics.baseline.json", default=None,
                    help="suprime findings ya conocidos del baseline; solo fallan los NUEVOS")
    ap.add_argument("--update-baseline", action="store_true",
                    help="regenera el baseline con los findings actuales y sale 0")
    args = ap.parse_args()

    if not REGISTRY.exists():
        msg = (f"config/metrics.json no existe todavía. G0 debe producirlo.\n"
               f"    El audit no puede garantizar nada hasta entonces.")
        if args.strict:
            print(f"[ERROR] BOOT001 · {msg}", file=sys.stderr)
            return 1
        print(f"[AVISO] BOOT001 · {msg}", file=sys.stderr)
        return 2

    try:
        registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"[ERROR] REG000 · config/metrics.json no es JSON válido: {e}", file=sys.stderr)
        return 1

    metrics = registry.get("metrics", [])
    if not metrics:
        print("[ERROR] REG005 · el registro no contiene métricas.", file=sys.stderr)
        return 1

    audit = Audit()
    check_registry_shape(metrics, audit)
    check_paths_exist(metrics, audit)
    check_duplicate_concepts(metrics, audit)
    check_magic_literals(metrics, audit)
    check_ui_literals(metrics, audit)
    check_synthetic(metrics, audit)
    check_constante_not_rendered(metrics, audit)
    check_mock_banner(metrics, audit)
    check_orphans(metrics, registry, audit)

    baseline_default = "config/metrics.baseline.json"

    # --update-baseline: registra los findings actuales como deuda conocida y sale 0.
    if args.update_baseline:
        path = REPO / (args.baseline or baseline_default)
        keys = sorted({f.key() for f in audit.findings})
        path.write_text(
            json.dumps(
                {"$comment": "Baseline del arnés de procedencia: findings CONOCIDOS (deuda de "
                             "honestidad pre-existente que la remediación va reduciendo). Un finding "
                             "NUEVO no listado aquí bloquea el commit. Regenerar (solo al reducir "
                             "deuda): python scripts/audit_metrics.py --update-baseline",
                 "count": len(keys), "known": keys},
                indent=2, ensure_ascii=False),
            encoding="utf-8")
        print(f"Baseline actualizado: {len(keys)} findings conocidos -> {path.relative_to(REPO)}")
        return 0

    # Carga del baseline (si se pide): suprime los findings ya conocidos.
    known: set[str] = set()
    if args.baseline:
        bp = REPO / args.baseline
        if bp.exists():
            try:
                known = set(json.loads(bp.read_text(encoding="utf-8")).get("known", []))
            except json.JSONDecodeError:
                print(f"[AVISO] baseline ilegible ({args.baseline}); se ignora.", file=sys.stderr)
        reported = [f for f in audit.findings if f.key() not in known]
    else:
        reported = list(audit.findings)

    reported_errors = [f for f in reported if f.level == "ERROR"]
    n_baselined = len(audit.findings) - len(reported)

    if args.json:
        print(json.dumps(
            {"ok": not reported_errors,
             "metrics_auditadas": len(metrics),
             "baselined": n_baselined,
             "findings": [f.__dict__ for f in reported]},
            indent=2, ensure_ascii=False))
        return 1 if reported_errors else 0

    print(f"Métricas en el registro: {len(metrics)}"
          + (f" · {n_baselined} en baseline (conocidos)" if args.baseline else ""))
    if not reported:
        msg = "Ninguna violación nueva." if args.baseline else "Ninguna métrica puede mentir."
        print(f"Auditoría de procedencia: OK. {msg}")
        return 0

    for f in reported:
        print(f.render())

    n_err = len(reported_errors)
    n_warn = len(reported) - n_err
    tag = " NUEVO(s)" if args.baseline else ""
    print(f"\n{n_err} error(es){tag}, {n_warn} aviso(s).")
    if n_err:
        print("Auditoría FALLIDA. Ver .claude/rules/metricas.md para el contrato.")
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
