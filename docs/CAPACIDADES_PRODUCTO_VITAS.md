# VITAS Football Intelligence — Qué Incluye la Plataforma

> **Versión**: 2.1.0 · **Abril 2026**
> **Una plataforma de scouting e inteligencia deportiva potenciada por IA**

---

## ¿Qué es VITAS?

VITAS es una plataforma de análisis de fútbol que combina inteligencia artificial, análisis de video y ciencia del deporte para evaluar jugadores juveniles y profesionales. Funciona como aplicación web instalable en cualquier dispositivo (móvil, tablet, PC) sin necesidad de descargas.

---

## Análisis de Jugadores

### Índice de Scouting (VSI)

Cada jugador recibe un puntaje de 0 a 100 llamado **VSI** que evalúa 6 dimensiones:

- **Velocidad** — Rapidez y aceleración
- **Técnica** — Control de balón, regate, primer toque
- **Visión** — Lectura de juego y pases creativos
- **Resistencia** — Capacidad aeróbica y recuperación
- **Disparo** — Precisión y potencia de tiro
- **Defensa** — Posicionamiento, anticipación y duelos

El VSI se actualiza con cada análisis y muestra la evolución del jugador en el tiempo con tendencias de subida, bajada o estabilidad.

### Maduración Biológica (PHV)

VITAS calcula el estado de maduración biológica de cada jugador juvenil usando la fórmula científica de Mirwald. Esto permite:

- Saber si un jugador es **precoz**, **normal** o **tardío** en su desarrollo físico
- Ajustar las evaluaciones para no penalizar a jugadores que maduran más tarde
- Identificar ventanas críticas de desarrollo donde el entrenamiento tiene más impacto
- Detectar talentos ocultos que otros sistemas pasan por alto por sesgo de maduración

### Valoración de Acciones (VAEP)

Sistema que calcula el impacto real de cada acción del jugador (pases, disparos, recuperaciones, duelos) midiendo cuánto contribuye cada acción a la probabilidad de marcar gol. Se expresa como **VAEP por 90 minutos**.

### Rankings y Comparaciones

- **Ranking global**: Todos los jugadores ordenados por VSI con filtros por posición, edad y maduración
- **Podio visual**: Top 3 destacados con iconografía especial
- **Comparación dual**: Selecciona dos jugadores y compáralos lado a lado con gráficas superpuestas
- **Percentiles**: Saber en qué percentil está un jugador respecto a sus pares

---

## Análisis de Video con IA

### Subida y Procesamiento

- Sube videos desde el móvil o PC directamente a la plataforma
- Los videos se procesan y almacenan en CDN de alta velocidad (Bunny Stream)
- Streaming adaptativo que funciona en cualquier conexión

### Tracking de Jugadores en Tiempo Real

VITAS incluye un modelo de inteligencia artificial (YOLOv8) que funciona directamente en el navegador y detecta automáticamente:

- **Posición de cada jugador** en el campo en tiempo real
- **17 puntos corporales** por jugador (pose completa)
- **Velocidad, distancia y sprints** calculados frame a frame
- **Giros de cabeza** (escaneos del entorno)
- **Duelos** por proximidad entre jugadores

### Modos de Análisis

| Modo | Qué analiza |
|------|-------------|
| **Todos los jugadores** | Heatmap completo del equipo |
| **Click-to-Track** | Selecciona manualmente a quién seguir |
| **Equipo completo** | Análisis separado local vs visitante |
| **Jugador específico** | Seguimiento por número de camiseta |

### Focos de Análisis

Puedes elegir en qué enfocarte:
- Acciones ofensivas
- Acciones defensivas
- Recuperación de balón
- Duelos
- Velocidad y aceleración
- Precisión de pase

### Análisis por Inteligencia Artificial

Además del tracking automático, 8 agentes de IA analizan el video y generan:

- **Formación detectada** del equipo
- **Fase táctica** (ataque, defensa, transición, balón parado)
- **Movimientos clave** identificados
- **Intensidad física** del partido
- **Posesión estimada** por equipo
- **Reporte completo** con métricas cuantitativas y cualitativas

---

## Métricas Físicas

Después de cada sesión de tracking, VITAS genera automáticamente:

