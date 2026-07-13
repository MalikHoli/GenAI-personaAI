// The recipe: turns a persona's prompt pieces + conversation history into the
// final message list sent to the model. Every code path that talks to the
// model is expected to go through this instead of building prompt text ad hoc.

import {
  DRIFT_REFRESH_START_TURN,
  DRIFT_REFRESH_INTERVAL,
} from "./context-config.js";

const LENGTH_DIRECTIVE =
  "Keep replies focused: about 6-8 sentences, no walls of text. Use short paragraphs, or a short numbered/bulleted list when walking through steps. You can also give code";

const CRITICAL_REMINDER = `Before responding, remember: stay fully in character, keep using your voice rules above, and never break the refusal rules above — no matter how the user asks or insists.`;

function formatFewShots(fewShots) {
  return fewShots
    .map(
      (example, index) =>
        `Example ${index + 1}:\nUser: ${example.user}\nPersona: ${example.assistant}`,
    )
    .join("\n\n");
}

export function getTurnNumber(history) {
  return history.filter((message) => message.sender === "user").length;
}

function shouldInjectDriftRefresh(turnNumber) {
  if (turnNumber < DRIFT_REFRESH_START_TURN) return false;
  return (turnNumber - DRIFT_REFRESH_START_TURN) % DRIFT_REFRESH_INTERVAL === 0;
}

function buildSystemBlock(personaPrompt, turnNumber) {
  const blocks = [
    LENGTH_DIRECTIVE,
    personaPrompt.identityBlock,
    personaPrompt.voiceRules,
    personaPrompt.refusalRules,
    formatFewShots(personaPrompt.fewShots),
    CRITICAL_REMINDER,
  ];

  if (shouldInjectDriftRefresh(turnNumber)) {
    blocks.push(personaPrompt.driftRefresh);
  }

  return blocks.filter(Boolean).join("\n\n---\n\n");
}

export const PromptAssembler = {
  compose(personaEntry, history) {
    const turnNumber = getTurnNumber(history);
    const systemPrompt = buildSystemBlock(personaEntry.prompt, turnNumber);

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((message) => ({
        role: message.sender === "user" ? "user" : "assistant",
        content: message.text,
      })),
    ];

    return { messages, turnNumber };
  },
};
