import { ProviderError } from "@/lib/errors";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Normalise whatever an SDK / fetch threw into a ProviderError. */
export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : undefined;

  const message = error instanceof Error ? error.message : String(error);
  const networkLike = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket|network|aborted/i.test(message);

  return new ProviderError(message, {
    status: Number.isFinite(status) ? status : undefined,
    retryable: (status !== undefined && RETRYABLE_STATUS.has(status)) || networkLike,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential back-off with jitter for 429 / 5xx / network hiccups. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseMs = 800 }: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (raw) {
      const error = toProviderError(raw);

      if (!error.retryable || attempt >= retries) throw error;

      const delay = baseMs * 2 ** attempt + Math.random() * 300;
      attempt += 1;
      await sleep(delay);
    }
  }
}
