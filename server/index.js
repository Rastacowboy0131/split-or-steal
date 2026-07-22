// Split or Steal realtime spectator server.
// WS events out: snapshot, game_started, phase_change, game_resolved, jackpot_update, chat_message.
// WS messages in: { type: "chat", name, text }.
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { DemoEngine, RealEngine } from "./engine.js";

const PORT = process.env.PORT || 8080;
const ENGINE = process.env.ENGINE || "demo";

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true, engine: ENGINE, clients: wss.clients.size, uptime: process.uptime() });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

const engine = ENGINE === "real" ? new RealEngine(broadcast) : new DemoEngine(broadcast);
engine.start();

// Audience chat: in-memory, last 50 messages.
const chatHistory = [];

function sanitizeText(raw, max) {
  return String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

wss.on("connection", (ws) => {
  ws._lastChatAt = 0;

  const snap = engine.snapshot();
  ws.send(JSON.stringify({
    type: "snapshot",
    jackpot: snap.jackpot,
    games: snap.games,
    recent: snap.recent,
    chat: chatHistory,
    serverTime: Date.now(),
  }));

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (!msg || msg.type !== "chat") return;

    const now = Date.now();
    if (now - ws._lastChatAt < 2000) return; // 1 msg per 2s per connection
    const text = sanitizeText(msg.text, 200);
    const name = sanitizeText(msg.name, 40) || "anon";
    if (!text) return;
    ws._lastChatAt = now;

    const chatMsg = { type: "chat_message", name, text, at: now };
    chatHistory.push(chatMsg);
    if (chatHistory.length > 50) chatHistory.shift();
    broadcast(chatMsg);
  });
});

// Keepalive: terminate dead connections.
setInterval(() => {
  for (const client of wss.clients) {
    if (client._dead) { client.terminate(); continue; }
    client._dead = true;
    client.ping();
  }
}, 30_000);
wss.on("connection", (ws) => {
  ws.on("pong", () => { ws._dead = false; });
});

server.listen(PORT, () => {
  console.log(`split-or-steal ws server on :${PORT} (engine=${ENGINE})`);
});
