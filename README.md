# Split or Steal (Hug or Rug)

A free-entry onchain game show for the Robinhood (RH) chain. Two players face off. Hug (split) to share the pot, rug (steal) to try to take it. The jackpot is funded entirely by the $SoS token trading fee wallet, so players never stake anything.

## Architecture

```
split-or-steal/
├── contracts-hh/     Hardhat project: SplitOrSteal.sol + tests + deploy script
└── web/              Next.js 14 app: lobby, game screen, spectator views (wagmi + viem)
```

### Contract (`contracts-hh/contracts/SplitOrSteal.sol`)

One contract, many rooms. Each room is a parameterized instance:

| Room param | Meaning |
|---|---|
| `minHold` | Minimum $SoS balance to enter (holding check, tokens never spent) |
| `roundPotSize` | Native amount allocated from the jackpot per round |
| `cooldownSecs` | Per-wallet cooldown between games in that room |
| `enabled` | Room on/off switch |

Adding a tier (bronze / silver / gold) is a single `createRoom` config transaction. No redeploy. Suggested tiers: bronze 0.05% of supply and a small pot, silver 0.25% mid, gold 1% big. All owner-updatable via `updateRoom`.

Global anti-farm knobs (owner-updatable): `maxGamesPerPeriod` + `periodSecs` cap how many games can start per hour so the fee-funded jackpot drains at a bounded rate.

### Game flow

1. `joinQueue(roomId)`: free entry. Checks $SoS holding, cooldown, entry cap. Second joiner starts the game and the round pot is carved out of the jackpot.
2. Commit phase (default 120s): each player calls `commit(gameId, keccak256(choice, salt, address))`. Choices stay hidden.
3. Reveal phase (default 300s, generous for laggy players): `reveal(gameId, choice, salt)`.
4. Settle:

| Outcome | Payout |
|---|---|
| Both SPLIT | Quarter of the pot each; half rolls back to the jackpot |
| STEAL vs SPLIT | Stealer gets half the pot; splitter gets nothing; rest rolls over |
| Both STEAL | Nobody paid; whole pot rolls over |
| AFK (no commit or no reveal) | Counted as SPLIT for the outcome but disqualified from payout |

The jackpot always stays funded: every rollover goes back in.

### Web app (`web/`)

Next.js 14 app router, wagmi + viem, dark game-show UI. Wallet connect via injected connector against a placeholder RH chain definition. When `NEXT_PUBLIC_SOS_CONTRACT` is unset the app runs in DEMO MODE with mock jackpot, rooms, live games, and a simulated commit/reveal game loop, so the site is fully demo-able before anything is deployed. Identities and choices are masked until reveal.

## Placeholders (fill at launch)

| Placeholder | Where | Notes |
|---|---|---|
| $SoS token address | contract constructor / `setToken`, `NEXT_PUBLIC_SOS_TOKEN` | Token not launched yet |
| Contract address | `NEXT_PUBLIC_SOS_CONTRACT` | Unset = demo mode |
| RH chain RPC + chainId | `RH_RPC_URL`, `RH_CHAIN_ID`, `NEXT_PUBLIC_RH_RPC_URL`, `NEXT_PUBLIC_RH_CHAIN_ID` | Placeholder values in config |
| Fee funder (tax wallet) | anyone can `fundJackpot()` or plain send | Point the token tax wallet at the contract |

## Development

```bash
# contracts
cd contracts-hh && npm i && npx hardhat test

# web
cd web && npm i && npm run dev
```

## Deploy contract (later, RH chain)

```bash
cd contracts-hh
RH_RPC_URL=... RH_CHAIN_ID=... DEPLOYER_KEY=... SOS_TOKEN=0x... \
  npx hardhat run scripts/deploy.js --network robinhood
```

## Launch checklist

1. Launch $SoS on pons / flap.sh with a 3% trading tax.
2. Deploy `SplitOrSteal` to RH chain with the $SoS token address (or set later via `setToken`).
3. Point the token tax wallet at the contract (`fundJackpot` or direct transfer).
4. `createRoom` for each tier with real `minHold` values based on final supply.
5. Set `NEXT_PUBLIC_SOS_CONTRACT`, `NEXT_PUBLIC_SOS_TOKEN`, `NEXT_PUBLIC_RH_RPC_URL`, `NEXT_PUBLIC_RH_CHAIN_ID` in Vercel and redeploy.
6. Tune `maxGamesPerPeriod` / `periodSecs` to the fee inflow rate.

## Security notes

- Free entry means no player funds at risk; the only funds are the fee-funded jackpot.
- Commit-reveal binds choice to salt and address, so commits cannot be replayed across players.
- Payout transfers that fail (weird receiver contracts) fall back to the jackpot instead of reverting settlement.
- `ownerWithdraw` exists as an escape hatch since the jackpot is house money, not player stakes.
