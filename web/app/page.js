"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { WagmiProvider, useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatEther, toHex } from "viem";
import { wagmiConfig, CONTRACT_ADDRESS, CONTRACT_ABI, DEMO_MODE } from "../lib/config";
import { DEMO_JACKPOT, DEMO_ROOMS, DEMO_LIVE_GAMES, DEMO_PAST_GAMES, DEMO_TICKER_EVENTS } from "../lib/demo";
import RevealScene from "./RevealScene";
import { useLive } from "../lib/useLive";
import { LiveGameCard, ChatPanel } from "./Live";
import * as snd from "../lib/sound";

const qc = new QueryClient();

export default function Page() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function App() {
  const [view, setView] = useState({ screen: "lobby" }); // lobby | game

  // Init audio on the first user gesture anywhere on the page.
  useEffect(() => {
    const boot = () => { snd.initAudio(); window.removeEventListener("pointerdown", boot); };
    window.addEventListener("pointerdown", boot);
    return () => window.removeEventListener("pointerdown", boot);
  }, []);

  return (
    <div className="container">
      <TopBar />
      {view.screen === "lobby" && <Lobby onPlay={(room) => setView({ screen: "game", room })} />}
      {view.screen === "game" && <GameScreen room={view.room} onExit={() => setView({ screen: "lobby" })} />}
      <footer>
        Split or Steal runs on the Robinhood chain. Entry is free. The jackpot is funded by $SoS trading fees.
        {DEMO_MODE && " Currently in demo mode: contract and token not yet deployed."}
      </footer>
    </div>
  );
}

function MuteButton() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => { setMutedState(snd.isMuted()); }, []);
  function toggle() {
    snd.initAudio();
    const next = !muted;
    snd.setMuted(next);
    setMutedState(next);
    if (!next) snd.tick();
  }
  return (
    <button className="btn ghost mute-btn" onClick={toggle} aria-label={muted ? "Unmute sounds" : "Mute sounds"} title={muted ? "Unmute" : "Mute"}>
      {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
    </button>
  );
}

