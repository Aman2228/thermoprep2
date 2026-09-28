import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getEnvInt } from "@/lib/env";
import { ApiError, JsonParseError, ProviderError } from "@/lib/errors";
import { db } from "@/lib/supabase";

export interface AuthedUser {
  email: string;
}

/** Reads the encrypted session cookie. */
export async function requireUser(req: NextRequest): Promise<AuthedUser> {
  const token = await getToken({ req });

  if (!token?.email) {
    throw new ApiError(401, "Please sign in to continue.");
  }

  return { email: token.email };
}

function describeError(error: unknown): { status: number; message: string } {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message };
  }

  if (error instanceof JsonParseError) {
    return {
      status: 502,
      message: "The AI's answer was malformed or cut off. Try again, or ask for fewer questions.",
    };
  }

  if (error instanceof ProviderError) {
    if (error.status === 429) {
      return {
        status: 429,
        message: "The AI provider is rate-limiting requests. Wait a minute and try again.",
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        status: 502,
        message: "The AI provider rejected the API key. Check the server's environment variables.",
      };
    }

    return { status: 502, message: "The AI provider is unavailable right now. Try again shortly." };
  }

  return { status: 500, message: "Something went wrong on the server." };
}

/** Wrap a route body: JSON in, JSON out, and errors mapped to safe messages. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return result instanceof Response ? result : NextResponse.json(result);
  } catch (error) {
    const { status, message } = describeError(error);

    if (status >= 500) console.error("API_ERROR:", error);

    return NextResponse.json({ error: message }, { status });
  }
}

/** Parse a JSON body without throwing a 500 for malformed input. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();

    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // fall through
  }

  throw new ApiError(400, "Request body must be a JSON object.");
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function cleanText(value: unknown, maxLength: number, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

/** Protects the API bill: N AI generations per user per hour (counted from saved rows). */
export async function enforceGenerationQuota(email: string): Promise<void> {
  const limit = getEnvInt("GENERATIONS_PER_HOUR", 40);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await db()
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .gte("created_at", since);

  if (error) throw error;

  if ((count ?? 0) >= limit) {
    throw new ApiError(
      429,
      `Hourly limit reached (${limit} generations). Try again later, or raise GENERATIONS_PER_HOUR.`,
    );
  }
}

export async function logGeneration(email: string, kind: string): Promise<void> {
  const { error } = await db().from("ai_generations").insert({ user_email: email, kind });
  if (error) console.error("LOG_GENERATION_FAILED:", error.message);
}
