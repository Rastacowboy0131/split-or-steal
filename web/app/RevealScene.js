"use client";
// Cartoon character face-off played when a demo round resolves.
// Phases: countdown 3-2-1, card flip suspense, then outcome animation.
import { useState, useEffect, useRef } from "react";
import * as snd from "../lib/sound";

// outcome: "hug" | "youSteal" | "themSteal" | "doubleSteal" | "youAfk" | "themAfk"
export default function RevealScene({ myChoice, oppChoice, meAfk, onDone }) {
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
          {stage === "act" && outcome === "doubleSteal" && <FlyingPot />}
        </div>
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

function FlyingPot() {
  return <div className="flying-pot">{"\uD83D\uDCB0"}</div>;
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
