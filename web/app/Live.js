"use client";
// Live spectator components: realtime game cards and audience chat.
import { useState, useEffect, useRef } from "react";

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const PHASE_TOTALS = { commit: 30000, reveal: 30000 };
const PHASE_LABELS = { commit: "Commit", reveal: "Reveal", resolved: "Resolved" };

function outcomeEmoji(c1, c2) {
  if (c1 === "AFK" || c2 === "AFK") return "zzz";
  if (c1 === "SPLIT" && c2 === "SPLIT") return "hug";
  if (c1 === "STEAL" && c2 === "STEAL") return "doublerug";
  return "rug";
}

function ResultBurst({ kind }) {
  if (kind === "hug") {
    return (
      <span className="burst burst-hug" aria-hidden>
        <span className="b1">💚</span><span className="b2">🤗</span><span className="b3">💚</span>
      </span>
    );
  }
  if (kind === "rug") {
    return <span className="burst burst-rug" aria-hidden><span className="b1">🔫</span><span className="b2">💥</span></span>;
  }
  if (kind === "doublerug") {
    return <span className="burst burst-rug" aria-hidden><span className="b1">💥</span><span className="b2">🔫</span><span className="b3">💥</span></span>;
  }
  return <span className="burst burst-zzz" aria-hidden><span className="b1">💤</span><span className="b2">💤</span></span>;
}

function ChoiceTag({ c }) {
  const cls = c === "STEAL" ? "steal" : c === "SPLIT" ? "split" : "hidden-choice";
  return <span className={`choice ${cls}`}>{c}</span>;
}

export function LiveGameCard({ game }) {
  const now = useNow();
  const r = game.resolved;
  if (r) {
    const kind = outcomeEmoji(r.c1, r.c2);
    return (
      <div className="card live-card resolved-card">
        <div>
          <b>#{game.id}</b> <span className="badge demo">{game.tier}</span>{" "}
          <span className="mask">{game.p1}</span> <ChoiceTag c={r.c1} />
          {" vs "}
          <span className="mask">{game.p2}</span> <ChoiceTag c={r.c2} />
        </div>
        <div className="live-result">
          <ResultBurst kind={kind} />
          <span className="live-result-text">{r.result}</span>
        </div>
      </div>
    );
  }

  const total = PHASE_TOTALS[game.phase] || 30000;
  const remaining = Math.max(0, game.phaseEndsAt - now);
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const secs = Math.ceil(remaining / 1000);

  return (
    <div className="card live-card">
      <div>
        <b>#{game.id}</b> <span className="badge demo">{game.tier}</span>{" "}
        <span className="mask">{game.p1}</span> vs <span className="mask">{game.p2}</span>
      </div>
      <div className="live-phase-row">
        <span className="phase">{PHASE_LABELS[game.phase] || game.phase}</span>
        <span className={`live-secs ${secs <= 10 ? "low" : ""}`}>{secs}s</span>
        <span className="choice hidden-choice">choices hidden</span>
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${game.phase}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const DEGEN_NAMES = [
  "diamondhands", "exitliquidity", "rugsurvivor", "gasguzzler", "moonboi",
  "paperhands", "wagmi_wanda", "ngmi_nate", "apestrong", "fomofrank",
  "hodlqueen", "sniperwallet", "jeetslayer", "bagholder9000", "degendave",
];

function randomName() {
  const base = DEGEN_NAMES[Math.floor(Math.random() * DEGEN_NAMES.length)];
  return `${base}${Math.floor(Math.random() * 900) + 100}`;
}

export function ChatPanel({ chat, sendChat, connected }) {
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const listRef = useRef(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem("sos-chat-name"); } catch {}
    setName(stored || randomName());
  }, []);

  useEffect(() => {
    if (name) {
      try { localStorage.setItem("sos-chat-name", name); } catch {}
    }
  }, [name]);

  // Auto-scroll pinned to bottom unless the user scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (sendChat(name, t)) setText("");
  }

  return (
    <section className="chat-section">
      <h2 className="chat-header" onClick={() => setOpen((o) => !o)}>
        Audience Chat{" "}
        <span className={`chat-dot ${connected ? "on" : "off"}`} title={connected ? "connected" : "offline"} />
        <span className="chat-toggle">{open ? "hide" : "show"}</span>
      </h2>
      {open && (
        <div className="card chat-card">
          <div className="chat-list" ref={listRef} onScroll={onScroll}>
            {chat.length === 0 && <div className="chat-empty">No messages yet. Say something.</div>}
            {chat.map((m, i) => (
              <div key={`${m.at}-${i}`} className="chat-msg">
                <span className="chat-name">{m.name}</span> <span className="chat-text">{m.text}</span>
              </div>
            ))}
          </div>
          <form className="chat-input-row" onSubmit={submit}>
            {editingName ? (
              <input
                className="chat-name-input"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditingName(false); } }}
                autoFocus
              />
            ) : (
              <button type="button" className="chat-name-btn" onClick={() => setEditingName(true)} title="Change name">
                {name || "..."}
              </button>
            )}
            <input
              className="chat-text-input"
              value={text}
              maxLength={200}
              placeholder={connected ? "Talk your book..." : "Chat offline"}
              disabled={!connected}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn teal chat-send" disabled={!connected || !text.trim()}>Send</button>
          </form>
        </div>
      )}
    </section>
  );
}
