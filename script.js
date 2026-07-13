/* ======================================================
   EDIT ME: This is the only place you need to change
   persona names, taglines, and colors.
   Add more personas by adding more entries here.
   ====================================================== */
const PERSONAS = {
  1: {
    name: "Hitesh Choudhary", // <-- rename e.g. "Aria"
    tagline:
      "Code seekho, chai ke saath — fundamentals, projects, aur career ki har baat",
    initial: "HC",
    color: "#7c6ff0",
    image: "assets/hitesh.png",
  },
  2: {
    name: "Piyush Garg", // <-- rename e.g. "Sage"
    tagline:
      "Stop watching, start building — full-stack, DevOps, aur GenAI, sab kuch project mode mein",
    initial: "PG",
    color: "#3fb8af",
    image: "assets/piyush.png",
  },
};

const TYPING_STATUS_LABELS = {
  generating: "Gathering responses from 3 models…",
  evaluating: "Evaluating responses & picking the best…",
};

const APP = {
  title: "Seekhna Hai Kuch Naya?",
  subtitle: "Choose your coding mentor to begin",
};

// In-memory only — resets on page reload, nothing is saved to disk.
const chatHistories = {};
Object.keys(PERSONAS).forEach((id) => (chatHistories[id] = []));

// Tracks whether each persona is currently "typing" a reply.
const typingState = {};
Object.keys(PERSONAS).forEach((id) => (typingState[id] = false));

let currentPersonaId = null;

/* ---------- Theme (light/dark) ---------- */
const THEME_KEY = "personaai-theme";

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  applyTheme(getPreferredTheme());

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}

/* ---------- Home page ---------- */
function renderHomePage() {
  document.getElementById("app-title").textContent = APP.title;
  document.getElementById("app-subtitle").textContent = APP.subtitle;

  const grid = document.getElementById("persona-grid");
  grid.innerHTML = "";

  Object.entries(PERSONAS).forEach(([id, persona]) => {
    const btn = document.createElement("a");
    btn.href = `chat.html?persona=${id}`;
    btn.className = "persona-circle-btn";
    btn.innerHTML = `
      <div class="persona-avatar" style="background:${persona.color}">
        <img src="${persona.image}" alt="${persona.name}" />
      </div>
      <span class="persona-label">${persona.name}</span>
      <p class="persona-bio">${persona.tagline}</p>
    `;
    grid.appendChild(btn);
  });
}

/* ---------- Chat page ---------- */
function initChatPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("persona");

  if (!PERSONAS[requestedId]) {
    showInvalidPersonaError();
    return; // stop here — don't render nav, don't load any persona
  }

  currentPersonaId = requestedId;

  renderPersonaNav();
  loadPersona(currentPersonaId);

  const form = document.getElementById("chat-form");
  form.addEventListener("submit", handleSendMessage);
}

function renderPersonaNav() {
  const list = document.getElementById("persona-nav-list");
  list.innerHTML = "";

  Object.entries(PERSONAS).forEach(([id, persona]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "persona-nav-btn" + (id === currentPersonaId ? " active" : "");
    btn.innerHTML = `
      <span class="persona-nav-avatar" style="background:${persona.color}">
        <img src="${persona.image}" alt="${persona.name}" />
      </span>
      <span class="persona-nav-text">${persona.name}</span>
    `;
    btn.addEventListener("click", () => {
      currentPersonaId = id;
      renderPersonaNav();
      loadPersona(id);
    });
    list.appendChild(btn);
  });
}

