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

import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
const anthropicClient = new Anthropic();

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

  const { messages } = PromptAssembler.compose(personaEntry, history);

  const responsesToEvaluate = await generateLatestResponse.compose(messages);

  const selfConsistencyPrompt = selfConsitencyPromptAssembler.compose(
    personaEntry,
    responsesToEvaluate,
    history,
  );

  if (responsesToEvaluate.length === 0) {
    return res.status(200).json({
      reply:
        "Sorry, I couldn't get a response right now. Please try again in a moment.",
    });
  }

  // Labels match the "Response A/B/C" labels used in the judge prompt, so the
  // frontend can show all candidates and highlight which one was selected.
  const candidates = responsesToEvaluate.map((r, i) => ({
    label: ["A", "B", "C"][i],
    model: r.model,
    text: r.text,
  }));

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
      return res.status(200).json({
        reply: selected.responseContent,
        candidates,
        selectedLabel: selected.response,
      });
    }

    // Selector output didn't match the schema — fall back to the first raw
    // candidate so the user never sees evaluation commentary.
    console.error(
      "Selector output was not valid JSON, falling back:",
      outputText,
    );
    return res.status(200).json({
      reply: responsesToEvaluate[0].text,
      candidates,
      selectedLabel: "A",
    });
  } catch (error) {
    console.error("AI API error:", error);

    if (error.status === 429 || error?.error?.code === "insufficient_quota") {
      return res
        .status(200)
        .json({ reply: personaEntry.prompt.quotaExhaustedTemplate });
    }

    return res
      .status(502)
      .json({ reply: personaEntry.prompt.quotaExhaustedTemplate });
  }
}
