export type EmbedPurpose = "document" | "query";

export interface GenerateOptions {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface AiProvider {
  name: "gemini" | "openai";
  /** Returns the raw text of a JSON-mode answer. Throws ProviderError. */
  generateJson(options: GenerateOptions): Promise<string>;
  embed(texts: string[], purpose: EmbedPurpose): Promise<number[][]>;
  /** Identifies the embedding space, e.g. "gemini:gemini-embedding-001:768:v2". */
  embeddingTag(): string;
}
