// Demo data used when no contract address is configured.
export const DEMO_JACKPOT = "12.47";

export const DEMO_ROOMS = [
  { id: 0, tier: "Bronze", minHoldPct: "0.05%", pot: "0.25 ETH", cooldown: "10 min", cls: "tier-bronze" },
  { id: 1, tier: "Silver", minHoldPct: "0.25%", pot: "1.0 ETH", cooldown: "30 min", cls: "tier-silver" },
  { id: 2, tier: "Gold", minHoldPct: "1%", pot: "4.0 ETH", cooldown: "60 min", cls: "tier-gold" },
];

export const DEMO_LIVE_GAMES = [
  { id: 42, tier: "Gold", p1: "0x7a3f...c291", p2: "0x1bd0...88ee", phase: "Reveal", secsLeft: 187, c1: null, c2: null },
  { id: 41, tier: "Bronze", p1: "0x92cc...41af", p2: "0xe310...0b77", phase: "Commit", secsLeft: 64, c1: null, c2: null },
];

export const DEMO_PAST_GAMES = [
  { id: 40, tier: "Silver", p1: "0x5e21...9d03", p2: "0xba77...e2c4", c1: "SPLIT", c2: "SPLIT", result: "Both hugged. 0.25 ETH each, 0.5 ETH rolled over." },
  { id: 39, tier: "Gold", p1: "0x03fa...77b1", p2: "0xcd19...3350", c1: "STEAL", c2: "SPLIT", result: "Rug! Stealer took 2.0 ETH. Splitter got nothing." },
  { id: 38, tier: "Bronze", p1: "0x88e4...12dc", p2: "0x467b...9aa0", c1: "STEAL", c2: "STEAL", result: "Double rug. Whole pot rolled back into the jackpot." },
  { id: 37, tier: "Bronze", p1: "0xf00d...cafe", p2: "0xdead...beef", c1: "SPLIT", c2: "AFK", result: "AFK player disqualified. Active splitter paid 0.0625 ETH." },
];