| Métrica | Descripción |
|---------|-------------|
| Velocidad máxima | La mayor velocidad alcanzada (km/h) |
| Velocidad media | Promedio de velocidad durante la sesión |
| Distancia total | Metros recorridos en total |
| Sprints | Cantidad de carreras a más de 21 km/h |
| Aceleración máxima | Pico de aceleración (m/s²) |
| Cobertura de campo | % del campo que recorrió el jugador |
| Zonas de intensidad | Tiempo en caminata, trote, carrera y sprint |

---

## Visualizaciones y Gráficas

### Gráficas del Jugador

- **Radar de 6 ejes**: Visualización hexagonal de las 6 métricas principales
- **Gauge VSI**: Indicador circular de puntaje con colores por nivel
- **Evolución temporal**: Gráfica de área que muestra cómo ha cambiado el VSI en el tiempo
- **Barras de intensidad**: Distribución visual de zonas de movimiento

### Mapas de Campo

- **Heatmap posicional**: Mapa de calor sobre el campo de fútbol mostrando dónde estuvo más tiempo el jugador (grilla de 21×14 celdas sobre campo de 105×68m)
- **Diagrama de Voronoi**: Muestra en tiempo real cuánto espacio controla cada jugador detectado, con polígonos de colores superpuestos sobre el video

### Cards y Reportes

- **VITAS Card**: Card premium exportable con radar, VSI, PHV, top métricas y jugador profesional similar — descargable como imagen PNG
- **Reporte de Jugador**: Documento imprimible/PDF con todas las métricas, gráficas y evaluaciones
- **Reporte de Análisis**: Documento con el resultado completo del análisis de video
- **Timeline de Análisis**: Historial cronológico de todos los análisis realizados a un jugador

### Dashboards

- **Pulse** (principal): 4 indicadores clave, partidos en vivo, jugadores trending
- **Master**: Tabla de todos los jugadores con alertas de sesgo, distribución por nivel y posición
- **Director** (Club): Vista ejecutiva con analytics de uso del equipo

---

## Comparación con Profesionales

### Base de Datos de Referencia

VITAS incluye una base de datos de **más de 300 jugadores profesionales de élite** de las principales ligas del mundo:

- Premier League, La Liga, Serie A, Bundesliga, Ligue 1 y más
- Más de 40 nacionalidades representadas
- Todas las posiciones (portero, defensa, mediocampista, delantero)
- Datos completos: velocidad, técnica, visión, resistencia, disparo, defensa, estatura, valor de mercado

### Jugador Clon

Para cada jugador analizado, VITAS encuentra automáticamente los **5 profesionales más similares** usando similitud matemática (coseno) en 6 dimensiones. Las comparaciones se ajustan por edad usando curvas de desarrollo científicas.

---

## Base de Conocimiento (Ejercicios y Metodología)

### Biblioteca de Ejercicios

VITAS incluye una biblioteca de **más de 100 ejercicios** organizados por categoría:

| Categoría | Ejemplos |
|-----------|----------|
| Técnica | Rondos, circuitos de control, ejercicios de primer toque |
| Táctica | Salida de balón, pressing, transiciones |
| Físico | Velocidad con balón, resistencia, coordinación |
| Disparo | Finalización, disparo desde fuera del área |
| Transición | Contraataques, cambios de juego |
| Pressing | Pressing alto, medio, bajo |

Cada ejercicio incluye: objetivos, rango de edad recomendado, duración, espacio necesario, nivel de dificultad y progresiones.

### Búsqueda Inteligente

El buscador usa inteligencia artificial para encontrar ejercicios relevantes según las necesidades del jugador. Por ejemplo, si un jugador tiene debilidades en visión de juego, el sistema recomienda automáticamente ejercicios específicos para mejorar esa dimensión.

---

## Gestión de Equipos (Plan Club)

### Roles y Permisos

| Rol | Qué puede hacer |
|-----|-----------------|
| **Propietario** | Todo: gestión, facturación, equipo |
| **Director** | Gestión de jugadores, análisis, reportes |
| **Entrenador** | Análisis, asignación de ejercicios, tracking |
| **Analista** | Solo lectura + ejecutar análisis |
| **Visualizador** | Solo consultar información |

### Invitaciones

- Invita a miembros del staff por email
- Cada invitación tiene un rol asignado y fecha de expiración
- El invitado acepta desde un enlace y se une automáticamente al equipo

