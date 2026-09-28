"use client";

import { useCallback, useState } from "react";

/** Shared busy/error handling so every page doesn't repeat try/catch/finally. */
export function useTask() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = useCallback(async <T,>(label: string, task: () => Promise<T>): Promise<T | undefined> => {
    setError("");
    setBusy(label);

    try {
      return await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy("");
    }
  }, []);

  return { busy, setBusy, error, setError, run };
}
