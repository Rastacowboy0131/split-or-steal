// Demo data used when no contract address is configured.
export const DEMO_JACKPOT = "12.47";

// v1 launches with a single room; more tiers can be enabled later via createRoom (no redeploy).
export const DEMO_ROOMS = [
  { id: 0, tier: "The Room", minHoldPct: "0.1%", pot: "0.5 ETH", cooldown: "15 min", cls: "tier-gold" },
];

export const DEMO_LIVE_GAMES = [
  { id: 42, tier: "The Room", p1: "0x7a3f...c291", p2: "0x1bd0...88ee", phase: "Reveal", secsLeft: 187, c1: null, c2: null },
  { id: 41, tier: "The Room", p1: "0x92cc...41af", p2: "0xe310...0b77", phase: "Commit", secsLeft: 64, c1: null, c2: null },
];

// Ambient events streamed under the jackpot in demo mode.
export const DEMO_TICKER_EVENTS = [
  { text: "double rug fed the pot +0.5 ETH", cls: "rug" },
  { text: "+0.05 ETH from fees", cls: "fee" },
  { text: "rollover from game #38 +0.25 ETH", cls: "roll" },
  { text: "+0.03 ETH from fees", cls: "fee" },
  { text: "AFK forfeit rolled +0.125 ETH into the pot", cls: "roll" },
  { text: "+0.08 ETH from fees", cls: "fee" },
  { text: "both hugged, half the pot rolled back +0.25 ETH", cls: "roll" },
];

export const DEMO_PAST_GAMES = [
  { id: 40, tier: "The Room", p1: "0x5e21...9d03", p2: "0xba77...e2c4", c1: "SPLIT", c2: "SPLIT", result: "Both hugged. 0.125 ETH each, 0.25 ETH rolled over." },
  { id: 39, tier: "The Room", p1: "0x03fa...77b1", p2: "0xcd19...3350", c1: "STEAL", c2: "SPLIT", result: "Rug! Stealer took 0.25 ETH. Splitter got nothing." },
  { id: 38, tier: "The Room", p1: "0x88e4...12dc", p2: "0x467b...9aa0", c1: "STEAL", c2: "STEAL", result: "Double rug. Whole pot rolled back into the jackpot." },
  { id: 37, tier: "The Room", p1: "0xf00d...cafe", p2: "0xdead...beef", c1: "SPLIT", c2: "AFK", result: "AFK player disqualified. Active splitter paid 0.125 ETH." },
];