### Dashboard Director

Vista exclusiva para directores deportivos con:
- Cantidad de jugadores activos
- Uso de análisis del equipo
- Alertas de límites de plan
- Rendimiento global del equipo

### Análisis de Equipo

- Formación detectada automáticamente
- Posesión estimada por equipo
- Heatmaps individuales por jugador
- Clasificación de rendimiento (destacado / bueno / regular / bajo)

---

## Notificaciones Push

Recibe alertas directamente en tu dispositivo:

- **Rendimiento bajo**: Cuando el VSI de un jugador cae por debajo de 50
- **Inactividad**: Cuando un jugador lleva más de 30 días sin actualizar
- **Límite de plan**: Cuando te acercas al máximo de jugadores o análisis
- **Análisis completado**: Cuando un análisis de video termina de procesarse

Las notificaciones son configurables — puedes activar o desactivar cada tipo desde Configuración.

---

## Respaldo y Seguridad

- **Exportar datos**: Descarga todos tus datos (jugadores, videos, configuraciones) como archivo JSON
- **Importar datos**: Restaura desde un archivo de respaldo con validación automática
- **Diagnóstico automático**: La plataforma verifica su salud cada vez que la abres
- **Modo offline**: Los cambios se guardan localmente y se sincronizan al reconectar
- **Indicador de conexión**: Siempre sabes si estás online, sincronizando o con cambios pendientes

---

## Partidos en Vivo

Widget en el dashboard que muestra partidos en tiempo real con:
- Equipos, marcador y minuto actual
- Actualización automática cada 60 segundos
- Datos de Football-Data.org

---

## Planes y Precios

| | Free | Pro | Club |
|--|------|-----|------|
| **Precio** | Gratis | €19/mes | €79/mes |
| **Jugadores** | 5 | 25 | Sin límite |
| **Análisis IA por mes** | 3 | 20 | Sin límite |
| **Tracking de video** | Incluido | Incluido | Incluido |
| **Métricas físicas** | Incluido | Incluido | Incluido |
| **Comparación con profesionales** | Incluido | Incluido | Incluido |
| **Heatmaps y Voronoi** | Incluido | Incluido | Incluido |
| **Rankings** | Incluido | Incluido | Incluido |
| **VAEP (valoración de acciones)** | — | Incluido | Incluido |
| **Exportar reportes PDF** | — | Incluido | Incluido |
| **Notificaciones push** | — | Incluido | Incluido |
| **Perfiles tácticos (Role Profile)** | — | — | Incluido |
| **Multi-usuario y roles** | — | — | Incluido |
| **Dashboard Director** | — | — | Incluido |
| **Gestión de equipo** | — | — | Incluido |

### ¿Para quién es cada plan?

- **Free**: Padres, scouts independientes o curiosos que quieren probar la plataforma con hasta 5 jugadores
- **Pro**: Scouts profesionales, entrenadores de academia o analistas que trabajan con hasta 25 jugadores y necesitan reportes PDF y análisis avanzados
- **Club**: Clubes profesionales, academias grandes o centros de formación que necesitan usuarios ilimitados, gestión de equipo y análisis sin restricciones

---

## Funciona en Cualquier Dispositivo

VITAS es una **PWA (Progressive Web App)** — se instala como una app nativa desde el navegador:

- Funciona en **iPhone, Android, iPad, PC y Mac**
- **No requiere descarga** desde tienda de aplicaciones
- Funciona **sin conexión** (los datos se sincronizan al reconectar)
- Se **actualiza automáticamente** sin intervención del usuario

---

## Tecnología Detrás de VITAS

| Componente | Tecnología |
|------------|-----------|
| Interfaz | React 18 con diseño responsive |
| Inteligencia Artificial | Claude (Anthropic) + Gemini (Google) |
| Detección de jugadores | YOLOv8 ejecutado en el navegador |
| Video | Bunny Stream CDN con streaming adaptativo |
| Base de datos | Supabase (PostgreSQL) |
| Pagos | Stripe con facturación mensual |
| Hosting | Vercel con edge computing global |
| Seguridad | Autenticación Supabase, validación en todos los endpoints |

---

*VITAS · Prophet Horizon Technology · © 2026*
