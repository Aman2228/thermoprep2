import { ApiError } from "@/lib/errors";

/**
 * Read an environment variable at call time (never at import time), so that
 * `next build` and unrelated routes don't crash when a key is not configured.
 */
export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();

  if (value) return value;
  if (fallback !== undefined) return fallback;

  throw new ApiError(500, `Server is missing the ${name} environment variable.`);
}

export function getEnvInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}
