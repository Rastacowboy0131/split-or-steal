"use client";
// Realtime feed hook for the Split or Steal spectator layer.
// Connects to the WS server at NEXT_PUBLIC_SOS_WS, keeps live games,
// jackpot, recent results, and chat in sync. Falls back gracefully:
// if the URL is unset or the socket never connects, `connected` stays
// false and callers render static demo data instead.
import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = process.env.NEXT_PUBLIC_SOS_WS || "";
const RESULT_LINGER_MS = 9000;

export function useLive() {
  const [connected, setConnected] = useState(false);
  const [jackpot, setJackpot] = useState(null);
  const [jackpotBump, setJackpotBump] = useState(null);
  const [games, setGames] = useState([]);
  const [recent, setRecent] = useState([]);
  const [chat, setChat] = useState([]);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!WS_URL) return;
    aliveRef.current = true;

    function connect() {
      if (!aliveRef.current) return;
      let ws;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        handle(msg);
      };

      ws.onclose = () => {
        setConnected(false);
        scheduleRetry();
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    }

    function scheduleRetry() {
      if (!aliveRef.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, retryRef.current));
      retryRef.current += 1;
      setTimeout(connect, delay);
    }

    function handle(msg) {
      switch (msg.type) {
        case "snapshot":
          setJackpot(msg.jackpot);
          setGames((msg.games || []).map((g) => ({ ...g, resolved: null })));
          setRecent(msg.recent || []);
          setChat(msg.chat || []);
          break;
        case "game_started":
          setGames((prev) => [...prev.filter((g) => g.id !== msg.game.id), { ...msg.game, resolved: null }]);
          break;
        case "phase_change":
          setGames((prev) => prev.map((g) => (g.id === msg.gameId ? { ...g, phase: msg.phase, phaseEndsAt: msg.phaseEndsAt } : g)));
          break;
        case "game_resolved": {
          setGames((prev) => prev.map((g) => (g.id === msg.gameId ? { ...g, phase: "resolved", resolved: msg } : g)));
          setRecent((prev) => [
            { id: msg.gameId, tier: msg.tier, p1: msg.p1, p2: msg.p2, c1: msg.c1, c2: msg.c2, result: msg.result },
            ...prev,
          ].slice(0, 8));
          // Drop the resolved card after the outcome animation plays.
          setTimeout(() => {
            setGames((prev) => prev.filter((g) => g.id !== msg.gameId));
          }, RESULT_LINGER_MS);
          break;
        }
        case "jackpot_update":
          setJackpot(msg.jackpot);
          setJackpotBump({ amount: msg.delta, reason: msg.reason, at: Date.now() });
          break;
        case "chat_message":
          setChat((prev) => [...prev, msg].slice(-80));
          break;
        default:
          break;
      }
    }

    connect();
    return () => {
      aliveRef.current = false;
      try { wsRef.current?.close(); } catch {}
    };
  }, []);

  const sendChat = useCallback((name, text) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "chat", name, text }));
      return true;
    }
    return false;
  }, []);

  return { available: !!WS_URL, connected, jackpot, jackpotBump, games, recent, chat, sendChat };
}
