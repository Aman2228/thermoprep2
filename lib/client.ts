/** fetch wrapper for the browser: JSON in/out, readable errors, no unhandled rejections. */
export async function apiJson<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }

  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (e.g. a platform error page such as 413 or a gateway timeout).
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : response.status === 413
          ? "The file is too large for this server."
          : response.status === 504
            ? "The server took too long to respond. Try again."
            : `Request failed (HTTP ${response.status}).`;

    throw new Error(message);
  }

  return data as T;
}
