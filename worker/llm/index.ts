import { gemini } from "./gemini";

export { RateLimitError } from "./errors";

/** The only way the app talks to an AI model. Swap providers with the LLM_PROVIDER env var. */
export interface Llm {
  /** e.g. "gemini:gemini-flash-latest" — stored next to every score. */
  name: string;
  /** Milliseconds to wait between calls so free tiers don't rate-limit us. */
  delayMs: number;
  /** Ask for a JSON answer matching `schema` (a JSON Schema object). */
  json<T>(prompt: string, schema: Record<string, unknown>): Promise<T>;
}

/**
 * Picks the AI provider from env:
 * - LLM_PROVIDER=gemini (default when GEMINI_API_KEY is set)
 * - LLM_PROVIDER=none, or no key → null (callers fall back to keyword scoring)
 */
export function getLlm(env = process.env): Llm | null {
  const provider = env.LLM_PROVIDER ?? (env.GEMINI_API_KEY ? "gemini" : "none");
  switch (provider) {
    case "gemini":
      if (!env.GEMINI_API_KEY) throw new Error("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set");
      return gemini({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL || "gemini-flash-latest",
        delayMs: Number(env.LLM_DELAY_MS ?? 6500),
      });
    case "none":
      return null;
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (supported: gemini, none)`);
  }
}
