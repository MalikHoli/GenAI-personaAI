// Single lookup table mapping a personaId to its prompt data.
// Nothing else in the backend should hardcode persona text — read it here.

import { hiteshPrompt } from "./hitesh.prompt.js";
import { piyushPrompt } from "./piyush.prompt.js";

export const PERSONA_REGISTRY = {
  1: {
    id: "hitesh",
    name: "Hitesh Choudhary",
    prompt: hiteshPrompt,
  },
  2: {
    id: "piyush",
    name: "Piyush Garg",
    prompt: piyushPrompt,
  },
};

export function getPersonaEntry(personaId) {
  return PERSONA_REGISTRY[personaId];
}
