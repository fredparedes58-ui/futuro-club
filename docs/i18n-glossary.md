# VITAS · Glosario de localización (it, de, fr, nl, es-419)

Guía de terminología y reglas para traducir `src/i18n/es.json` (fuente) a los
idiomas nuevos. Objetivo: calidad y **coherencia** iguales al inglés (`en.json`).
Producto de **scouting y desarrollo de futbolistas menores de edad** → precisión
y sensibilidad son obligatorias.

## Reglas duras (NO negociables)

1. **Preservar las claves** exactamente. Solo se traduce el **valor** de cada clave.
2. **Preservar los placeholders de interpolación** tal cual: `{{name}}`, `{{count}}`,
   `{{vsi}}`, etc. No traducir ni reordenar lo que va dentro de `{{ }}`.
3. **NO traducir** (dejar idénticos):
   - Marca: **VITAS** (y nombres de módulos propios: Pulse, Scout, Master, VITAS.LAB…).
   - Siglas técnicas: **PHV**, **VSI**, **ACWR**, **RGPD/GDPR** (usar la sigla local si
     existe: RGPD en fr/es, DSGVO en de, AVG en nl, GDPR en en/it), **PWA**.
   - Tokens de enum / estados internos si aparecen como valores literales
     (`elite`, `alto`, `medio`, `en_desarrollo`, `youth`, `senior`…): normalmente son
     claves, no texto; si dudas, no los toques.
   - Emojis, URLs, rutas, código, etiquetas HTML.
4. **Números, unidades y formato**: mantener `km/h`, `m`, `%`, cifras. Usar la
   convención decimal del idioma solo si el string ya la explicita (no inventar).

## Terminología de MADURACIÓN (crítica — no invertir)

El sistema usa la convención **peer-relativa**. Traducir con el término correcto,
nunca literal:

| Concepto (es) | it | de | fr | nl | es-419 |
|---|---|---|---|---|---|
| madurador **tardío** (pre-PHV, aún no da el estirón; talento infravalorado) | maturatore **tardivo** | **Spätentwickler** | maturateur **tardif** | **laatrijpe** speler | madurador **tardío** |
| madurador **precoz** (post-PHV, ventaja física temporal) | maturatore **precoce** | **Frühentwickler** | maturateur **précoce** | **vroegrijpe** speler | madurador **precoz** |
| maduración biológica | maturazione biologica | biologische Reifung | maturation biologique | biologische rijping | maduración biológica |
| pico de velocidad de crecimiento (PHV) | PHV (picco di velocità di crescita) | PHV (Peak Height Velocity) | PHV (pic de croissance) | PHV (piek groeisnelheid) | PHV |

> NUNCA describir a un jugador pre-PHV como «precoz/temprano» ni a uno post-PHV
> como «tardío». La inversión es un error de seguridad, no de estilo.

## Terminología del dominio (fútbol / scouting)

| es | it | de | fr | nl |
|---|---|---|---|---|
| jugador | giocatore | Spieler | joueur | speler |
| entrenador | allenatore | Trainer | entraîneur | trainer |
| ojeador / scout | osservatore | Scout | recruteur | scout |
| cantera / academia | settore giovanile | Nachwuchs / Akademie | centre de formation | jeugdopleiding |
| portero | portiere | Torwart | gardien | keeper |
| central | difensore centrale | Innenverteidiger | défenseur central | centrale verdediger |
| lateral | terzino | Außenverteidiger | latéral | vleugelverdediger |
| pivote / mediocentro | mediano / centrocampista | Sechser / Mittelfeld | milieu défensif | verdedigende middenvelder |
| interior | mezzala | Achter / Mittelfeld | milieu relayeur | centrale middenvelder |
| extremo | esterno / ala | Flügelspieler | ailier | vleugelspeler |
| delantero / punta | attaccante / punta | Stürmer | attaquant | spits |
| regate | dribbling | Dribbling | dribble | dribbel |
| pase | passaggio | Pass | passe | pass |
| disparo / definición | tiro / finalizzazione | Torabschluss | finition | afwerking |
| pressing | pressing | Pressing | pressing | pressing |
| duelo | duello | Zweikampf | duel | duel |
| desmarque | smarcamento | Freilaufen | démarquage | vrijlopen |
| escaneo (giro de cabeza) | scansione | Scanning / Umblicken | prise d'information | scannen |
| carga de entrenamiento | carico di allenamento | Trainingsbelastung | charge d'entraînement | trainingsbelasting |
| lesión | infortunio | Verletzung | blessure | blessure |
| bienestar | benessere | Wohlbefinden | bien-être | welzijn |

## Tono

- Igual de claro y profesional que `en.json`. Registro: dirígete al usuario de
  «tú/usted» según ya lo haga el idioma; en de usar «du» (deportivo, cercano);
  en fr «vous»; en nl «je»; en it «tu».
- **es-419**: español neutro latinoamericano. Usar «tú» (no «vos»), evitar
  regionalismos de España («ordenador»→«computadora», «móvil»→«celular»,
  «vídeo»→«video», «fútbol»→«fútbol», «entrenamiento» ok). Vocabulario y giros
  neutros comprensibles en toda Latinoamérica.

## Marca de revisión

Estas traducciones son de alta calidad generadas con IA y quedan **pendientes de
revisión por hablante nativo** antes de considerarse definitivas para producción
(copy sobre menores/familias y textos RGPD). No modificar cifras ni lógica.
