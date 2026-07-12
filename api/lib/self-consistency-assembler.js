import { config } from "dotenv";
config({ path: ".env.local" });

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { selfConsistencyPrompt } from "../personas/self-consistency.prompt.js";

const openaiClient = new OpenAI();
const anthropicClient = new Anthropic();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function callGptModel(messages, model) {
  return await openaiClient.responses.create({
    model: model,
    input: messages,
    max_output_tokens: 300,
  });
}

async function callClaudeModel(systemPrompt, messages, model) {
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  return await anthropicClient.messages.create({
    model,
    max_tokens: 300,
    system: systemPrompt,
    messages: nonSystemMessages,
  });
}

async function callGeminiModel(systemPrompt, messages, model) {
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });

  const contents = nonSystemMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const result = await geminiModel.generateContent({ contents });
  return result.response;
}

export const generateLatestResponse = {
  async compose(messages) {
    const modelConfigs = [
      { model: "gpt-4o-mini", provider: "openai" },
      { model: "claude-haiku-4-5", provider: "anthropic" },
      { model: "gemini-2.5-flash", provider: "google" },
    ];

    const systemPrompt =
      messages.find((m) => m.role === "system")?.content ?? "";

    const results = await Promise.allSettled([
      callGptModel(messages, modelConfigs[0].model),
      callClaudeModel(systemPrompt, messages, modelConfigs[1].model),
      callGeminiModel(systemPrompt, messages, modelConfigs[2].model),
    ]);

    const responses = results
      .map((result, i) => {
        const { model, provider } = modelConfigs[i];

        if (result.status !== "fulfilled") {
          console.error(`${model} failed:`, result.reason);
          return null;
        }

        const value = result.value;
        let text;

        switch (provider) {
          case "openai":
            text = value.output_text;
            break;
          case "anthropic":
            text = value.content[0]?.text;
            break;
          case "google":
            text = value.text();
            break;
        }

        if (!text) {
          console.error(`${model} returned empty text.`);
          return null;
        }

        return { model, text };
      })
      .filter(Boolean);

    return responses;
  },
};

export const selfConsitencyPromptAssembler = {
  compose(personaEntry, responsesToEvaluate, history) {
    const { identityBlock, evaluationCriteria } = selfConsistencyPrompt(
      personaEntry.name,
    );

    const blocks = [identityBlock, evaluationCriteria];

    blocks.push("Below is the conversation history:");

    const historyText = history
      .map((turn) => `${turn.sender}: ${turn.text}`)
      .join("\n");
    blocks.push(historyText);

    blocks.push(
      "Below are the responses from various models. Evaluate each one based on the evaluation criteria above, and select/modify the best one. During modification again evaluation criteria must be fullfilled",
    );

    const labels = ["Response A", "Response B", "Response C"];
    const responsesText = responsesToEvaluate
      .map((r, i) => `${labels[i]}:\n${r.text}`)
      .join("\n\n");
    blocks.push(responsesText);

    return blocks.filter(Boolean).join("\n\n---\n\n");
  },
};
