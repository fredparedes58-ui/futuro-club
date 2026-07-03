/**
 * VITAS · Telegram Webhook Setup & Diagnostics
 *
 * Usage:
 *   npx tsx scripts/telegram-setup-webhook.ts          # diagnose current state
 *   npx tsx scripts/telegram-setup-webhook.ts --set     # register webhook
 *   npx tsx scripts/telegram-setup-webhook.ts --delete   # remove webhook
 *
 * Requires: TELEGRAM_BOT_TOKEN env var (or .env file)
 * Optional: TELEGRAM_WEBHOOK_SECRET (must match the value set in Vercel env vars)
 */

import "dotenv/config";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const PROD_URL = "https://futuro-club.vercel.app";

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN no encontrado.");
  console.error("   Opciones:");
  console.error("   1. Crea un .env con TELEGRAM_BOT_TOKEN=tu_token");
  console.error("   2. TELEGRAM_BOT_TOKEN=tu_token npx tsx scripts/telegram-setup-webhook.ts");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const args = process.argv.slice(2);

async function getMe() {
  const res = await fetch(`${API}/getMe`);
  return res.json();
}

async function getWebhookInfo() {
  const res = await fetch(`${API}/getWebhookInfo`);
  return res.json();
}

async function setWebhook() {
  const webhookUrl = `${PROD_URL}/api/telegram/webhook`;
  console.log(`\n🔗 Registrando webhook: ${webhookUrl}`);
  if (WEBHOOK_SECRET) {
    console.log(`🔑 Con secret_token (TELEGRAM_WEBHOOK_SECRET configurado)`);
  }

  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  };
  if (WEBHOOK_SECRET) {
    body.secret_token = WEBHOOK_SECRET;
  }

  const res = await fetch(`${API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function deleteWebhook() {
  const res = await fetch(`${API}/deleteWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: true }),
  });
  return res.json();
}

async function main() {
  // 1. Verificar bot
  console.log("🤖 Verificando bot...");
  const me = await getMe();
  if (!me.ok) {
    console.error("❌ Token inválido:", me.description);
    process.exit(1);
  }
  console.log(`✅ Bot: @${me.result.username} (${me.result.first_name})`);

  // 2. Verificar webhook actual
  console.log("\n📡 Estado actual del webhook:");
  const info = await getWebhookInfo();
  if (!info.ok) {
    console.error("❌ Error:", info.description);
    process.exit(1);
  }

  const wh = info.result;
  if (wh.url) {
    console.log(`   URL: ${wh.url}`);
    console.log(`   Pending updates: ${wh.pending_update_count}`);
    console.log(`   Has custom certificate: ${wh.has_custom_certificate}`);
    console.log(`   Last error: ${wh.last_error_date ? new Date(wh.last_error_date * 1000).toISOString() : "ninguno"}`);
    if (wh.last_error_message) {
      console.log(`   ❌ Último error: ${wh.last_error_message}`);
    }
    console.log(`   Max connections: ${wh.max_connections}`);
    console.log(`   IP: ${wh.ip_address ?? "—"}`);
  } else {
    console.log("   ⚠️  NO hay webhook registrado. El bot no recibe mensajes.");
    console.log("   Ejecuta: npx tsx scripts/telegram-setup-webhook.ts --set");
  }

  // 3. Acciones
  if (args.includes("--set")) {
    const result = await setWebhook();
    if (result.ok) {
      console.log("\n✅ Webhook registrado correctamente.");
      console.log("   Ahora escribe al bot en Telegram — debería responder.");
    } else {
      console.error("\n❌ Error registrando webhook:", result.description);
    }
  } else if (args.includes("--delete")) {
    const result = await deleteWebhook();
    if (result.ok) {
      console.log("\n✅ Webhook eliminado.");
    } else {
      console.error("\n❌ Error:", result.description);
    }
  } else if (!wh.url) {
    console.log("\n💡 Para activar el bot, ejecuta:");
    console.log("   npx tsx scripts/telegram-setup-webhook.ts --set");
  } else {
    const expectedUrl = `${PROD_URL}/api/telegram/webhook`;
    if (wh.url !== expectedUrl) {
      console.log(`\n⚠️  La URL del webhook NO coincide con la esperada:`);
      console.log(`   Actual:   ${wh.url}`);
      console.log(`   Esperada: ${expectedUrl}`);
      console.log(`   Ejecuta --set para corregirlo.`);
    }
  }

  // 4. Test rápido del endpoint
  console.log("\n🧪 Probando endpoint...");
  try {
    const testRes = await fetch(`${PROD_URL}/api/telegram/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    console.log(`   Status: ${testRes.status}`);
    const testBody = await testRes.json().catch(() => null);
    if (testRes.status === 503) {
      console.log("   ❌ El endpoint devuelve 503 — TELEGRAM_BOT_TOKEN no está en las env vars de Vercel.");
    } else if (testRes.status === 401) {
      console.log("   ❌ El endpoint devuelve 401 — TELEGRAM_WEBHOOK_SECRET no coincide.");
    } else if (testRes.ok) {
      console.log("   ✅ Endpoint responde OK.");
    } else {
      console.log("   ⚠️  Respuesta:", JSON.stringify(testBody).slice(0, 200));
    }
  } catch (err) {
    console.log(`   ❌ Error conectando: ${err instanceof Error ? err.message : err}`);
  }
}

main().catch(console.error);
