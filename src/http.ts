/** fetch with a timeout; transport failures become "Network error: ..." errors. */
export async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new NetworkError(describeFetchFailure(err));
  }
}

export class NetworkError extends Error {
  constructor(reason: string) {
    super(`Network error: ${reason}`);
    this.name = "NetworkError";
  }
}

function describeFetchFailure(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    // Aggregate errors (e.g. IPv4 + IPv6 refused) carry no top-level message.
    return cause.message || (typeof code === "string" ? code : err.message);
  }
  return err.message;
}

/** The API's error text: FastAPI's `detail` when present, else the raw body. */
export async function errorDetail(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body) && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      return typeof detail === "string" ? detail : JSON.stringify(detail);
    }
  } catch {
    // not JSON — fall through to the raw text
  }
  return text || "Unknown error";
}
