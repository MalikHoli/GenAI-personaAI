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

import { config } from "dotenv";
config({ path: ".env.local" });

import OpenAI from "openai";
const openaiClient = new OpenAI();

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

  try {
    const response = await openaiClient.responses.create({
      model: "gpt-4o-mini",
      input: selfConsistencyPrompt,
      max_output_tokens: 300,
    });

    if (!response.output_text || response.output_text.trim() === "") {
      return res.status(502).json({
        error:
          "Sorry, I couldn't get a response right now. Please try again in a moment.",
      });
    }

    return res.status(200).json({ reply: response.output_text });
  } catch (error) {
    console.error("OpenAI API error:", error);

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
