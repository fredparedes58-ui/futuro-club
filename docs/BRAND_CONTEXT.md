# VITAS · Brand Context Document

> Todo el contexto necesario para crear el branding completo de VITAS Football Intelligence.
> Este documento sirve como fuente unica de verdad para diseñadores, creativos y desarrolladores.

---

## 1. Identidad de Marca

### Nombre
| Variante | Uso |
|----------|-----|
| **VITAS** | Nombre principal (siempre en mayusculas) |
| **VITAS.** | Con punto final — usado en headers de la app (el punto es color primary) |
| **VITAS.LAB** | Modulo de analisis de video |
| **VITAS Football Intelligence** | Nombre completo oficial |
| **VITAS · Football Intelligence** | Con separador (titulo de la PWA) |

### Empresa
**Prophet Horizon Technology**
- Aparece en footer: "© 2026 PROPHET HORIZON TECHNOLOGY"
- Build actual: 2.1.0

### Tagline Principal
> "Plataforma de inteligencia deportiva para deteccion, evaluacion y proyeccion de talento juvenil"

### Tagline Corto (Meta Description)
> "Inteligencia futbolistica con correccion de maduracion biologica. Detecta talento oculto en academias juveniles."

### Claim Competitivo
> "La unica plataforma de inteligencia futbolistica que ve al jugador, no al cuerpo"

### Proposito
VITAS existe para eliminar el sesgo biologico en la deteccion de talento juvenil. Miles de jugadores talentosos son descartados cada ano porque maduraron tarde fisicamente. VITAS ve el potencial real detras del cuerpo.

### Audiencia
| Segmento | Descripcion |
|----------|-------------|
| **Scouts** | Profesionales de deteccion de talento en academias |
| **Entrenadores** | Tecnicos de futbol juvenil que necesitan datos de sus jugadores |
| **Directores de Academia** | Responsables de decisiones estrategicas sobre plantilla juvenil |
| **Mercado geografico** | Latinoamerica y Europa del Sur (primera fase) |
| **Nivel** | Academias juveniles de nivel medio (no elite, no grassroots puro) |

### Tono de Comunicacion
- **Idioma:** Espanol (es-ES) nativo, sin anglicismos innecesarios
- **Registro:** Tecnico-deportivo, profesional pero accesible
- **Energia:** Dinamico, seguro, con autoridad cientifica
- **Iconografia textual:** Uso de ⚡ como simbolo de marca en exports
- **Labels UI:** Mayusculas con tracking extendido para etiquetas de estado

**Ejemplos de tono:**
- "Detecta talento oculto" (no "Find hidden talent")
- "ADN Futbolistico" (no "Player DNA")
- "Proyeccion de Carrera" (no "Career Projection")
- "Centro de Inteligencia" (no "Intelligence Center")
- "Madurador Tardio" (no "Late Bloomer")

---

## 2. Paleta de Colores

### Colores Principales

| Token | HSL | HEX Aproximado | Uso |
|-------|-----|-----------------|-----|
| **Primary** | `210 100% 35%` | `#0059B3` | Color principal de marca. Botones, links, acentos. |
| **Primary Light** | `210 100% 40%` | `#0066CC` | Neon, glows, focus rings |
| **Electric** | `290 70% 50%` | `#A855F7` | Acento secundario. Badges, metricas tecnicas |
| **Gold** | `38 92% 45%` | `#D4940A` | Tercer acento. Warnings, metricas medias, oro |
| **Cyan** | `180 70% 28%` | `#158585` | Cuarto acento. Code, datos, complementario |
| **Hot Pink** | `330 80% 50%` | `#E6197A` | Quinto acento. Decorativo, animaciones |

### Colores Semanticos

| Token | HSL | HEX Aprox | Uso |
|-------|-----|-----------|-----|
| **Destructive** | `0 84% 50%` | `#EF4444` | Errores, eliminar, peligro |
| **Success** | `142 76% 36%` | `#22C55E` | Exito, completado, online |
| **Warning** | `38 92% 50%` | `#F59E0B` | Advertencias, atencion |

### Fondos (Light Theme — Default Root)

| Token | HSL | HEX Aprox | Uso |
|-------|-----|-----------|-----|
| **Background** | `210 40% 98%` | `#F5F7FA` | Fondo principal de la app |
| **Card** | `0 0% 100%` | `#FFFFFF` | Fondo de tarjetas |
| **Surface Glass** | `0 0% 100% / 0.75` | White 75% opacity | Glassmorphism |
| **Surface Elevated** | `210 40% 96%` | `#EEF2F7` | Superficies elevadas |
| **Secondary** | `210 40% 94%` | `#E8EDF4` | Fondos secundarios |
| **Muted** | `210 40% 94%` | `#E8EDF4` | Elementos desactivados |

