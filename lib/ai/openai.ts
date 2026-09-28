import { EMBED_DIMENSIONS, PIPELINE_VERSION } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { JsonParseError, ProviderError } from "@/lib/errors";
import { toProviderError } from "./retry";
import type { AiProvider } from "./types";

/**
 * OpenAI (or any OpenAI-compatible endpoint: Groq, DeepSeek, OpenRouter, a local
 * server…). Plain fetch on purpose — no SDK needed for two endpoints.
 */

const baseUrl = () => getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/+$/, "");
const chatModel = () => getEnv("OPENAI_MODEL"); // deliberately no default: model names change often
const embeddingModel = () => getEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small");

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

interface EmbeddingResponse {
  data?: { embedding: number[]; index: number }[];
  error?: { message?: string };
}

async function post<T extends { error?: { message?: string } }>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getEnv("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let json: T;

    try {
      json = JSON.parse(text) as T;
    } catch {
      throw new ProviderError(`Provider returned non-JSON (HTTP ${response.status}).`, {
        status: response.status,
        retryable: response.status >= 500,
      });
    }

    if (!response.ok) {
      throw toProviderError(
        Object.assign(new Error(json.error?.message ?? `HTTP ${response.status}`), {
          status: response.status,
        }),
      );
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

export const openaiProvider: AiProvider = {
  name: "openai",

  embeddingTag() {
    return `openai:${embeddingModel()}:${EMBED_DIMENSIONS}:${PIPELINE_VERSION}`;
  },

  async generateJson({ system, prompt, maxOutputTokens, temperature }) {
    const isOpenAi = baseUrl().includes("api.openai.com");
    const configuredTemperature = process.env.OPENAI_TEMPERATURE
      ? Number(process.env.OPENAI_TEMPERATURE)
      : temperature;

    try {
      const json = await post<ChatResponse>(
        "/chat/completions",
        {
          model: chatModel(),
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          // OpenAI's newer models want max_completion_tokens; most compatible servers still use max_tokens.
          ...(isOpenAi
            ? { max_completion_tokens: maxOutputTokens }
            : { max_tokens: maxOutputTokens }),
          // Some reasoning models only accept the default temperature, so it's opt-in.
          ...(process.env.OPENAI_TEMPERATURE && configuredTemperature !== undefined
            ? { temperature: configuredTemperature }
            : {}),
        },
        90_000,
      );

      console.info("AI_USAGE", {
        provider: "openai",
        model: chatModel(),
        promptTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      });

      const choice = json.choices?.[0];

      if (choice?.finish_reason === "length") {
        throw new JsonParseError("The AI answer was cut off (output limit reached).");
      }

      return choice?.message?.content ?? "";
    } catch (error) {
      if (error instanceof JsonParseError) throw error;
      throw toProviderError(error);
    }
  },

  async embed(texts) {
    try {
      const model = embeddingModel();

      const json = await post<EmbeddingResponse>(
        "/embeddings",
        {
          model,
          input: texts,
          // Only the text-embedding-3 family can shorten vectors to fit the DB column.
          ...(model.startsWith("text-embedding-3") ? { dimensions: EMBED_DIMENSIONS } : {}),
        },
        60_000,
      );

      const vectors = [...(json.data ?? [])]
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      if (vectors.length !== texts.length) {
        throw new ProviderError(
          `Provider returned ${vectors.length} embeddings for ${texts.length} inputs.`,
        );
      }

      for (const v of vectors) {
        if (v.length !== EMBED_DIMENSIONS) {
          throw new ProviderError(
            `Expected ${EMBED_DIMENSIONS} dimensions, got ${v.length}. The DB column is vector(${EMBED_DIMENSIONS}).`,
          );
        }
      }

      return vectors;
    } catch (error) {
      throw toProviderError(error);
    }
  },
};
