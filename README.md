# toldya

P2P prediction markets for **everyday bets between friends**.

> Rob bets Tom 10 TAIKO that Tom can't finish a beer in 30 seconds. They open a
> market, both stake, the deadline hits, Veto settles the oracle request, and
> the winner takes the pot.

Toldya is intentionally smaller than centralized prediction markets: anyone can
spin up a market with no approval, unresolved markets can escalate to the
configured Veto oracle, and the economic model is a simple **escrow** — no AMM,
no shares, no curves.

---

## How a market works

1. **Anyone creates a market** — posts a YES/NO question, resolution criteria,
   deadline, and an initial TAIKO stake on YES or NO.
2. **Friends stake** — anyone can deposit TAIKO into the YES or NO pool until
   the deadline. Stakes are **locked** until resolution.
3. **Deadline passes** — anyone calls `triggerResolution(marketId)`. If only
   one side has any stake, the market is **voided** immediately and refunds
   happen. Otherwise Toldya creates a Veto oracle request from the pinned
   market question CID.
4. **Veto resolves** — the Veto answerer/judge agents settle the request. Once
   Veto returns `YES` or `NO`, anyone can call `resolveMarket(marketId)` on
   Toldya. `ABSTAIN` leaves the market in `ResolutionRequested` until the
   existing 14-day stalemate timeout can void it.
5. **Winners claim** — each winner's claim is `(myStake / winningPool) * totalPot`.

A flat **1% fee** is taken on every stake (regardless of outcome) and sent to
the protocol treasury — this funds oracle gas and discourages spam markets that
never get matched.

---

## Repo layout

```
contracts/    Foundry project — ToldyaHub.sol + tests + deploy script
oracle/       Retired legacy direct oracle package
frontend/     Next.js 15 + wagmi/viem app
mobile/       Expo / React Native app
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
export ORACLE_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8                       # Veto proxy / local IOracle
export TREASURY_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                     # anvil[2]
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

The script deploys a `MockToken` (mTAIKO) and the `ToldyaHub`. Note both
addresses from the logs.

### 2. Veto oracle flow

Toldya no longer runs its own oracle signer. Deploy or configure Veto
separately, then set ToldyaHub's `ORACLE_ADDRESS` to the Veto proxy. The web
app needs `PINATA_JWT` so it can pin the Veto-compatible question payload when
users create oracle-enabled markets. In production, the pin route also requires
`ORACLE_PIN_RATE_LIMIT_REDIS_REST_URL` and
`ORACLE_PIN_RATE_LIMIT_REDIS_REST_TOKEN` for shared Upstash Redis rate limiting;
without them it fails closed before spending the Pinata credential. The mobile
app should set `EXPO_PUBLIC_ORACLE_PIN_URL` to the web app's
`/api/oracle-question` route.

Operational flow:

1. The frontend signs and pins the market question + criteria, then passes the
   resulting CID into `createMarket(..., oracleEnabled=true, oracleQueryCid)`.
2. After the market deadline, anyone calls `triggerResolution(marketId)`.
   Toldya calls `IOracle.createRequest(queryCid)` on Veto and stores the
   returned request id.
3. Run the Veto answerer/judge agents until the Veto request reaches
   `Settled`.
4. Anyone calls `resolveMarket(marketId)` on Toldya. If Veto returned `YES` or
   `NO`, Toldya resolves. If Veto returned `ABSTAIN`, the market remains
   `ResolutionRequested` until `voidStalemate(marketId)` is available after
   the existing 14-day timeout.

The `oracle/` package is a retired placeholder and exits non-zero if started.

### 3. Frontend

```bash
cd ../frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_HUB_ADDRESS and NEXT_PUBLIC_TOKEN_ADDRESS from the deploy.
# Set PINATA_JWT for oracle-enabled market creation.
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
- **External Veto oracle.** Toldya trusts the configured Veto contract for
  oracle-enabled markets. The hub owner can rotate that address, but Toldya does
  not run a direct oracle signer anymore.
- **No on-chain dispute path inside Toldya.** If Veto settles incorrectly,
  Toldya has no independent dispute mechanism — fine for friends-mode, not fine
  for high-stakes markets.

## License

MIT
