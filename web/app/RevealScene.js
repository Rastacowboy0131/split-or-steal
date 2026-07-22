"use client";
// Cartoon character face-off played when a demo round resolves.
// Phases: countdown 3-2-1, card flip suspense, then outcome animation.
import { useState, useEffect, useRef } from "react";
import * as snd from "../lib/sound";

// outcome: "hug" | "youSteal" | "themSteal" | "doubleSteal" | "youAfk" | "themAfk"
export default function RevealScene({ myChoice, oppChoice, meAfk, potLabel, onDone }) {
  const outcome = meAfk
    ? "youAfk"
    : oppChoice === "AFK"
    ? "themAfk"
    : myChoice === "SPLIT" && oppChoice === "SPLIT"
    ? "hug"
    : myChoice === "STEAL" && oppChoice === "STEAL"
    ? "doubleSteal"
    : myChoice === "STEAL"
    ? "youSteal"
    : "themSteal";

  const [stage, setStage] = useState("countdown"); // countdown | flip | act
  const [count, setCount] = useState(3);
  const doneRef = useRef(false);

  useEffect(() => {
    const timers = [];
    // countdown beats
    snd.beep(false);
    timers.push(setTimeout(() => { setCount(2); snd.beep(false); }, 900));
    timers.push(setTimeout(() => { setCount(1); snd.beep(true); }, 1800));
    // flip the cards
    timers.push(setTimeout(() => { setStage("flip"); snd.sting(); }, 2700));
    // act out the outcome
    timers.push(setTimeout(() => {
      setStage("act");
      if (outcome === "hug") snd.chime();
      else if (outcome === "youSteal" || outcome === "themSteal") setTimeout(() => snd.gunshot(), 600);
      else if (outcome === "doubleSteal") setTimeout(() => { snd.gunshot(); setTimeout(() => snd.gunshot(), 120); }, 600);
      else snd.snore();
    }, 4200));
    // hand control back
    timers.push(setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onDone && onDone(); }
    }, 8200));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shake = stage === "act" && outcome !== "hug" && outcome !== "youAfk" && outcome !== "themAfk";

  return (
    <div className={`reveal-scene ${shake ? "shake" : ""}`}>
      {stage === "countdown" && (
        <div className="countdown" key={count}>{count}</div>
      )}

      <div className="flip-row">
        <FlipCard label="YOU" value={meAfk ? "AFK" : myChoice} flipped={stage !== "countdown"} />
        <FlipCard label="THEM" value={oppChoice} flipped={stage !== "countdown"} />
      </div>

      <div className={`stage-floor outcome-${outcome} ${stage === "act" ? "acting" : ""}`}>
        <Character side="left" color="var(--teal)" outcome={outcome} acting={stage === "act"} />
        <div className="stage-mid">
          {stage === "act" && outcome === "hug" && <Hearts />}
        </div>
        <PotTable label={potLabel} mode={stage === "act" ? outcome : "idle"} />
        <Character side="right" color="var(--pink)" outcome={outcome} acting={stage === "act"} />
      </div>
    </div>
  );
}

function FlipCard({ label, value, flipped }) {
  const cls = value === "STEAL" ? "steal" : value === "AFK" ? "afk" : "split";
  return (
    <div className="flip-card-wrap">
      <div className="flip-label">{label}</div>
      <div className={`flip-card ${flipped ? "flipped" : ""}`}>
        <div className="flip-face flip-front">?</div>
        <div className={`flip-face flip-back ${cls}`}>{value === "STEAL" ? "RUG" : value === "SPLIT" ? "HUG" : "AFK"}</div>
      </div>
    </div>
  );
}

function Hearts() {
  return (
    <div className="hearts">
      {["h1", "h2", "h3", "h4", "h5"].map((k) => (
        <span key={k} className={`heart ${k}`}>{"\u2764"}</span>
      ))}
      {["c1", "c2", "c3", "c4", "c5", "c6"].map((k) => (
        <span key={k} className={`confetti ${k}`} />
      ))}
    </div>
  );
}

// Gold coin stack that sits on the table. Rendered as inline SVG so it can split in half.
function PotCoins({ half }) {
  // half: undefined = full stack, "left" or "right" = clipped half for the split animation
  const clip = half === "left" ? { x: 0, w: 30 } : half === "right" ? { x: 30, w: 30 } : null;
  return (
    <svg viewBox={clip ? `${clip.x} 0 ${clip.w} 40` : "0 0 60 40"} width={clip ? 26 : 52} height={36} aria-hidden="true">
      <g stroke="#a8781a" strokeWidth="1.5">
        <ellipse cx="18" cy="33" rx="14" ry="5" fill="var(--gold)" />
        <ellipse cx="18" cy="28" rx="14" ry="5" fill="#ffd966" />
        <ellipse cx="42" cy="33" rx="14" ry="5" fill="var(--gold)" />
        <ellipse cx="42" cy="28" rx="14" ry="5" fill="#ffd966" />
        <ellipse cx="30" cy="21" rx="14" ry="5" fill="var(--gold)" />
        <ellipse cx="30" cy="16" rx="14" ry="5" fill="#ffd966" />
      </g>
      {/* ETH diamond mark on the top coin */}
      <path d="M30 10 l5 6 -5 4 -5 -4 z" fill="#7a5a10" opacity="0.85" />
    </svg>
  );
}

