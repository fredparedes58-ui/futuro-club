# Instalación en el repo de Vitas

Copia estos ficheros a la raíz del repo respetando la estructura:

```
CLAUDE.md
docs/remediacion-metricas.md
.claude/rules/metricas.md
.claude/rules/identidad.md
scripts/audit_metrics.py
config/metrics.example.json
.githooks/pre-commit
```

Luego, una sola vez:

```bash
chmod +x .githooks/pre-commit scripts/audit_metrics.py
git config core.hooksPath .githooks
git add -A && git commit -m "chore: arnés de procedencia de métricas"
```

## Ajustes que sí tienes que hacer tú

1. **`globs` de las reglas.** `.claude/rules/metricas.md` e `identidad.md` traen
   rutas supuestas (`src/lib/metrics/**`, `vitas/identity/**`). Ábrelas y ajústalas
   a tu estructura real, o las reglas no se cargarán cuando toque.
2. **`scan_roots`** en `config/metrics.example.json` — mismo motivo.
3. Nada más. `audit_metrics.py` no asume estructura: todo sale del registro.

## Estados del audit

| Salida | Significado | Pre-commit |
|---|---|---|
| `0` | Ninguna métrica puede mentir | pasa |
| `1` | Incumplimientos | **bloquea** |
| `2` | `config/metrics.json` no existe (pre-G0) | avisa y pasa |

El modo `2` existe para que puedas seguir commiteando durante G0. En cuanto G0
produzca el registro, el hook empieza a morder solo.

Para forzar que el bootstrap también falle (útil en CI después de G0):

```bash
python scripts/audit_metrics.py --strict
```

## Comprobaciones que hace

| Código | Qué detecta |
|---|---|
| `REG001-005` | Registro malformado, provenance inválida, ids duplicados, `calc_paths` vacío |
| `PATH001` | Ruta declarada que no existe |
| `DUP001` | Un concepto calculado en más de una ruta |
| `LIT001` | Constante mágica en ruta `MEDIDA` o `DERIVADA` |
| `UI001` | Literal «medido/medidos» en componente |
| `SYN001` | Valor derivado de hash de identificador o PRNG determinista |
| `CONST001` | Métrica `CONSTANTE` con rutas de UI |
| `MOCK001` | Métrica `MOCK` sin banner declarado |
| `ORPH001` | Fichero con pinta de ruta de cálculo sin entrada en el registro (aviso) |

`SYN001` es el que caza el Radar de Retención. `UI001` caza «Datos cuantitativos
medidos». `CONST001` caza los tres sub-scores fijos de VSI.

## Primer arranque

```bash
/clear
lee docs/remediacion-metricas.md y CLAUDE.md, no hagas nada todavía
```

y pega el bloque G0 completo.