function TopBar() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  return (
    <header className="topbar">
      <div className="logo">
        <span className="split">SPLIT</span> or <span className="steal">STEAL</span>
        <span className="sub">Hug or Rug</span>
      </div>
      <div className="topbar-actions">
        {DEMO_MODE ? <span className="badge demo">DEMO MODE</span> : <span className="badge live">LIVE</span>}
        <MuteButton />
        {isConnected ? (
          <button className="btn ghost" onClick={() => disconnect()}>
            <span className="addr">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
          </button>
        ) : (
          <button className="btn" onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}

// Live jackpot value. In demo mode it slowly inflates to simulate fee inflow.
function useJackpot(live) {
  const { data } = useReadContract({
    address: CONTRACT_ADDRESS || undefined,
    abi: CONTRACT_ABI,
    functionName: "jackpot",
    query: { enabled: !DEMO_MODE },
  });
  const [demoValue, setDemoValue] = useState(parseFloat(DEMO_JACKPOT));
  const [lastBump, setLastBump] = useState(null);

  useEffect(() => {
    if (!DEMO_MODE) return;
    const t = setInterval(() => {
      const inc = 0.01 + Math.random() * 0.09;
      setDemoValue((v) => v + inc);
      setLastBump({ amount: inc, at: Date.now() });
    }, 6000 + Math.random() * 4000);
    return () => clearInterval(t);
  }, []);

  // Realtime feed wins when connected.
  if (live?.connected && live.jackpot != null) {
    return { value: live.jackpot, lastBump: live.jackpotBump };
  }
  if (DEMO_MODE) return { value: demoValue, lastBump };
  return { value: data != null ? parseFloat(formatEther(data)) : null, lastBump: null };
}

// Smooth count-up toward a moving target using requestAnimationFrame.
function useCountUp(target) {
  const [display, setDisplay] = useState(target ?? 0);
  const displayRef = useRef(target ?? 0);
  const raf = useRef(null);

  useEffect(() => {
    if (target == null) return;
    cancelAnimationFrame(raf.current);
    const start = displayRef.current;
    const diff = target - start;
    if (Math.abs(diff) < 0.0001) return;
    const dur = 1200;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = start + diff * eased;
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  return display;
}

// Streaming event ticker under the jackpot.
function JackpotTicker({ lastBump }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((text, cls) => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((prev) => [{ id, text, cls }, ...prev].slice(0, 4));
  }, []);

  // Fee bumps from the jackpot hook.
  useEffect(() => {
    if (lastBump) push(`+${lastBump.amount.toFixed(3)} ETH from fees`, "fee");
  }, [lastBump, push]);

  // Ambient demo events on their own slower cadence.
  useEffect(() => {
    if (!DEMO_MODE) return;
    let i = 0;
    const t = setInterval(() => {
      const ev = DEMO_TICKER_EVENTS[i % DEMO_TICKER_EVENTS.length];
      i += 1;
      push(ev.text, ev.cls);
    }, 11000);
    return () => clearInterval(t);
  }, [push]);

  if (items.length === 0) return <div className="ticker" />;
  return (
    <div className="ticker">
      {items.map((it, idx) => (
        <div key={it.id} className={`ticker-item ${it.cls} ${idx === 0 ? "fresh" : ""}`}>
          {it.text}
        </div>
      ))}
    </div>
  );
}

function Jackpot({ live }) {
  const { value, lastBump } = useJackpot(live);
  const display = useCountUp(value);
  return (
    <div className="jackpot">
      <div className="label">Community Jackpot</div>
      <div className="amount">{value == null ? "..." : display.toFixed(2)} <span className="unit">ETH</span></div>
      <div className="note">Funded by $SoS trading fees. Every rug rolls it higher.</div>
      <JackpotTicker lastBump={lastBump} />
    </div>
  );
}

function Lobby({ onPlay }) {
  const live = useLive();
  const showLive = live.connected && live.games.length > 0;
  const recentGames = live.connected && live.recent.length > 0 ? live.recent : DEMO_PAST_GAMES;
  return (
    <>
      <Jackpot live={live} />

      <section>
        <h2>The Room</h2>
        <div className="grid">
          {DEMO_ROOMS.map((r) => (
            <div key={r.id} className={`card ${r.cls}`}>
              <h3>{r.tier}</h3>
              <div className="row"><span className="k">Min $SoS hold</span><span>{r.minHoldPct} of supply</span></div>
              <div className="row"><span className="k">Round pot</span><span>{r.pot}</span></div>
              <div className="row"><span className="k">Cooldown</span><span>{r.cooldown}</span></div>
              <div className="row"><span className="k">Entry</span><span>FREE</span></div>
              <button className="btn teal" onClick={() => onPlay(r)}>Enter Queue</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Live Games {live.connected && <span className="badge live">LIVE</span>}</h2>
        <div className="game-list">
          {showLive
            ? live.games.map((g) => <LiveGameCard key={g.id} game={g} />)
            : DEMO_LIVE_GAMES.map((g) => (
                <div key={g.id} className="card">
                  <div>
                    <b>#{g.id}</b> <span className="badge demo">{g.tier}</span>{" "}
                    <span className="mask">{g.p1}</span> vs <span className="mask">{g.p2}</span>
                  </div>
                  <div>
                    <span className="phase">{g.phase}</span>{" "}
                    <span className="choice hidden-choice">choices hidden</span>
                  </div>
                </div>
              ))}
        </div>
      </section>

      {live.available && <ChatPanel chat={live.chat} sendChat={live.sendChat} connected={live.connected} />}

      <section>
        <h2>Recent Results</h2>
        <div className="game-list">
          {recentGames.map((g) => (
            <div key={g.id} className="card">
              <div>
                <b>#{g.id}</b> <span className="badge demo">{g.tier}</span>{" "}
                <span className="mask">{g.p1}</span>{" "}
                <span className={`choice ${g.c1 === "STEAL" ? "steal" : "split"}`}>{g.c1}</span>
                {" vs "}
                <span className="mask">{g.p2}</span>{" "}
                <span className={`choice ${g.c2 === "STEAL" ? "steal" : "split"}`}>{g.c2}</span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{g.result}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>How It Works</h2>
        <div className="card rules">
          <p><b>Free entry.</b> Hold the minimum $SoS and you are in. No stake, no risk.</p>
          <p><b>Both HUG (split):</b> you share half the round pot, a quarter each. The other half rolls back into the jackpot.</p>
          <p><b>One RUGS (steal):</b> the stealer takes half the round pot. The splitter gets nothing. The rest rolls over.</p>
          <p><b>Both RUG:</b> nobody gets paid. The whole pot rolls back into the jackpot.</p>
          <p><b>Commit-reveal:</b> your choice is hashed and hidden until both players reveal. No peeking.</p>
          <p><b>Go AFK</b> and you are treated as a splitter for the outcome but disqualified from any payout.</p>
        </div>
      </section>
    </>
  );
}

function GameScreen({ room, onExit }) {
  const [phase, setPhase] = useState("queue"); // queue | commit | reveal | cinematic | result
  const [choice, setChoice] = useState(null);
  const [committed, setCommitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [secs, setSecs] = useState(8);
  const [oppChoice, setOppChoice] = useState(null);
  const [meAfk, setMeAfk] = useState(false);

  // demo state machine with countdowns
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  // Timer sounds: soft tick each second, heartbeat under 10s.
  useEffect(() => {
    if (phase !== "commit" && phase !== "reveal") return;
    if (secs <= 0) return;
    if (secs <= 10) snd.heartbeat();
    else snd.tick();
  }, [secs, phase]);

  useEffect(() => {
    if (secs > 0) return;
    if (phase === "queue") { setPhase("commit"); setSecs(30); }
    else if (phase === "commit") { setMeAfk(true); startReveal(null); }
    else if (phase === "reveal") { setMeAfk(!revealed); startReveal(revealed ? choice : null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, phase]);

  function commitChoice(c) {
    snd.initAudio();
    setChoice(c);
    // real flow: salt = random 32 bytes stored locally, then contract.commit(gameId, keccak256(choice, salt, address))
    if (!DEMO_MODE) {
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
      localStorage.setItem("sos-salt", salt);
      // wagmi writeContract call would go here with CONTRACT_ADDRESS
    }
    setCommitted(true);
    if (phase === "commit") { setPhase("reveal"); setSecs(30); }
  }

  function doReveal() {
    snd.initAudio();
    setRevealed(true);
    startReveal(choice);
  }

  function startReveal(myCommittedChoice) {
    // Opponent occasionally goes AFK in the demo, mostly picks split or steal.
    const roll = Math.random();
    const opp = roll < 0.08 ? "AFK" : roll < 0.54 ? "SPLIT" : "STEAL";
    setOppChoice(opp);
    if (myCommittedChoice == null) setMeAfk(true);
    setPhase("cinematic");
  }

  const myChoice = meAfk ? "AFK" : choice === 1 ? "SPLIT" : choice === 2 ? "STEAL" : "AFK";
  let resultText = "";
  if (phase === "result") {
    if (meAfk) resultText = "You went AFK and passed out. Disqualified from payout.";
    else if (oppChoice === "AFK") resultText = "Opponent went AFK. They are disqualified, you get the splitter payout.";
    else if (myChoice === "SPLIT" && oppChoice === "SPLIT") resultText = "Both hugged! You each take a quarter of the pot.";
    else if (myChoice === "STEAL" && oppChoice === "SPLIT") resultText = "You rugged them! Half the pot is yours.";
    else if (myChoice === "SPLIT" && oppChoice === "STEAL") resultText = "You got rugged. They take half, you take nothing.";
    else resultText = "Double rug. Nobody gets paid, jackpot keeps it all.";
  }

  return (
    <div className="arena">
      <button className="btn ghost" onClick={onExit} style={{ float: "left" }}>Back to Lobby</button>
      <div style={{ clear: "both" }} />
      <h2 style={{ margin: "18px 0 4px" }}>{room?.tier || "The Room"}</h2>
      <div className="vs">
        <span className="mask">you</span> VS <span className="mask">{phase === "queue" ? "finding opponent..." : "0x????...????"}</span>
      </div>

      <div className="phase">
        {phase === "queue" ? "Matchmaking" : phase === "commit" ? "Lock your choice" : phase === "reveal" ? "Reveal phase" : phase === "cinematic" ? "The moment of truth" : "Result"}
      </div>
      {phase !== "result" && phase !== "cinematic" && (
        <div className={`timer ${secs < 15 ? "low" : ""} ${secs <= 10 && (phase === "commit" || phase === "reveal") ? "pulse" : ""}`}>
          {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
        </div>
      )}

      {(phase === "commit" || (phase === "reveal" && !committed)) && (
        <div className="choices">
          <button className={`choice-btn split-btn ${choice === 1 ? "sel" : ""}`} onClick={() => commitChoice(1)}>
            HUG<br /><small>split the pot</small>
          </button>
          <button className={`choice-btn steal-btn ${choice === 2 ? "sel" : ""}`} onClick={() => commitChoice(2)}>
            RUG<br /><small>take it all</small>
          </button>
        </div>
      )}

      {phase === "reveal" && committed && !revealed && (
        <div style={{ margin: "26px 0" }}>
          <p style={{ color: "var(--muted)", marginBottom: 14 }}>Choice locked and hidden. Reveal before the timer runs out or you are treated as AFK.</p>
          <button className="btn" onClick={doReveal}>Reveal My Choice</button>
        </div>
      )}

      {phase === "cinematic" && (
        <RevealScene
          myChoice={myChoice === "AFK" ? "SPLIT" : myChoice}
          oppChoice={oppChoice}
          meAfk={meAfk}
          onDone={() => setPhase("result")}
        />
      )}

      {phase === "result" && (
        <div style={{ margin: "26px 0" }}>
          <div className="result-line">
            You: <span className={`choice ${myChoice === "STEAL" ? "steal" : "split"}`}>{myChoice}</span>
            {"  |  "}
            Them: <span className={`choice ${oppChoice === "STEAL" ? "steal" : "split"}`}>{oppChoice}</span>
          </div>
          <p style={{ fontSize: "1.1rem" }}>{resultText}</p>
          <button className="btn teal" onClick={onExit} style={{ marginTop: 18 }}>Back to Lobby</button>
        </div>
      )}

      {DEMO_MODE && <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 30 }}>Demo simulation. Onchain play activates when the contract is deployed.</p>}
    </div>
  );
}