### Textos

| Token | HSL | HEX Aprox | Uso |
|-------|-----|-----------|-----|
| **Foreground** | `222 47% 11%` | `#0F1729` | Texto principal |
| **Muted Foreground** | `215 25% 30%` | `#38455A` | Texto secundario |
| **Dim** | — | `#5A6A82` | Texto terciario/meta |

### Bordes

| Token | HSL | HEX Aprox |
|-------|-----|-----------|
| **Border** | `214 32% 88%` | `#D8DFE9` |
| **Ring** | `210 100% 40%` | `#0066CC` |

### Colores de VSI (Gauge y Badges)

| Rango VSI | Color | HSL | Significado |
|-----------|-------|-----|-------------|
| 85+ (Elite) | Azul electrico | `230 70% 58%` | Rendimiento excepcional |
| 70-84 (Alto) | Purpura | `270 60% 55%` | Buen rendimiento |
| 50-69 (Medio) | Dorado | `38 90% 55%` | Rendimiento promedio |
| <50 (Desarrollo) | Rojo | `0 80% 60%` | Necesita desarrollo |

### Dark Theme (Usado en documentos/exports)

| Elemento | HEX |
|----------|-----|
| Background | `#0A0E17` |
| Card | `#111827` |
| Surface | `#1A2233` |
| Elevated | `#1F2B3D` |
| Border | `#2A3548` |
| Text | `#E2E8F0` |
| Text Muted | `#8B9AB5` |
| Text Dim | `#5A6A82` |

---

## 3. Tipografia

### Familias

| Familia | Tipo | Pesos | Uso |
|---------|------|-------|-----|
| **Rajdhani** | Display/Headers | 400, 500, 600, **700** | Titulos, labels, badges, numeros grandes |
| **Inter** | Body/UI | 300, 400, 500, **600** | Texto corrido, parrafos, formularios |
| **JetBrains Mono** | Monoespaciada | 400, 500 | Bloques de codigo, valores numericos tecnicos |

### Google Fonts URL
```
https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap
```

### Escala Tipografica

| Nivel | Font | Tamaño | Peso | Tracking | Uso |
|-------|------|--------|------|----------|-----|
| Hero | Rajdhani | 96-128px | 900 (black) | -0.02em (tighter) | Landing page hero |
| Display | Rajdhani | 60px | 700 (bold) | -0.01em (tight) | Titulos de seccion principales |
| H1 | Rajdhani | 24px | 700 (bold) | normal | Titulos de pagina |
| H2 | Rajdhani | 14px | 600 (semibold) | 0.05em (wider) | Secciones, siempre UPPERCASE |
| H3 | Rajdhani | 14px | 600 (semibold) | normal | Sub-secciones |
| Body | Inter | 14px (sm) | 400-500 | normal | Texto principal |
| Label | Rajdhani | 10-12px | 600 (semibold) | 0.05-0.1em (wider/widest) | Labels UI, UPPERCASE |
| Micro | Rajdhani | 9-10px | 500-600 | 0.05em (wider) | Status, metadata, UPPERCASE |
| Code | JetBrains Mono | 12-13px | 400 | normal | Valores tecnicos |

### Regla de Oro
- **Rajdhani** para todo lo que sea identidad visual: headers, labels, badges, numeros destacados
- **Inter** para todo lo que sea lectura: parrafos, descripciones, formularios
- **UPPERCASE + tracking extendido** para labels de estado, categorias, meta-informacion

---

## 4. Logo e Iconografia

### Logo Principal
- **Archivo:** `public/icon.svg`
- **Dimensiones:** 512x512 viewBox
- **Forma:** Rectangulo redondeado (rx=80) con balon de futbol estilizado
- **Color del icono:** `#1A6FCC` (primary blue) sobre fondo `#F0F4F8`
- **Texto en logo:** "VITAS" (Rajdhani-style, size 72, spacing 4) + "FOOTBALL" (size 24, spacing 6, `#4A90D9`)
- **Elementos:** Circulo exterior (stroke 12px) + pentagono central + lineas conectoras (stroke 8px, round caps)

### Iconos PWA
| Archivo | Tamano | Uso |
|---------|--------|-----|
| `favicon.ico` | Multi-size | Pestana del navegador |
| `pwa-64x64.png` | 64x64 | PWA pequeno |
| `pwa-192x192.png` | 192x192 | PWA Android |
| `pwa-512x512.png` | 512x512 | PWA splash |
| `maskable-icon-512x512.png` | 512x512 | Android adaptive icon |
| `apple-touch-icon-180x180.png` | 180x180 | iOS home screen |