function loadPersona(id) {
  const persona = PERSONAS[id];

  document.getElementById("chat-persona-name").textContent = persona.name;
  const avatar = document.getElementById("chat-avatar");
  avatar.style.background = persona.color;
  avatar.innerHTML = `<img src="${persona.image}" alt="${persona.name}" />`;

  // Seed a greeting the first time this persona is opened this session
  if (chatHistories[id].length === 0) {
    chatHistories[id].push({
      sender: "assistant",
      text: `Hello, I am ${persona.name}. ${persona.tagline}.`,
    });
  }

  renderMessages();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function applyInlineFormatting(str) {
  return str.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// Turns lightweight markdown (bold, numbered/bulleted lists, paragraphs)
// from the assistant's reply into safe HTML so points render on their own
// line instead of as one run-on paragraph.
function formatMessageText(text) {
  const lines = escapeHtml(text).split(/\r?\n/);
  let html = "";
  let listItems = [];
  let listType = null;

  function flushList() {
    if (listItems.length) {
      html += `<${listType}>${listItems
        .map((li) => `<li>${li}</li>`)
        .join("")}</${listType}>`;
      listItems = [];
      listType = null;
    }
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    const numberedMatch = line.match(/^\d+\.\s+(.*)/);
    const bulletMatch = line.match(/^[-*]\s+(.*)/);

    if (numberedMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(applyInlineFormatting(numberedMatch[1]));
    } else if (bulletMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(applyInlineFormatting(bulletMatch[1]));
    } else {
      flushList();
      html += `<p>${applyInlineFormatting(line)}</p>`;
    }
  });
  flushList();

  return html;
}

// Builds the comparison view of the raw responses from all three models,
// highlighting the one the self-consistency judge selected as the final reply.
function buildCandidatePanel(msg) {
  const panel = document.createElement("div");
  panel.className = "candidate-panel";

  const title = document.createElement("div");
  title.className = "candidate-panel-title";
  title.textContent =
    "Self-consistency: 3 models answered, the judge picked one";
  panel.appendChild(title);

  msg.candidates.forEach((candidate) => {
    const isSelected = candidate.label === msg.selectedLabel;
    const card = document.createElement("div");
    card.className = "candidate-card" + (isSelected ? " selected" : "");
    card.innerHTML = `
      <div class="candidate-card-header">
        <span>Response ${candidate.label} — ${candidate.model}</span>
        ${isSelected ? '<span class="candidate-badge">✓ selected</span>' : ""}
      </div>
      <div class="candidate-card-body"></div>
    `;
    card.querySelector(".candidate-card-body").innerHTML = formatMessageText(
      candidate.text,
    );
    panel.appendChild(card);
  });

  if (msg.selectedLabel === "D") {
    const note = document.createElement("div");
    note.className = "candidate-modified-note";
    note.textContent =
      "None of the candidates fully met the evaluation criteria, so the judge edited one — the final reply is a modified version (Response D).";
    panel.appendChild(note);
  }

  return panel;
}

function renderMessages(options = {}) {
  const container = document.getElementById("messages");
  const previousScrollTop = container.scrollTop;
  container.innerHTML = "";
  const persona = PERSONAS[currentPersonaId];

  chatHistories[currentPersonaId].forEach((msg) => {
    const row = document.createElement("div");
    row.className = `message-row ${msg.sender}`;

    if (msg.sender === "assistant" && msg.showCandidates)
      row.classList.add("comparing");

    const avatarColor = msg.sender === "user" ? "#4a4a5a" : persona.color;
    const avatarInner =
      msg.sender === "user"
        ? "You"
        : `<img src="${persona.image}" alt="${persona.name}" />`;

    row.innerHTML = `
      <div class="message-avatar" style="background:${avatarColor}">${avatarInner}</div>
      <div class="message-bubble"></div>
    `;
    const bubble = row.querySelector(".message-bubble");

    if (msg.sender === "user") {
      bubble.textContent = msg.text;
    } else if (msg.showCandidates && msg.candidates?.length) {
      bubble.appendChild(buildCandidatePanel(msg));
    } else {
      bubble.innerHTML = formatMessageText(msg.text);
    }

    // Replies that went through the self-consistency ensemble carry the raw
    // candidates — offer a switch between them and the final response.
    if (msg.sender === "assistant" && msg.candidates?.length) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "candidate-toggle";
      toggle.textContent = msg.showCandidates
        ? "← Back to final response"
        : "⚖ Compare the 3 model responses";
      toggle.addEventListener("click", () => {
        msg.showCandidates = !msg.showCandidates;
        renderMessages({ preserveScroll: true });
      });
      bubble.appendChild(toggle);
    }

    container.appendChild(row);
  });

  if (typingState[currentPersonaId]) {
    const statusLabel = TYPING_STATUS_LABELS[typingState[currentPersonaId]];

    const row = document.createElement("div");
    row.className = "message-row assistant typing";

    row.innerHTML = `
      <div class="message-avatar" style="background:${persona.color}">
        <img src="${persona.image}" alt="${persona.name}" />
      </div>
      <div class="message-bubble typing-bubble">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        ${statusLabel ? `<span class="typing-status">${statusLabel}</span>` : ""}
      </div>
    `;
    container.appendChild(row);
  }

  container.scrollTop = options.preserveScroll
    ? previousScrollTop
    : container.scrollHeight;
}

// Reads newline-delimited JSON events from a streaming /api/chat response.
// Intermediate events carry the pipeline status ("generating", "evaluating");
// the final "done" event carries the reply plus the candidate data.
async function readStatusStream(res, onStatus) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.status === "done") finalEvent = event;
      else onStatus(event.status);
    }
  }

  if (!finalEvent) throw new Error("Stream ended without a final response");
  return finalEvent;
}

async function handleSendMessage(event) {
  event.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;

  const MAX_MESSAGE_LENGTH = 1000;

  if (text.length > MAX_MESSAGE_LENGTH) {
    alert(
      `Message is too long (${text.length}/${MAX_MESSAGE_LENGTH} characters). Please shorten it.`,
    );
    return;
  }

  chatHistories[currentPersonaId].push({ sender: "user", text });
  input.value = "";

  const personaId = currentPersonaId;
  typingState[personaId] = "generating";
  renderMessages();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personaId,
        history: chatHistories[personaId],
      }),
    });

    const contentType = res.headers.get("content-type") ?? "";
    let data;

    if (contentType.includes("application/x-ndjson")) {
      data = await readStatusStream(res, (status) => {
        typingState[personaId] = status;
        if (personaId === currentPersonaId) renderMessages();
      });
    } else {
      // Canned replies (moderation, turn cap, validation) are plain JSON.
      data = await res.json();
    }

    chatHistories[personaId].push({
      sender: "assistant",
      text: data.reply,
      candidates: data.candidates,
      selectedLabel: data.selectedLabel,
    });
  } catch {
    chatHistories[personaId].push({
      sender: "assistant",
      text: "Sorry, something went wrong. Please try again.",
    });
  } finally {
    typingState[personaId] = false;
    if (personaId === currentPersonaId) renderMessages();
  }
}

function showInvalidPersonaError() {
  document.querySelector(".chat-layout").innerHTML = `
    <div class="error-state">
      <h2>Persona not found</h2>
      <p>That persona doesn't exist. Please pick one from the home page.</p>
      <a href="index.html" class="error-home-link">← Back to Home</a>
    </div>
  `;
}
