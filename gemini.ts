import { GoogleGenAI } from "@google/genai";
import { EMBED_DIMENSIONS, PIPELINE_VERSION } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { JsonParseError, ProviderError } from "@/lib/errors";
import { toProviderError } from "./retry";
import type { AiProvider } from "./types";


let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });
  return client;
}

const generationModel = () => getEnv("GEMINI_GENERATION_MODEL", "gemini-2.5-flash");
const embeddingModel = () => getEnv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001");

export const geminiProvider: AiProvider = {
  name: "gemini",

  embeddingTag() {
    return `gemini:${embeddingModel()}:${EMBED_DIMENSIONS}:${PIPELINE_VERSION}`;
  },

  async generateJson({ system, prompt, maxOutputTokens, temperature }) {
    try {
      const response = await ai().models.generateContent({
        model: generationModel(),
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          maxOutputTokens,
          temperature: temperature ?? 0.4,
        },
      });

      const usage = response.usageMetadata;
      console.info("AI_USAGE", {
        provider: "gemini",
        model: generationModel(),
        promptTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
        thinkingTokens: usage?.thoughtsTokenCount,
      });

      if (String(response.candidates?.[0]?.finishReason) === "MAX_TOKENS") {
        throw new JsonParseError("The AI answer was cut off (output limit reached).");
      }

      return response.text ?? "";
    } catch (error) {
      if (error instanceof JsonParseError) throw error;
      throw toProviderError(error);
    }
  },

  async embed(texts, purpose) {
    try {
      const result = await ai().models.embedContent({
        model: embeddingModel(),
        contents: texts,
        config: {
          outputDimensionality: EMBED_DIMENSIONS,
          taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
        },
      });

      const vectors = (result.embeddings ?? []).map((e) => e.values ?? []);

      if (vectors.length !== texts.length) {
        throw new ProviderError(
          `Gemini returned ${vectors.length} embeddings for ${texts.length} inputs.`,
        );
      }

      for (const v of vectors) {
        if (v.length !== EMBED_DIMENSIONS) {
          throw new ProviderError(`Expected ${EMBED_DIMENSIONS} dimensions, got ${v.length}.`);
        }
      }

      return vectors;
    } catch (error) {
      throw toProviderError(error);
    }
  },
};