### Iconos UI (Lucide React)
La app usa exclusivamente **Lucide React** (v0.462.0) para iconografia UI:
- Navegacion: `LayoutDashboard`, `Camera`, `GitCompareArrows`, `Settings`, `Trophy`
- Metricas: `Activity`, `TrendingUp`, `Zap`, `Brain`, `Dna`, `Target`
- Acciones: `Plus`, `Pencil`, `Trash2`, `FileDown`, `Upload`, `Play`, `Pause`
- Estado: `Check`, `AlertCircle`, `AlertTriangle`, `Loader2`
- Video: `Video`, `Camera`, `ScanSearch`
- Social: `Users`, `UserCircle2`, `UserRound`

### Simbolo de Marca
- **⚡** (emoji rayo) — usado como prefijo en textos exportados y compartidos
- Ejemplo: `⚡ Pedrito | VSI 78 | Se parece a Pedri (87%) — Generado con VITAS Football Intelligence`

---

## 5. Efectos Visuales

### Glassmorphism
```css
.glass {
  background: hsl(0 0% 100% / 0.75);    /* Blanco al 75% */
  backdrop-filter: blur(16px);
  border: 1px solid hsl(214 32% 88%);    /* Borde sutil */
}

.glass-strong {
  background: hsl(0 0% 100% / 0.92);    /* Blanco al 92% */
  backdrop-filter: blur(24px);
  border: 1px solid hsl(214 32% 88%);
}
```
**Uso:** Tarjetas, paneles de navegacion, overlays. Es el efecto visual principal de toda la UI.

### Neon Glow
```css
.neon-glow {
  box-shadow: 0 4px 24px hsl(210 100% 40% / 0.2),
              0 1px 4px hsl(210 100% 40% / 0.1);
}

.neon-text {
  text-shadow: 0 1px 8px hsl(210 100% 40% / 0.3);
}
```
**Uso:** Elementos interactivos en hover, indicadores de estado activo.

### Gradient de Marca
```css
/* Gradiente principal — usado en texto, bordes, decoraciones */
background: linear-gradient(135deg,
  hsl(210 100% 35%),    /* Primary Blue */
  hsl(290 70% 42%),     /* Electric Purple */
  hsl(180 70% 28%)      /* Cyan */
);
```
**Uso:** Texto gradiente (`.gradient-text`), lineas decorativas, separadores premium.

### Border Glow Animado
```css
@keyframes border-glow {
  0%, 100% {
    border-color: hsl(var(--primary) / 0.6);
    box-shadow: 0 0 20px hsl(var(--primary) / 0.15);
  }
  33% {
    border-color: hsl(var(--accent) / 0.6);
    box-shadow: 0 0 20px hsl(var(--accent) / 0.15);
  }
  66% {
    border-color: hsl(var(--cyan) / 0.6);
    box-shadow: 0 0 20px hsl(var(--cyan) / 0.15);
  }
}
```
**Duracion:** 4 segundos, infinite.
**Uso:** Cards premium, elementos destacados. El borde cambia entre azul → purpura → cyan.

### Pulse Live
```css
@keyframes pulse-neon {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 8px hsl(210 100% 40% / 0.4),
                0 0 20px hsl(210 100% 40% / 0.15);
  }
  50% {
    opacity: 0.6;
    box-shadow: 0 0 14px hsl(290 70% 50% / 0.3),
                0 0 30px hsl(290 70% 50% / 0.1);
  }
}
```
**Duracion:** 2 segundos, infinite.
**Uso:** Indicador "En Vivo", pulso de estado activo.

### Card Hover
```css
.card-hover:hover {
  border-color: hsl(var(--primary) / 0.5);
  box-shadow: 0 4px 32px hsl(var(--primary) / 0.2),
              0 0 80px hsl(var(--accent) / 0.08);
}
```
**Uso:** Todas las tarjetas interactivas.

### Gradientes de Fondo (Landing)
```css
/* Orbes de luz ambiental */
radial-gradient(ellipse 90% 70% at 15% 5%, hsl(210 100% 40% / 0.08), transparent 55%)  /* Azul arriba-izquierda */
radial-gradient(ellipse 70% 60% at 85% 85%, hsl(290 70% 50% / 0.06), transparent 50%)  /* Purpura abajo-derecha */
radial-gradient(ellipse 50% 50% at 50% 40%, hsl(180 70% 35% / 0.04), transparent 40%)  /* Cyan centro */
radial-gradient(ellipse 40% 30% at 70% 20%, hsl(330 80% 50% / 0.03), transparent 35%)  /* Pink decorativo */
```
**Uso:** Background de la landing page. Crea un efecto de luces ambientales sutiles.

