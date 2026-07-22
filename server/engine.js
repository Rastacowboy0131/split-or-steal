// Demo game engine for Split or Steal spectator mode.
// Emits the same event shapes a real onchain indexer would emit,
// so clients never need to know which engine is behind the socket.
//
// Events emitted (via the broadcast callback):
//   game_started   { game: { id, tier, p1, p2, pot, phase, phaseEndsAt } }
//   phase_change   { gameId, phase, phaseEndsAt }
//   game_resolved  { gameId, p1, p2, c1, c2, pot, result, jackpotDelta }
//   jackpot_update { jackpot, delta, reason }

const COMMIT_MS = 30_000;
const REVEAL_MS = 30_000;
const RESULT_LINGER_MS = 12_000;
const POT = 0.5; // ETH per round

const HEX = "0123456789abcdef";
function randHex(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}
function maskedWallet() {
  return `0x${randHex(4)}...${randHex(4)}`;
}

function pickOutcome() {
  // Weighted outcomes: hug/hug, rug/hug, hug/rug, rug/rug, afk.
  const r = Math.random();
  if (r < 0.30) return ["SPLIT", "SPLIT"];
  if (r < 0.52) return ["STEAL", "SPLIT"];
  if (r < 0.74) return ["SPLIT", "STEAL"];
  if (r < 0.92) return ["STEAL", "STEAL"];
  return Math.random() < 0.5 ? ["AFK", "SPLIT"] : ["SPLIT", "AFK"];
}

function resolveText(c1, c2) {
  const half = (POT / 2).toFixed(2);
  const quarter = (POT / 4).toFixed(3);
  if (c1 === "AFK" || c2 === "AFK") {
    return {
      result: `AFK player disqualified. Active splitter paid ${quarter} ETH.`,
      jackpotDelta: POT - POT / 4,
    };
  }
  if (c1 === "SPLIT" && c2 === "SPLIT") {
    return {
      result: `Both hugged. ${quarter} ETH each, ${half} ETH rolled over.`,
      jackpotDelta: POT / 2,
    };
  }
  if (c1 === "STEAL" && c2 === "STEAL") {
    return {
      result: "Double rug. Whole pot rolled back into the jackpot.",
      jackpotDelta: POT,
    };
  }
  return {
    result: `Rug! Stealer took ${half} ETH. Splitter got nothing.`,
    jackpotDelta: POT / 2,
  };
}

export class DemoEngine {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.jackpot = 12 + Math.random() * 0.9;
    this.nextGameId = 43;
    this.games = new Map(); // id -> game
    this.recent = []; // last resolved games, newest first
    this.timers = [];
  }

  start() {
    // Stagger two concurrent game lanes so something is always live.
    this.spawnGame();
    this.timers.push(setTimeout(() => this.spawnGame(), 25_000 + Math.random() * 10_000));
    // Fee ticks feed the jackpot.
    const feeTick = () => {
      const inc = 0.01 + Math.random() * 0.09;
      this.bumpJackpot(inc, "fees");
      this.timers.push(setTimeout(feeTick, 8_000 + Math.random() * 7_000));
    };
    this.timers.push(setTimeout(feeTick, 6_000));
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  bumpJackpot(delta, reason) {
    this.jackpot += delta;
    this.broadcast({
      type: "jackpot_update",
      jackpot: +this.jackpot.toFixed(4),
      delta: +delta.toFixed(4),
      reason,
    });
  }

  spawnGame() {
    const id = this.nextGameId++;
    const game = {
      id,
      tier: "The Room",
      p1: maskedWallet(),
      p2: maskedWallet(),
      pot: POT,
      phase: "commit",
      phaseEndsAt: Date.now() + COMMIT_MS,
    };
    this.games.set(id, game);
    this.broadcast({ type: "game_started", game });

    this.timers.push(setTimeout(() => {
      game.phase = "reveal";
      game.phaseEndsAt = Date.now() + REVEAL_MS;
      this.broadcast({ type: "phase_change", gameId: id, phase: "reveal", phaseEndsAt: game.phaseEndsAt });

      this.timers.push(setTimeout(() => this.resolveGame(id), REVEAL_MS));
    }, COMMIT_MS));
  }

  resolveGame(id) {
    const game = this.games.get(id);
    if (!game) return;
    const [c1, c2] = pickOutcome();
    const { result, jackpotDelta } = resolveText(c1, c2);
    const resolved = {
      type: "game_resolved",
      gameId: id,
      tier: game.tier,
      p1: game.p1,
      p2: game.p2,
      c1,
      c2,
      pot: POT,
      result,
      jackpotDelta,
    };
    this.games.delete(id);
    this.recent.unshift({ id, tier: game.tier, p1: game.p1, p2: game.p2, c1, c2, result });
    if (this.recent.length > 10) this.recent.pop();
    this.broadcast(resolved);
    if (jackpotDelta > 0) {
      const reason = c1 === "STEAL" && c2 === "STEAL" ? "double_rug" : "rollover";
      this.bumpJackpot(jackpotDelta, reason);
    }
    // Queue the next game in this lane after a short breather.
    this.timers.push(setTimeout(() => this.spawnGame(), RESULT_LINGER_MS + Math.random() * 8_000));
  }

  snapshot() {
    return {
      jackpot: +this.jackpot.toFixed(4),
      games: [...this.games.values()],
      recent: this.recent,
    };
  }
}

// Real mode stub: a future onchain indexer implements the same interface
// (start, stop, snapshot) and emits identical event shapes.
export class RealEngine {
  constructor(broadcast) {
    this.broadcast = broadcast;
  }
  start() {
    console.log("RealEngine: onchain indexer not implemented yet");
  }
  stop() {}
  snapshot() {
    return { jackpot: null, games: [], recent: [] };
  }
}
