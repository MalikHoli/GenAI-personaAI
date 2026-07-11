// Tunables for prompt assembly and long-conversation handling.

// Hard cap on user turns per thread. Beyond this, the persona's canned
// capRefusalTemplate is returned instead of calling the model.
export const MAX_TURNS_PER_THREAD = 30;

// Drift refresh starts at this turn, then repeats every DRIFT_REFRESH_INTERVAL
// turns after, re-injecting a short "stay in character" reminder block so the
// persona doesn't slowly drift out of voice over a long chat.
export const DRIFT_REFRESH_START_TURN = 15;
export const DRIFT_REFRESH_INTERVAL = 10;

export const MAX_MESSAGE_LENGTH = 1000;