---

## 6. Componentes de UI Clave

### Border Radius
```
--radius: 0.75rem (12px base)
rounded-lg:  12px   → Cards, dialogos
rounded-md:  10px   → Botones
rounded-sm:  8px    → Inputs
rounded-xl:  16px   → Cards grandes, panels
rounded-full: 9999px → Badges, avatars, pills
```

### Botones
| Variante | Fondo | Texto | Hover |
|----------|-------|-------|-------|
| **Default** | Primary | White | primary/90 |
| **Destructive** | Red | White | red/90 |
| **Outline** | Transparent + border | Foreground | accent bg |
| **Secondary** | Secondary | Foreground | secondary/80 |
| **Ghost** | Transparent | Foreground | accent bg |
| **Link** | Transparent | Primary + underline | underline visible |

### Badges/Pills
| Variante | Fondo | Texto |
|----------|-------|-------|
| **Default** | Primary | White |
| **Secondary** | Secondary | Foreground |
| **Destructive** | Red | White |
| **Outline** | Transparent + border | Foreground |
| **VSI Elite** | primary/10 | Primary |
| **VSI Alto** | electric/10 | Electric |
| **VSI Medio** | gold/10 | Gold |

### Gauge VSI
- Circulo SVG con animacion de llenado (1.2s ease-out)
- Color dinamico segun valor (azul/purpura/dorado/rojo)
- Drop shadow glow del mismo color
- Fondo del anillo: `hsl(225, 20%, 18%)`
- Tamaños: sm (48px), md (56px), lg (64px)

### Radar Chart
- 6 vertices: Speed, Technique, Vision, Stamina, Shooting, Defending
- Grid: `hsl(225, 18%, 22%)`
- Fill: azul electrico al 15% opacidad
- Stroke: azul electrico solido
- Labels: Rajdhani 11px

### Tarjetas de Metrica
```
glass rounded-xl p-3/4
  → Icono (14-18px, color primary/electric/gold) + Label (Rajdhani 10px uppercase tracking-wider)
  → Valor grande (Rajdhani bold text-xl)
  → Sub-label (Inter 10px muted)
```

---

## 7. Motion Design

### Framer Motion — Patrones Principales

**Entrada de pagina:**
```javascript
container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }
```

**Transiciones:**
- Paginas: `opacity 0→1`, `y 20→0`, duracion 0.4s
- Stagger entre elementos: 0.06s (60ms)
- Barras de progreso: `width 0→N%`, 0.8s ease-out
- Gauge VSI: 1.2s ease-out
- Spring physics: stiffness 400, damping 30 (menus popup)

**AnimatePresence:**
- Usado para entrada/salida de reportes, paneles, y sheets
- Exit: `opacity 0, scale 0.95`

---

## 8. Imagenes y Assets de Marca

### Imagen de Login
- **Archivo:** `src/assets/login-boot-neon.jpg`
- **Tema:** Botin de futbol con estetica neon/glow
- **Uso:** Background de la pantalla de login

### Campo de Futbol
- **Archivo:** `src/assets/pitch-field.jpg`
- **Uso:** Fondo del tracking/heatmap en VitasLab

### Placeholder
- **Archivo:** `public/placeholder.svg`
- **Uso:** Imagen placeholder generica

---

## 9. Manifiesto PWA

```json
{
  "name": "VITAS · Football Intelligence",
  "short_name": "VITAS",
  "description": "Inteligencia futbolistica con correccion de maduracion biologica...",
  "theme_color": "#f0f4f8",
  "background_color": "#f0f4f8",
  "display": "standalone",
  "orientation": "portrait",
  "scope": "/",
  "start_url": "/",
  "lang": "es"
}
```

### Meta Tags HTML
```html
<meta name="theme-color" content="#f0f4f8" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="VITAS" />
<meta property="og:title" content="VITAS · Football Intelligence" />
<meta property="og:description" content="Detecta talento oculto en academias juveniles con IA y correccion PHV." />
<meta name="twitter:card" content="summary_large_image" />
```

---

## 10. Vocabulario de Marca

