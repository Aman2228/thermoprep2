/** An error whose message is safe to show to the end user. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Failure talking to an AI provider (Gemini / OpenAI-compatible). */
export class ProviderError extends Error {
  status?: number;
  retryable: boolean;

  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

/** The model answered, but not with usable JSON (often: output was cut off). */
export class JsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonParseError";
  }
}
