// Lightweight, zero-LLM-call input moderation. Catches obvious jailbreak
// attempts and clearly off-domain requests before the model is ever called,
// so the persona's canned fallback template can be returned instead.

const INJECTION_PATTERNS = [
  /ignore (all|any|previous|prior) instructions/i,
  /disregard (all|any|previous|prior) (rules|instructions)/i,
  /you are (now|no longer) (bound|restricted|an ai)/i,
  /reveal (your|the) (system prompt|instructions)/i,
  /show me (your|the) (system prompt|instructions)/i,
  /act as (dan|an unfiltered|a jailbroken)/i,
  /pretend (you('| a)?re|to be) (not|no longer)/i,
  /developer mode/i,
  /jailbreak/i,
];

const OFF_DOMAIN_PATTERNS = [
  /\b(stock tips?|share market predictions?|crypto price predictions?)\b/i,
  /\b(medical diagnos(is|e)|prescribe .*medicine|which medicine should i take)\b/i,
  /\b(legal advice|should i sue)\b/i,
  /\bwho should i vote for\b/i,
];

export function detectPromptInjection(text) {
  if (!text) return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectOffDomain(text) {
  if (!text) return false;
  return OFF_DOMAIN_PATTERNS.some((pattern) => pattern.test(text));
}
