# VITAS · Notion Sync — Setup Guide (5 minutos)

Mantiene tu página Notion automáticamente sincronizada con `docs/*.md`
del repo. Cada vez que cualquiera (yo o tú) hace `git push` con cambios
en `docs/`, **GitHub Actions** dispara un job que actualiza Notion.

---

## ✅ Lo que vas a tener

```
Tú/yo editamos docs/VITAS_MASTER.md
            ↓
        git push
            ↓
GitHub Actions detecta el cambio (~5 seg)
            ↓
Lee los .md, los convierte a bloques Notion
            ↓
Limpia tu página Notion → escribe contenido fresco
            ↓
✅ Notion actualizado (~30-60 seg total)
```

---

## 🛠️ Setup en 5 minutos

### Paso 1 — Crear "Integration" en Notion (1 min)

1. Ve a **https://www.notion.so/my-integrations**
2. Click **"+ New integration"**
3. Rellena:
   - **Name**: `VITAS Sync`
   - **Associated workspace**: tu workspace
   - **Type**: Internal
4. Click **Submit**
5. En la página resultante, copia el **"Internal Integration Secret"**
   (empieza por `secret_...`). **Guárdalo a salvo.**

### Paso 2 — Compartir la página con la Integration (30 seg)

1. Abre tu página de Notion donde quieres que aparezcan los docs
   (puedes crear una nueva llamada **"VITAS Master"** vacía)
2. Click en los **`···`** (tres puntos) arriba a la derecha
3. **"+ Add connections"** → busca **"VITAS Sync"** → click
4. Confirma con **"Confirm"**

### Paso 3 — Copiar el Page ID (30 seg)

1. En esa misma página, **copia la URL** del navegador
2. La URL tiene este formato:
   ```
   https://www.notion.so/Your-Page-Name-32-caracteres-hex
   ```
3. **El Page ID son los 32 caracteres del final** (sin guiones)

   Ejemplo:
   - URL: `https://www.notion.so/VITAS-Master-abc123def456789...`
   - Page ID: `abc123def456789012345678901234ab`

### Paso 4 — Añadir los Secrets a GitHub (1 min)

1. Ve a tu repo: **https://github.com/fredparedes58-ui/futuro-club**
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** dos veces:

   | Name | Value |
   |---|---|
   | `NOTION_TOKEN` | El secret del Paso 1 (`secret_...`) |
   | `NOTION_PAGE_ID` | Los 32 caracteres del Paso 3 |

4. Click **"Add secret"** en cada uno.

### Paso 5 — Probar el sync (1 min)

**Opción A — Forzar manualmente desde GitHub:**
1. Ve a **Actions** → **"Sync docs to Notion"**
2. Click **"Run workflow"** → branch `main` → **"Run workflow"**
3. Refresca → verás un job corriendo
4. ~30 segundos después → completado ✅
5. Abre tu página Notion → debería tener el contenido del master

**Opción B — Hacer un cambio real en docs/:**
- Edita cualquier `.md` en `docs/`, haz commit + push
- El workflow se dispara automáticamente

---

## ✅ Cómo verificar que funciona

Después del primer run exitoso:

1. **GitHub Actions** → debe haber un check verde junto al último commit
2. **Notion** → tu página debe tener el contenido completo del master:
   - Cabecera con título "VITAS · Master Document"
   - Las 16 secciones
   - Tablas convertidas correctamente
   - Code blocks con syntax highlight

Cualquier futuro push que toque `docs/` o el script lo actualiza
automáticamente.

---

## 🎛️ Personalización

### Sincronizar otros archivos
Edita `.github/workflows/notion-sync.yml`, sección `NOTION_SYNC_FILES`:

```yaml
NOTION_SYNC_FILES: "docs/VITAS_MASTER.md,docs/BUNNY_SETUP.md,docs/MI_NUEVO.md"
```

### Sincronizar a múltiples páginas
Necesitas duplicar el workflow con otro `NOTION_PAGE_ID` y otra
selección de archivos. Cada workflow puede escribir a una página
distinta.

### Hacer dry-run (probar sin tocar Notion)
1. Actions → **Sync docs to Notion** → **Run workflow**
2. En **dry_run** elige `true`
3. El job se ejecuta pero no escribe nada en Notion
4. En los logs verás qué bloques se hubieran subido

---

## ❓ Troubleshooting

### "Cannot access Notion page"
**Causa:** La integration no tiene permiso sobre la página.
**Fix:** Repite el **Paso 2** (compartir página con `VITAS Sync`).

### "object_not_found"
**Causa:** Page ID incorrecto.
**Fix:** Verifica que copiaste los 32 caracteres correctos del final
de la URL (sin guiones, sin "p=", etc.).

### "Unauthorized"
**Causa:** Token Notion incorrecto o caducado.
**Fix:** Regenera la integration y actualiza `NOTION_TOKEN` en GitHub
secrets.

### "Las tablas se ven feas"
**Causa:** Notion API tiene limitaciones convirtiendo tablas grandes.
**Fix:** Si una tabla concreta queda mal, considera:
- Romperla en varias más pequeñas
- O convertirla a una database manualmente en Notion (que no se
  sobreescribe en cada sync)

### "Mis comentarios en Notion desaparecieron"
**Causa esperada:** Cada sync borra el contenido de la página y lo
reescribe. Los comentarios anclados a bloques específicos pueden
perderse.
**Solución:** No edites el contenido directamente en Notion — edita
los `.md` en el repo. Si quieres añadir notas/comentarios privados,
hazlo en **una sub-página** que no esté en la lista de sync.

### "El workflow no se dispara"
**Causa:** Has cambiado un archivo que no está en el `paths` del
workflow.
**Fix:** Edita `.github/workflows/notion-sync.yml` → sección `paths`
para incluir el patrón que necesitas.

---

## 💰 Coste

**$0.** GitHub Actions free tier cubre miles de minutos/mes. El sync
tarda ~30-60 seg, así que con uso normal nunca se acerca al límite.
Notion API también es gratis para uso razonable.

---

## 🚫 Limitaciones conocidas

| Limitación | Workaround |
|---|---|
| Cada sync REEMPLAZA el contenido de la página | Edita los `.md`, no Notion |
| Imágenes locales (`./img.png`) no se suben | Usa URLs absolutas (Imgur, Bunny, etc.) |
| Bloques anidados muy profundos pueden aplanarse | Limita anidación a 3 niveles |
| Code blocks > 2000 chars se truncan | Divide bloques grandes |
| Notion API rate limit: 3 req/sec | El script ya batchea de 100 en 100 |

---

## 🎯 Siguiente nivel (opcional)

Si quieres más sofisticación más adelante:

1. **Sync incremental** (solo cambios, no reemplazo total)
   - Necesita comparar diff entre versiones
   - Complejidad: alta

2. **Múltiples páginas según archivo**
   - Cada `.md` va a su propia página Notion
   - Útil si quieres jerarquía

3. **Notion → GitHub sync (bidireccional)**
   - Posible pero arriesgado (conflictos)
   - No recomendado

Por ahora, el sync unidireccional `GitHub → Notion` cubre el 99% de
casos de uso.