### Terminologia Propia de VITAS
| Termino | Significado | Uso |
|---------|-------------|-----|
| **VSI** | VITAS Scouting Index | Score principal 0-100 |
| **TruthFilter** | Filtro de verdad | Ajuste de VSI eliminando sesgos |
| **UBI** | Unified Bias Index | Indice de sesgo combinado |
| **ADN Futbolistico** | Perfil cualitativo del jugador | Seccion del reporte IA |
| **Talento Oculto** | Jugador subestimado por maduracion tardia | Alerta en dashboard |
| **Madurador Tardio** | Jugador que aun no llego a su pico fisico | Categoria PHV |
| **Madurador Precoz** | Jugador que ya paso su pico fisico | Categoria PHV |
| **Centro de Inteligencia** | Dashboard principal | Subtitulo del hub |
| **VITAS.LAB** | Laboratorio de video | Modulo de analisis |

### Modulos de la App con Color
| Modulo | Color | Tag |
|--------|-------|-----|
| Pulse (Dashboard) | Primary | LIVE |
| Master Dashboard | Primary | AI |
| Scout Feed | Primary | NEW |
| VITAS.LAB | Primary | BETA |
| Rankings | Primary | — |
| Compare | Electric | — |
| Director | Gold | — |
| Settings | Gold | — |

### Abreviaturas de Metricas
| Abreviatura | Metrica Completa |
|-------------|-----------------|
| VEL | Velocidad (Speed) |
| TEC | Tecnica (Technique) |
| VIS | Vision |
| RES | Resistencia (Stamina) |
| DIS | Disparo (Shooting) |
| DEF | Defensa (Defending) |

---

## 11. Identidad Visual — Resumen Rapido

### Los 5 Principios de Diseño VITAS
1. **Glass First:** Glassmorphism como lenguaje visual principal. Transparencia + blur.
2. **Neon Accents:** Glows y pulsos sutiles para comunicar actividad y datos en vivo.
3. **Data Dense:** Mucha informacion en poco espacio. Labels micro (9-10px), cards compactas.
4. **Motion Meaning:** Cada animacion comunica algo (cargando, exito, transicion, en vivo).
5. **Science + Sport:** Estetica que mezcla dashboard cientifico con energia deportiva.

### La Triada de Color
```
Primary Blue (#0059B3) → Confianza, tecnologia, profesionalismo
Electric Purple (#A855F7) → Innovacion, IA, datos avanzados
Gold (#D4940A) → Excelencia, talento, logros
```

### La Jerarquia Tipografica
```
Rajdhani (Display) → "Esto es importante, miralo"
Inter (Body) → "Esto es para leer con calma"
JetBrains Mono (Code) → "Esto es un dato tecnico exacto"
```

### El Patron VITAS
```
[Glass Card] → [Icono color + Label UPPERCASE] → [Valor grande Rajdhani] → [Sub-texto Inter muted]
```
Este patron se repite en toda la app: stats del dashboard, metricas de jugador, tracking panel, etc.

---

## 12. Assets para Diseñadores

### Archivos de referencia en el proyecto
```
public/icon.svg                          → Logo principal
src/assets/login-boot-neon.jpg           → Background login
src/assets/pitch-field.jpg               → Campo de futbol
src/index.css                            → Todos los tokens CSS
tailwind.config.ts                       → Config de diseño
src/components/VsiGauge.tsx              → Componente gauge circular
src/components/RadarChart.tsx            → Radar de 6 metricas
src/components/PlayerCard.tsx            → Card de jugador
src/components/LiveMatchCard.tsx         → Card de partido
src/components/TrackingMetricsPanel.tsx  → Panel de metricas fisicas
src/components/VoronoiOverlay.tsx        → Overlay territorial
src/pages/Dashboard.tsx                  → Layout del hub principal
src/pages/VitasLab.tsx                   → Layout del laboratorio
docs/export/*.html                       → HTMLs con diseño VITAS aplicado
```

### Colores para Figma / Adobe (Hex)
```
Primary:     #0059B3
Primary Lt:  #0066CC
Electric:    #A855F7
Electric Lt: #C084FC
Gold:        #D4940A
Gold Lt:     #F5B731
Cyan:        #158585
Hot Pink:    #E6197A
Danger:      #EF4444
Success:     #22C55E

BG Light:    #F5F7FA
BG Dark:     #0A0E17
Card Light:  #FFFFFF
Card Dark:   #111827
Border Light:#D8DFE9
Border Dark: #2A3548
Text Light:  #0F1729
Text Dark:   #E2E8F0
Muted Light: #38455A
Muted Dark:  #8B9AB5
```

---

> Este documento contiene todo el contexto necesario para que un diseñador, agencia o herramienta de IA pueda crear materiales de marca consistentes con VITAS Football Intelligence.
