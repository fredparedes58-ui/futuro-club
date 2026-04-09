/**
 * VITAS · Distributed Rate Limiter
 *
 * Usa Upstash Redis (sliding window) cuando UPSTASH_REDIS_REST_URL esta configurado.
 * Fallback a in-memory Map para desarrollo local.
 *
 * La interfaz publica es la misma: checkRateLimit() retorna { allowed, remaining, limit, resetAt }
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface RateLimitConfig {
  windowMs?: number;
  max?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

// ─────────────────────────────────────────
// Upstash Redis client (singleton, lazy init)
// ─────────────────────────────────────────

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

// Cache de Ratelimit instances por config key (evita recrear en cada request)
const rlCache = new Map<string, Ratelimit>();

function getUpstashLimiter(max: number, windowMs: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const key = `${max}:${windowMs}`;
  let limiter = rlCache.get(key);
  if (!limiter) {
    // Upstash sliding window usa segundos
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: "vitas_rl",
      analytics: false,
    });
    rlCache.set(key, limiter);
  }
  return limiter;
}

// ─────────────────────────────────────────
// In-memory fallback (dev local)
// ─────────────────────────────────────────

interface MemoryEntry {
  count: number;
  windowStart: number;
}

const memStore = new Map<string, MemoryEntry>();

function checkMemory(ip: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let entry = memStore.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 0, windowStart: now };
    memStore.set(ip, entry);
  }

  entry.count++;

  const resetAt = entry.windowStart + windowMs;
  const remaining = Math.max(0, max - entry.count);

  // Limpieza periodica
  if (memStore.size > 1000) {
    for (const [key, val] of memStore) {
      if (now - val.windowStart >= windowMs * 2) {
        memStore.delete(key);
      }
    }
  }

  return { allowed: entry.count <= max, remaining, limit: max, resetAt };
}

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

/**
 * Verifica si una IP puede hacer la request.
 * Usa Upstash Redis si esta configurado, sino in-memory.
 */
export async function checkRateLimit(
  ip: string,
  config: RateLimitConfig = {},
): Promise<RateLimitResult> {
  const windowMs = config.windowMs ?? 60_000;
  const max = config.max ?? 30;

  // Intentar Upstash primero
  const limiter = getUpstashLimiter(max, windowMs);
  if (limiter) {
    try {
      const result = await limiter.limit(ip);
      return {
        allowed: result.success,
        remaining: result.remaining,
        limit: result.limit,
        resetAt: result.reset,
      };
    } catch (err) {
      // Si Upstash falla, fallback a in-memory (no bloquear requests)
      console.warn("[RateLimit] Upstash error, falling back to in-memory:", err);
    }
  }

  // Fallback in-memory
  return checkMemory(ip, max, windowMs);
}

/**
 * Extrae la IP del request (Vercel Edge pone x-forwarded-for).
 */
export function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Headers estandar de rate limiting para incluir en Response.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
