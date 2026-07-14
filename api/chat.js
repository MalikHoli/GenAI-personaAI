import { getPersonaEntry } from "./personas/persona.registry.js";
import { PromptAssembler, getTurnNumber } from "./lib/prompt-assembler.js";
import { detectPromptInjection, detectOffDomain } from "./lib/moderation.js";
import {
  MAX_TURNS_PER_THREAD,
  MAX_MESSAGE_LENGTH,
} from "./lib/context-config.js";
import {
  generateLatestResponse,
  selfConsitencyPromptAssembler,
} from "./lib/self-consistency-assembler.js";
import { parseSelectedResponse } from "./lib/response-schema.js";

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
const anthropicClient = new Anthropic();

// Lets Vercel flush res.write() chunks as they happen instead of buffering
// the whole response — required for the streamed status events below.
export const config = { supportsResponseStreaming: true };

export default async function handler(req, res) {
  const { personaId, history } = req.body;
  const personaEntry = getPersonaEntry(personaId);

  if (!personaEntry) {
    return res.status(400).json({ error: "Unknown persona." });
  }

  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: "Missing conversation history." });
  }

  const lastUserMessage = history[history.length - 1];

  if (lastUserMessage && lastUserMessage.text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Message exceeds ${MAX_MESSAGE_LENGTH} character limit.`,
    });
  }

  // Turn cap — long threads get a canned redirect instead of another model call.
  const turnNumber = getTurnNumber(history);
  if (turnNumber > MAX_TURNS_PER_THREAD) {
    return res
      .status(200)
      .json({ reply: personaEntry.prompt.capRefusalTemplate });
  }

  // Lightweight input moderation — block before ever calling the model.
  const lastUserText = lastUserMessage?.text ?? "";

  if (detectPromptInjection(lastUserText)) {
    return res
      .status(200)
      .json({ reply: personaEntry.prompt.promptInjectionTemplate });
  }
  if (detectOffDomain(lastUserText)) {
    return res
      .status(200)
      .json({ reply: personaEntry.prompt.offDomainTemplate });
  }

  // Everything past this point takes several seconds (3 model calls, then a
  // judge call), so the response streams newline-delimited JSON: one status
  // event per pipeline stage, then a final "done" event with the reply.
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
  });
  const sendEvent = (event) => res.write(JSON.stringify(event) + "\n");

  const { messages } = PromptAssembler.compose(personaEntry, history);

  sendEvent({ status: "generating" });
  const responsesToEvaluate = await generateLatestResponse.compose(messages);

  if (responsesToEvaluate.length === 0) {
    sendEvent({
      status: "done",
      reply:
        "Sorry, I couldn't get a response right now. Please try again in a moment.",
    });
    return res.end();
  }

  const selfConsistencyPrompt = selfConsitencyPromptAssembler.compose(
    personaEntry,
    responsesToEvaluate,
    history,
  );

  // Labels match the "Response A/B/C" labels used in the judge prompt, so the
  // frontend can show all candidates and highlight which one was selected.
  const candidates = responsesToEvaluate.map((r, i) => ({
    label: ["A", "B", "C"][i],
    model: r.model,
    text: r.text,
  }));

  sendEvent({ status: "evaluating" });

  try {
    const response = await anthropicClient.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: selfConsistencyPrompt,
      messages: [
        {
          role: "user",
          content:
            "Provide the best response as a single JSON object, exactly as instructed in the OUTPUT FORMAT section.",
        },
        // Prefilling the assistant turn with "{" forces the model to start
        // with JSON instead of prose like "Response B (with minor modification):".
        { role: "assistant", content: "{" },
      ],
    });

    const outputText = "{" + (response.content[0]?.text ?? "");

    const selected = parseSelectedResponse(outputText);

    if (selected) {
      sendEvent({
        status: "done",
        reply: selected.responseContent,
        candidates,
        selectedLabel: selected.response,
      });
      return res.end();
    }

    // Selector output didn't match the schema — fall back to the first raw
    // candidate so the user never sees evaluation commentary.
    console.error(
      "Selector output was not valid JSON, falling back:",
      outputText,
    );
    sendEvent({
      status: "done",
      reply: responsesToEvaluate[0].text,
      candidates,
      selectedLabel: "A",
    });

    return res.end();
  } catch (error) {
    console.error("AI API error:", error);

    // Headers are already sent (streaming), so errors also go out as a
    // final "done" event instead of an HTTP error status.
    sendEvent({
      status: "done",
      reply: personaEntry.prompt.quotaExhaustedTemplate,
    });
    return res.end();
  }
}
