const socket = io();

const orderForm = document.querySelector("#order-form");
const formMessage = document.querySelector("#form-message");
const eventLog = document.querySelector("#event-log");
const clearLogButton = document.querySelector("#clear-log");

const statusEls = {
  mongo: document.querySelector("#mongo-status"),
  kafka: document.querySelector("#kafka-status"),
  changeStream: document.querySelector("#stream-status"),
};

const statusCards = {
  mongo: document.querySelector('[data-status="mongo"]'),
  kafka: document.querySelector('[data-status="kafka"]'),
  changeStream: document.querySelector('[data-status="changeStream"]'),
};

function statusClass(value) {
  if (["connected", "watching", "published"].includes(value)) return "ok";
  if (["starting", "connecting"].includes(value)) return "warn";
  return "bad";
}

function renderStatus(status) {
  for (const [key, value] of Object.entries(statusEls)) {
    value.textContent = status[key] || "unknown";
    statusCards[key].className = `status-pill ${statusClass(status[key])}`;
  }
}

function appendEvent(event) {
  const item = document.createElement("li");
  item.className = `event-item ${event.type}`;

  const meta = document.createElement("div");
  meta.className = "event-meta";
  meta.innerHTML = `<strong>${event.type}</strong><span>${new Date(event.at).toLocaleTimeString()}</span>`;

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(event.payload, null, 2);

  item.append(meta, pre);
  eventLog.prepend(item);

  while (eventLog.children.length > 80) {
    eventLog.lastElementChild.remove();
  }
}

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = orderForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  formMessage.textContent = "Inserting order...";

  const formData = new FormData(orderForm);
  const body = Object.fromEntries(formData.entries());

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Insert failed");

    formMessage.textContent = `Inserted ${payload.orderId}`;
  } catch (err) {
    formMessage.textContent = err.message;
  } finally {
    submitButton.disabled = false;
  }
});

clearLogButton.addEventListener("click", () => {
  eventLog.replaceChildren();
});

socket.on("status", renderStatus);
socket.on("event", appendEvent);
