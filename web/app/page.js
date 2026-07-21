"use client";
import { useState, useEffect } from "react";
import { WagmiProvider, useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatEther, keccak256, encodePacked, toHex } from "viem";
import { wagmiConfig, CONTRACT_ADDRESS, CONTRACT_ABI, DEMO_MODE } from "../lib/config";
import { DEMO_JACKPOT, DEMO_ROOMS, DEMO_LIVE_GAMES, DEMO_PAST_GAMES } from "../lib/demo";

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
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {DEMO_MODE ? <span className="badge demo">DEMO MODE</span> : <span className="badge live">LIVE</span>}
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

function useJackpot() {
  const { data } = useReadContract({
    address: CONTRACT_ADDRESS || undefined,
    abi: CONTRACT_ABI,
    functionName: "jackpot",
    query: { enabled: !DEMO_MODE },
  });
  if (DEMO_MODE) return DEMO_JACKPOT;
  return data != null ? formatEther(data) : "...";
}

function Lobby({ onPlay }) {
  const jackpot = useJackpot();
  return (
    <>
      <div className="jackpot">
        <div className="label">Community Jackpot</div>
        <div className="amount">{jackpot} ETH</div>
        <div className="note">Funded by $SoS trading fees. Every rug rolls it higher.</div>
      </div>

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
        <h2>Live Games</h2>
        <div className="game-list">
          {DEMO_LIVE_GAMES.map((g) => (
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

      <section>
        <h2>Recent Results</h2>
        <div className="game-list">
          {DEMO_PAST_GAMES.map((g) => (
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

const PHASES = ["queue", "commit", "reveal", "result"];

function GameScreen({ room, onExit }) {
  const [phase, setPhase] = useState("queue");
  const [choice, setChoice] = useState(null);
  const [committed, setCommitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [secs, setSecs] = useState(8);
  const [oppChoice, setOppChoice] = useState(null);

  // demo state machine with countdowns
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (secs > 0) return;
    if (phase === "queue") { setPhase("commit"); setSecs(30); }
    else if (phase === "commit") { setPhase("reveal"); setSecs(30); }
    else if (phase === "reveal") { finishDemo(); }
  }, [secs, phase]);

  function commitChoice(c) {
    setChoice(c);
    // real flow: salt = random 32 bytes stored locally, then contract.commit(gameId, keccak256(choice, salt, address))
    if (!DEMO_MODE) {
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
      localStorage.setItem("sos-salt", salt);
      // wagmi writeContract call would go here with CONTRACT_ADDRESS
    }
    setCommitted(true);
    if (phase === "commit") { setPhase("reveal"); setSecs(300); }
  }

  function doReveal() {
    setRevealed(true);
    finishDemo();
  }

  function finishDemo() {
    setOppChoice(Math.random() < 0.5 ? "SPLIT" : "STEAL");
    setPhase("result");
  }

  const myChoice = choice === 1 ? "SPLIT" : choice === 2 ? "STEAL" : "AFK";
  let resultText = "";
  if (phase === "result") {
    if (!revealed && !committed) resultText = "You went AFK. Disqualified from payout.";
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

      <div className="phase">{phase === "queue" ? "Matchmaking" : phase === "commit" ? "Lock your choice" : phase === "reveal" ? "Reveal phase" : "Result"}</div>
      {phase !== "result" && (
        <div className={`timer ${secs < 15 ? "low" : ""}`}>
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

      {phase === "result" && (
        <div style={{ margin: "26px 0" }}>
          <div style={{ fontSize: "1.4rem", margin: "12px 0" }}>
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
