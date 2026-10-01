import { getEnv } from "@/lib/env";
import { JsonParseError, ProviderError } from "@/lib/errors";
import { parseJsonLoose } from "@/lib/json";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { withRetry } from "./retry";
import type { AiProvider, EmbedPurpose, GenerateOptions } from "./types";

/**
 * One place that knows which AI vendor is in use.
 *
 *   AI_PROVIDER=gemini|openai           text generation (default: gemini)
 *   AI_FALLBACK_PROVIDER=gemini|openai  optional; used if the primary keeps failing
 *   EMBEDDING_PROVIDER=gemini|openai    embeddings (default: same as AI_PROVIDER)
 *
 * Generation and embeddings are separate on purpose: you can move text generation to
 * another vendor without touching the vectors already stored in the database.
 */

function byName(name: string): AiProvider {
  const normalized = name.toLowerCase().trim();

  if (normalized === "gemini") return geminiProvider;
  if (normalized === "openai" || normalized === "gpt") return openaiProvider;

  throw new ProviderError(`Unknown AI provider "${name}". Use "gemini" or "openai".`);
}

export function generationProvider(): AiProvider {
  return byName(getEnv("AI_PROVIDER", "gemini"));
}

export function embeddingProvider(): AiProvider {
  return byName(getEnv("EMBEDDING_PROVIDER", getEnv("AI_PROVIDER", "gemini")));
}

export const currentEmbeddingTag = () => embeddingProvider().embeddingTag();

/** Generate a JSON answer. Retries transient errors, then falls back if configured. */
export async function generateJson(options: GenerateOptions): Promise<unknown> {
  const providers = [generationProvider()];
  const fallbackName = process.env.AI_FALLBACK_PROVIDER?.trim();

  if (fallbackName && fallbackName.toLowerCase() !== providers[0].name) {
    providers.push(byName(fallbackName));
  }

  let lastError: unknown;

  for (const provider of providers) {
    try {
      console.error("AI_START:", provider.name, new Date().toISOString());
      
      const start = Date.now();
      
      const text = await withRetry(
        () => provider.generateJson(options),
        // Fail over quickly when a fallback exists; otherwise keep the default retries.
        provider.name === "openai"
          ? { retries: 0 }
          : providers.length > 1
            ? { retries: 1 }
            : undefined,
      );
      
      console.error(
        "AI_FINISHED:",
        provider.name,
        `${Date.now() - start}ms`,
      );
      return parseJsonLoose(text);
    } catch (error) {
      lastError = error;
      console.error(
        `AI_GENERATION_FAILED (${provider.name}):`,
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              status: "status" in error ? error.status : undefined,
            }
          : error,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new JsonParseError("AI generation failed.");
}

const EMBED_BATCH = 64;

/** Embed many texts, batched and retried. Vectors come back in input order. */
export async function embedTexts(texts: string[], purpose: EmbedPurpose): Promise<number[][]> {
  const provider = embeddingProvider();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    out.push(...(await withRetry(() => provider.embed(batch, purpose))));
  }

  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text], "query");
  return vector;
}
