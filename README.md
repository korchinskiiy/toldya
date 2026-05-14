# toldya

P2P prediction markets for **everyday bets between friends**.

> Rob bets Tom 10 TAIKO that Tom can't finish a beer in 30 seconds. They open a
> market, both stake, the deadline hits, an AI agent reads the criteria + any
> evidence, posts the verdict on-chain, and the winner takes the pot.

Toldya is intentionally smaller than centralized prediction markets: anyone can
spin up a market with no approval, the resolution is handled by an AI oracle
service against the criteria the creator wrote, and the economic model is a
simple **escrow** — no AMM, no shares, no curves.

---

## How a market works

1. **Anyone creates a market** — posts a YES/NO question, resolution criteria,
   deadline, and an initial TAIKO stake on YES or NO.
2. **Friends stake** — anyone can deposit TAIKO into the YES or NO pool until
   the deadline. Stakes are **locked** until resolution.
3. **Deadline passes** — anyone calls `triggerResolution(marketId)`, which
   emits an event the AI oracle service listens for. If only one side has any
   stake, the market is **voided** immediately and refunds happen.
4. **AI agent resolves** — reads question + criteria, evaluates, posts
   `RESULT:YES` or `RESULT:NO` back on-chain via `resolveMarket(...)`.
5. **Winners claim** — each winner's claim is `(myStake / winningPool) * totalPot`.

A flat **1% fee** is taken on every stake (regardless of outcome) and sent to
the protocol treasury — this funds oracle gas and discourages spam markets that
never get matched.

---

## Repo layout

```
contracts/    Foundry project — ToldyaHub.sol + tests + deploy script
oracle/       Node + TypeScript service that watches events and calls Claude
frontend/     Next.js 15 + wagmi/viem app
```

---

## Local dev

### 1. Contracts

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge build
forge test -vv
```

To deploy locally:

```bash
anvil &                       # in another terminal
export DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil[0]
export ORACLE_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8                       # anvil[1]
export TREASURY_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                     # anvil[2]
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

The script deploys a `MockToken` (mTAIKO) and the `ToldyaHub`. Note both
addresses from the logs.

### 2. Oracle service

```bash
cd ../oracle
cp .env.example .env
# Fill in:
#   RPC_URL              (http://localhost:8545 for anvil)
#   HUB_ADDRESS          (from the deploy script output)
#   ORACLE_PRIVATE_KEY   (must match ORACLE_ADDRESS used at deploy time)
#   ANTHROPIC_API_KEY    (your Anthropic key)
npm install
npm run dev
```

The oracle subscribes to `ResolutionRequested` events. When one fires it asks
Claude to read the market's question + criteria, parses `RESULT:YES`/`RESULT:NO`
from the response, and submits `resolveMarket(marketId, yesWon)`.

### 3. Frontend

```bash
cd ../frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_HUB_ADDRESS and NEXT_PUBLIC_TOKEN_ADDRESS from the deploy.
npm install
npm run dev
```

Open http://localhost:3000.

---

## Why escrow, not an AMM?

Polymarket-style markets use AMMs because they need continuous price discovery
across thousands of traders. Toldya is for **friend-scale** markets — usually
2 to 10 participants betting tens of dollars on whether someone is going to
chug a beer. An AMM there would be all overhead and no signal: the "price"
would jump wildly with every stake. A pari-mutuel escrow gives the same
expected payout, with simpler contracts (~250 lines) and zero LP risk for the
creator.

## What's intentionally **not** in v1

- **No early withdrawals.** Once you stake, you're committed until resolution.
  Backing out would defeat the point of a friend bet.
- **No share trading.** You can stake more on either side, but you can't sell
  your position to someone else.
- **Single permissioned oracle.** One off-chain agent (the address set as
  `oracle` on the hub) is trusted to post results. The interface is designed so
  this can be swapped for an N-of-M agent committee or an optimistic
  dispute-window oracle later.
- **No on-chain dispute path.** If the AI gets it wrong, the only remedy is the
  hub owner replacing the oracle address — fine for friends-mode, not fine for
  high-stakes markets.

## Legal

- [`TERMS.md`](./TERMS.md) — Terms of Service
- [`COMPLIANCE.md`](./COMPLIANCE.md) — Operator compliance obligations
- [`SECURITY.md`](./SECURITY.md) — Vulnerability reporting
- [`docs/risk-disclosure.md`](./docs/risk-disclosure.md) — Risk disclosure
- [`docs/privacy-policy.md`](./docs/privacy-policy.md) — Privacy Policy (GDPR/CCPA)

## License

MIT — see [`LICENSE`](./LICENSE).
