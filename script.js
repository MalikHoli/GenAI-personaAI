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

const APP = {
  title: "Seekhna Hai Kuch Naya?",
  subtitle: "Choose your coding mentor to begin",
};

// In-memory only — resets on page reload, nothing is saved to disk.
const chatHistories = {};
Object.keys(PERSONAS).forEach((id) => (chatHistories[id] = []));

let currentPersonaId = null;

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

function renderMessages() {
  const container = document.getElementById("messages");
  container.innerHTML = "";
  const persona = PERSONAS[currentPersonaId];

  chatHistories[currentPersonaId].forEach((msg) => {
    const row = document.createElement("div");
    row.className = `message-row ${msg.sender}`;

    const avatarColor = msg.sender === "user" ? "#4a4a5a" : persona.color;
    const avatarInner =
      +msg.sender === "user"
        ? "You"
        : `<img src="${persona.image}" alt="${persona.name}" />`;

    row.innerHTML = `
      <div class="message-avatar" style="background:${avatarColor}">${avatarInner}</div>
      <div class="message-bubble"></div>
    `;
    row.querySelector(".message-bubble").textContent = msg.text;
    container.appendChild(row);
  });

  container.scrollTop = container.scrollHeight;
}

function handleSendMessage(event) {
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
  renderMessages();

  // Placeholder reply — swap this out later for a real AI model call.
  // setTimeout(() => {
  //   chatHistories[currentPersonaId].push({
  //     sender: "assistant",
  //     text: "(This is a placeholder reply. Connect your AI model here.)"
  //   });
  //   renderMessages();
  // }, 500);
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personaId: currentPersonaId,
      history: chatHistories[currentPersonaId],
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      chatHistories[currentPersonaId].push({
        sender: "assistant",
        text: data.reply,
      });
      renderMessages();
    });
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
