#!/usr/bin/env node
/**
 * VITAS · Arnés de validación del motor de observación de partido completo (OPERADOR)
 *
 * El análisis de partido completo por vídeo está APAGADO (MATCH_VIDEO_ENABLED) hasta que
 * el motor supere esta validación con partidos anotados A MANO. Ejecuta EXACTAMENTE la
 * petición del job (prompt segment.v1 + responseSchema + videoMetadata.fps +
 * mediaResolution de config/matchVideo.json) sobre un clip local, normaliza igual que
 * producción (guarda de identidad incluida) y puntúa las evidencias contra
 * fixtures/partido/<clip_id>/eventos.json. Sale 1 si no alcanza los umbrales de config.
 *
 * Uso (la key se lee del entorno y NUNCA se imprime; no la pegues en la línea de comandos):
 *   node --env-file=.env.local scripts/validate-match-observation.mjs \
 *        --fixture fixtures/partido/<clip_id> [--clip ruta/al/proxy.mp4] \
 *        [--start 0 --end 900] [--save-response out.json] [--keep-file] [--json]
 *   node scripts/validate-match-observation.mjs --fixture fixtures/partido/<clip_id> \
 *        --response out.json          # re-puntúa una respuesta guardada, sin Gemini
 *
 * Salida: 0 = aprobado · 1 = no aprobado (umbrales) · 2 = error de uso/fixture/red.
 * Lo que se sube a Gemini debería ser el MISMO proxy que genera el worker (sin audio,
 * proxyFps / proxyHeight de config); --print-ffmpeg muestra el comando.
 * Las anotaciones humanas son evaluación, nunca entrenamiento (fixtures/README.md).
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { json: false, keepFile: false, printFfmpeg: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`falta el valor de ${a}`);
      return v;
    };
    switch (a) {
      case "--fixture": out.fixture = next(); break;
      case "--clip": out.clip = next(); break;
      case "--response": out.response = next(); break;
      case "--save-response": out.saveResponse = next(); break;
      case "--start": out.start = Number(next()); break;
      case "--end": out.end = Number(next()); break;
      case "--keep-file": out.keepFile = true; break;
      case "--json": out.json = true; break;
      case "--print-ffmpeg": out.printFfmpeg = true; break;
      case "-h":
      case "--help": out.help = true; break;
      default: throw new Error(`argumento desconocido: ${a}`);
    }
  }
  return out;
}

async function load(rel) {
  const { module } = await runnerImport(resolve(ROOT, rel), { configFile: false, logLevel: "error", root: ROOT });
  return module;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message ?? e));
    return 2;
  }
  if (args.help) {
    console.log("Uso: node --env-file=.env.local scripts/validate-match-observation.mjs --fixture fixtures/partido/<clip_id> [--clip proxy.mp4] [--start s --end s] [--response raw.json] [--save-response raw.json] [--keep-file] [--json] [--print-ffmpeg]");
    return 0;
  }
  const harness = await load("api/_lib/matchJob/validationHarness.ts");
  if (args.printFfmpeg) {
    const { MATCH_VIDEO_CONFIG: c } = await load("api/_lib/matchJob/config.ts");
    console.log(`ffmpeg -i ORIGINAL.mp4 -an -vf "fps=${c.proxyFps},scale=-2:${c.proxyHeight}" -c:v libx264 -crf ${c.proxyCrf} -movflags +faststart proxy.mp4`);
    return 0;
  }
  if (!args.fixture) {
    console.error("falta --fixture fixtures/partido/<clip_id>");
    return 2;
  }
  const hasWindow = Number.isFinite(args.start) || Number.isFinite(args.end);
  if (hasWindow && !(Number.isFinite(args.start) && Number.isFinite(args.end) && args.end > args.start && args.start >= 0)) {
    console.error("--start y --end deben ir juntos, en segundos, con end > start ≥ 0");
    return 2;
  }
  try {
    const report = await harness.runValidationHarness({
      fixtureDir: args.fixture,
      clipPath: args.clip,
      responsePath: args.response,
      saveResponsePath: args.saveResponse,
      window: hasWindow ? { start_sec: args.start, end_sec: args.end } : null,
      keepFile: args.keepFile,
      log: args.json ? () => undefined : (line) => console.error(line),
    });
    console.log(args.json ? JSON.stringify(report, null, 2) : harness.formatHarnessReport(report));
    return report.verdict.pass ? 0 : 1;
  } catch (e) {
    // Nunca se imprime la key: los errores de la librería Gemini no la contienen (va en cabecera).
    console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

process.exitCode = await main();
