import {
  MODEL,
  diagnosisSystemPrompt,
  diagnosisUserPrompt,
  parseDiagnosisJson,
  buildFallbackDiagnosis,
} from "./prompts";
import type { AnalysisMetrics, Diagnosis, PatternResult } from "../types";

type AiBinding = {
  run: (
    model: string,
    inputs: Record<string, unknown>,
  ) => Promise<unknown>;
};

function extractText(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
    if (typeof r.text === "string") return r.text;
    if (Array.isArray(r.result)) {
      return r.result
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "response" in part) {
            return String((part as { response: unknown }).response);
          }
          return "";
        })
        .join("");
    }
  }
  return JSON.stringify(result);
}

export async function runDiagnosis(
  ai: AiBinding,
  input: {
    service: string;
    alertText: string;
    logs: string;
    metrics: AnalysisMetrics;
    patterns: PatternResult;
  },
): Promise<Diagnosis> {
  const fallback = buildFallbackDiagnosis(input.patterns, input.metrics);
  try {
    const result = await ai.run(MODEL, {
      messages: [
        { role: "system", content: diagnosisSystemPrompt() },
        { role: "user", content: diagnosisUserPrompt(input) },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });
    return parseDiagnosisJson(extractText(result), fallback);
  } catch {
    return fallback;
  }
}

export async function streamChat(
  ai: AiBinding,
  messages: Array<{ role: string; content: string }>,
  fallbackText?: string,
): Promise<ReadableStream> {
  try {
    const result = await ai.run(MODEL, {
      messages,
      stream: true,
      max_tokens: 900,
      temperature: 0.4,
    });

    if (result instanceof ReadableStream) {
      return result;
    }

    const text = extractText(result);
    return textToAiSse(text || fallbackText || "I could not generate a response.");
  } catch {
    return textToAiSse(
      fallbackText ||
        "Workers AI is unavailable in this environment. Using incident memory instead:\n\n" +
          "(No fallback content provided)",
    );
  }
}

function textToAiSse(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      // Emit in small chunks so the UI streaming path still works
      const chunkSize = 48;
      for (let i = 0; i < text.length; i += chunkSize) {
        const piece = text.slice(i, i + chunkSize);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ response: piece })}\n\n`),
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

/** Convert Workers AI SSE to plain text SSE for the browser. */
export function toPlainTextSse(aiStream: ReadableStream): ReadableStream {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = aiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as {
                response?: string;
                text?: string;
              };
              const chunk = json.response ?? json.text ?? "";
              if (chunk) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`),
                );
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
