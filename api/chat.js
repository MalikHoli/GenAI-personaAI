import { config } from "dotenv";
config({ path: ".env.local" });

import { getPersonaEntry } from "./personas/persona.registry.js";
import { PromptAssembler, getTurnNumber } from "./lib/prompt-assembler.js";
import { detectPromptInjection, detectOffDomain } from "./lib/moderation.js";
import {
  MAX_TURNS_PER_THREAD,
  MAX_MESSAGE_LENGTH,
} from "./lib/context-config.js";

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

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 300,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);

      if (
        response.status === 429 ||
        data?.error?.code === "insufficient_quota"
      ) {
        return res
          .status(200)
          .json({ reply: personaEntry.prompt.quotaExhaustedTemplate });
      }

      return res.status(502).json({
        error:
          "Sorry, I couldn't get a response right now. Please try again in a moment.",
      });
    }

    if (!data.choices?.[0]?.message?.content) {
      console.error("OpenAI API error:", data);
      return res.status(502).json({
        error:
          "Sorry, I couldn't get a response right now. Please try again in a moment.",
      });
    }

    res.status(200).json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error("Chat handler failed:", err);
    res.status(500).json({
      error: "Something went wrong reaching the AI. Please try again.",
    });
  }
}
