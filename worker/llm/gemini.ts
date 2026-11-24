import { GoogleGenAI } from "@google/genai";
import { RateLimitError } from "./errors";
import type { Llm } from "./index";

export function gemini(opts: { apiKey: string; model: string; delayMs: number }): Llm {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  return {
    name: `gemini:${opts.model}`,
    delayMs: opts.delayMs,
    async json<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
      try {
        const res = await ai.models.generateContent({
          model: opts.model,
          contents: prompt,
          config: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.2 },
        });
        return JSON.parse(res.text ?? "") as T;
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw new RateLimitError(msg);
        throw err;
      }
    },
  };
}