// Table with the round pot on top. mode: "idle" or an outcome name.
// idle -> subtle glow pulse; hug -> pot splits toward both players;
// youSteal / themAfk -> pot slides to the left player; themSteal / youAfk -> to the right;
// doubleSteal -> pot flies up toward the jackpot.
export function PotTable({ label, mode = "idle" }) {
  const split = mode === "hug";
  const toLeft = mode === "youSteal" || mode === "themAfk";
  const toRight = mode === "themSteal" || mode === "youAfk";
  const fly = mode === "doubleSteal";
  return (
    <div className={`pot-table mode-${mode}`}>
      <div className="pot-spot">
        {split ? (
          <>
            <div className="pot pot-half pot-half-left"><PotCoins half="left" /></div>
            <div className="pot pot-half pot-half-right"><PotCoins half="right" /></div>
          </>
        ) : (
          <div className={`pot ${toLeft ? "pot-to-left" : toRight ? "pot-to-right" : fly ? "pot-fly" : "pot-idle"}`}>
            <PotCoins />
          </div>
        )}
        <div className={`pot-amount ${fly || split || toLeft || toRight ? "pot-amount-fade" : ""}`}>{label || "0.5 ETH"}</div>
      </div>
      <svg className="table-svg" viewBox="0 0 140 46" width="128" height="42" aria-hidden="true">
        <ellipse cx="70" cy="8" rx="66" ry="7" fill="#2a2a44" stroke="#3a3a5c" strokeWidth="1.5" />
        <rect x="8" y="8" width="124" height="7" rx="3" fill="#1e1e33" />
        <rect x="22" y="14" width="8" height="30" rx="3" fill="#26263e" />
        <rect x="110" y="14" width="8" height="30" rx="3" fill="#26263e" />
        <ellipse cx="70" cy="6" rx="40" ry="3.5" fill="rgba(245,197,66,0.08)" />
      </svg>
    </div>
  );
}

// Simple inline SVG cartoon character. Behavior derives from outcome and side.
function Character({ side, color, outcome, acting }) {
  const isLeft = side === "left";
  // Determine this character's role in the act.
  let role = "idle";
  if (acting) {
    if (outcome === "hug") role = "hug";
    else if (outcome === "doubleSteal") role = "shootBoth";
    else if (outcome === "youSteal") role = isLeft ? "shooter" : "victim";
    else if (outcome === "themSteal") role = isLeft ? "victim" : "shooter";
    else if (outcome === "youAfk") role = isLeft ? "sleeper" : "watcher";
    else if (outcome === "themAfk") role = isLeft ? "watcher" : "sleeper";
  }
  const showGun = role === "shooter" || role === "shootBoth";
  const falls = role === "victim" || role === "shootBoth" || role === "sleeper";

  return (
    <div className={`char char-${side} role-${role}`}>
      <svg viewBox="0 0 120 150" width="110" height="138" aria-hidden="true">
        <g className="char-body" transform={isLeft ? "" : "translate(120,0) scale(-1,1)"}>
          {/* legs */}
          <rect x="46" y="112" width="10" height="32" rx="5" fill={color} opacity="0.85" />
          <rect x="64" y="112" width="10" height="32" rx="5" fill={color} opacity="0.85" />
          {/* body */}
          <rect x="38" y="62" width="44" height="58" rx="18" fill={color} />
          {/* back arm */}
          <rect className="arm-back" x="30" y="68" width="12" height="38" rx="6" fill={color} opacity="0.8" />
          {/* front arm, this one holds the gun */}
          <g className="arm-front">
            <rect x="76" y="68" width="34" height="12" rx="6" fill={color} />
            {showGun && (
              <g className="gun">
                <rect x="104" y="64" width="16" height="8" rx="2" fill="#444457" />
                <rect x="104" y="70" width="6" height="9" rx="2" fill="#444457" />
                <polygon className="muzzle" points="122,60 134,68 122,76 126,68" fill="var(--gold)" />
              </g>
            )}
          </g>
          {/* head */}
          <circle cx="60" cy="38" r="24" fill={color} />
          {/* face */}
          <g className="face">
            {role === "sleeper" ? (
              <>
                <path d="M48 36 q4 4 8 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" />
                <path d="M64 36 q4 4 8 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" />
                <ellipse cx="60" cy="48" rx="4" ry="5" fill="#0b0b12" />
              </>
            ) : role === "victim" || role === "shootBoth" ? (
              <>
                <path d="M48 32 l8 8 M56 32 l-8 8" stroke="#0b0b12" strokeWidth="2.5" />
                <path d="M64 32 l8 8 M72 32 l-8 8" stroke="#0b0b12" strokeWidth="2.5" />
                <ellipse cx="60" cy="49" rx="5" ry="4" fill="#0b0b12" />
              </>
            ) : (
              <>
                <circle cx="52" cy="36" r="3.5" fill="#0b0b12" />
                <circle cx="68" cy="36" r="3.5" fill="#0b0b12" />
                {role === "hug" ? (
                  <path d="M50 46 q10 10 20 0" stroke="#0b0b12" strokeWidth="3" fill="none" />
                ) : role === "watcher" ? (
                  <ellipse cx="60" cy="48" rx="5" ry="6" fill="#0b0b12" />
                ) : (
                  <path d="M52 48 h16" stroke="#0b0b12" strokeWidth="3" />
                )}
              </>
            )}
          </g>
        </g>
      </svg>
      {role === "sleeper" && (
        <div className="zzz">
          <span>z</span><span>Z</span><span>z</span>
        </div>
      )}
    </div>
  );
}
