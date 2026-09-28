"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Tiny fetch wrapper used by every page: tracks loading/error state and ignores
 * responses from a stale request if the user re-triggers the action quickly.
 */
export function useApi<T = unknown>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const call = useCallback(
    async (input: RequestInfo, init?: RequestInit): Promise<T | null> => {
      const id = ++requestId.current;
      setLoading(true);
      setError("");

      try {
        const res = await fetch(input, init);
        const data = await res.json().catch(() => ({}));

        if (id !== requestId.current) return null; // superseded by a newer call

        if (!res.ok) {
          setError(data.error || `Request failed (${res.status})`);
          return null;
        }

        return data as T;
      } catch {
        if (id === requestId.current) setError("Network error. Check your connection and try again.");
        return null;
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  const postJson = useCallback(
    (url: string, body: unknown) =>
      call(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    [call],
  );

  return { call, postJson, loading, error, setError };
}
