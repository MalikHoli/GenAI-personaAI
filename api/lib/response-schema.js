import { z } from "zod";

// Contract for the self-consistency selector's output.
// "A" | "B" | "C" — one of the candidate responses picked as-is.
// "D" — the selector modified a candidate to satisfy the evaluation criteria.
export const selectedResponseSchema = z.object({
  response: z.enum(["A", "B", "C", "D"]),
  responseContent: z.string().min(1),
});

// The model may wrap JSON in markdown fences or add stray prose around it.
// Pull out the outermost {...} block before parsing.
function extractJsonBlock(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function parseSelectedResponse(outputText) {
  if (!outputText) return null;

  const jsonBlock = extractJsonBlock(outputText);
  if (!jsonBlock) return null;

  let parsed;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return null;
  }

  const result = selectedResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.error(
      "Selector output failed schema validation:",
      result.error.issues,
    );
    return null;
  }

  return result.data;
}
