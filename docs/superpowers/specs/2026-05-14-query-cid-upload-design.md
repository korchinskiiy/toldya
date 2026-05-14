# Frontend: upload market query as CID

Status: approved (revised 2026-05-14: switched off-chain store from Vercel Blob to Pinata IPFS)
Date: 2026-05-14
Scope: `frontend/` only (oracle off-chain bot rewire is a separate spec)

## Problem

`ToldyaHub.createMarket` takes a single `string queryCid` — a content-addressed
pointer to the market's question and resolution criteria. The frontend instead
passes two raw strings (`question`, `criteria`) using a 9-argument ABI that no
longer matches the on-chain 8-argument function. The call would target a
non-existent function selector. Market creation is broken from the UI today.

## Goal

Make the frontend match the contract: pin the human-authored question and
criteria as a small JSON payload to **Pinata (IPFS)**, then pass the resulting
public gateway URL as `queryCid`. The `queryCid` name finally reflects reality
— an actual IPFS CID embedded in the URL.

Non-goal (called out explicitly so a future reader doesn't fold it in):

- Rewiring the oracle off-chain bot in `oracle/` to listen for the new
  `ResolutionRequested(uint256 indexed marketId, uint256 indexed oracleRequestId, string queryCid)`
  event and write outcomes to Veto. That bot is also broken but lives in its
  own service and gets its own spec.
- Migrating `/api/upload` (evidence uploads) from Vercel Blob to Pinata.
  Evidence stays on Vercel Blob in this PR. Migrating it is mechanically
  similar but adds scope; future spec.

## Architecture

```
                       ┌─────────────────────┐
   Create market ─────▶│ /api/upload-query   │── pinJSON ─▶ Pinata IPFS
   ({question,                                              ipfs://<cid>
     criteria})        └─────────────────────┘                    │
                                  │                               │
                                  ▼ {url, cid}                    │
   writeContract.createMarket(url, deadline, side, ...)           │
                                  │                               │
                                  ▼                               │
                            ToldyaHub (stores url as queryCid)    │
                                                                  │
   Render market list ───── fetch(url) ──────── gateway ─────▶ ───┘
   (display Q + criteria)
```

`url` is a Pinata gateway URL of the form
`https://<gateway>/ipfs/<cid>` (configurable gateway, defaults to
`gateway.pinata.cloud`). Storing the gateway URL on-chain rather than a raw
`ipfs://` URI means the frontend can `fetch(url)` directly — no IPFS client
needed in the browser. The CID is still in the URL, so anyone who wants to
route around the gateway can.

## Components

### 1. `POST /api/upload-query` (new route)

File: `frontend/src/app/api/upload-query/route.ts`. Twin of
[`frontend/src/app/api/upload/route.ts`](../../../frontend/src/app/api/upload/route.ts)
but JSON-only and pinning to Pinata instead of Vercel Blob:

- Accepts `application/json` body, not multipart.
- Validates against the v1 schema (see Payload below). Reject empty/oversized
  payloads (limit: 64 KB — generous for any reasonable Q+criteria).
- Builds a canonical JSON body from the validated fields (fixed key order, no
  whitespace) so identical inputs produce identical CIDs.
- Calls Pinata's `POST https://api.pinata.cloud/pinning/pinJSONToIPFS` with the
  canonical payload and `Authorization: Bearer ${PINATA_JWT}`. Pinata returns
  `{IpfsHash, PinSize, Timestamp}`.
- Returns `{url, cid}` where `cid` is `IpfsHash` and `url` is
  `${NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud"}/ipfs/${cid}`.
- Env guard: rejects with 500 if `PINATA_JWT` is not set.

Why REST not SDK: Pinata's SDKs are in flux (`pinata-web3` vs `@pinata/sdk`).
The single `pinJSONToIPFS` endpoint we need is stable. A plain `fetch` call
keeps the dep footprint at zero.

Why the gateway URL on-chain (not raw `ipfs://`): browsers can't natively
resolve `ipfs://`, and adding a client-side IPFS resolver is heavy. The CID is
still embedded in the URL for anyone who wants to fetch from a different
gateway.

### 2. Query payload schema (v1)

```json
{
  "version": 1,
  "question": "string, 1..280 chars",
  "criteria": "string, 1..2000 chars"
}
```

- `version` is present so a v2 payload can add fields (media hints, preferred
  resolution sources, etc.) without changing the on-chain ABI.
- No `createdAt` field. Including it would defeat content-addressing dedup —
  two users asking the same question 5 minutes apart should produce the same
  CID. The block timestamp of `MarketCreated` already records creation time.
- Length caps are server-enforced. They are generous; tightening can be done
  later without breaking older payloads (older payloads remain retrievable
  from IPFS forever).
- Canonical JSON encoding: fixed key order (`version, question, criteria`),
  no whitespace. The route builds the JSON itself from validated fields
  rather than echoing the request body, so the CID is stable regardless of
  client formatting.

### 3. Frontend ABI fix

File: `frontend/src/lib/contracts.ts`.

`hubAbi.createMarket.inputs` becomes the 8-arg shape that matches
[`contracts/src/ToldyaHub.sol:305`](../../../contracts/src/ToldyaHub.sol):

```ts
inputs: [
    {name: "queryCid", type: "string"},
    {name: "deadline", type: "uint64"},
    {name: "side", type: "uint8"},
    {name: "amount", type: "uint256"},
    {name: "oracleEnabled", type: "bool"},
    {name: "mode", type: "uint8"},
    {name: "minStakers", type: "uint8"},
    {name: "allowedStakers_", type: "address[]"},
],
```

Event ABIs in `frontend/src/lib/events.ts` (and any inlined event signatures
elsewhere) update to:

- `MarketCreated(uint256 indexed marketId, address indexed creator, uint8 creatorSide, uint64 deadline, uint256 netStake, string queryCid)`
- `ResolutionRequested(uint256 indexed marketId, uint256 indexed oracleRequestId, string queryCid)`

These match
[`contracts/src/ToldyaHub.sol:182-197`](../../../contracts/src/ToldyaHub.sol).

`hubAbi.getMarket.outputs[0].components` also drifts: drop `question` and
`criteria`, replace with `{name: "queryCid", type: "string"}` and add
`{name: "oracleRequestId", type: "uint256"}` between `isPublic` and `yesPool`,
matching the `Market` struct order in
[`contracts/src/ToldyaHub.sol:114-134`](../../../contracts/src/ToldyaHub.sol).
The few call sites that currently read `.question` off the `getMarket` result
(e.g. `frontend/src/lib/events.ts:163`) switch to reading `.queryCid` and
resolving it through the fetcher in §5.

### 4. Create-market submit handler

File: `frontend/src/app/page.tsx`, around the existing `createMarket`
`writeContractAsync` call (currently near line 455).

Sequence becomes:

1. Stage: "Pinning question (1/3)" → POST `/api/upload-query` with
   `{question, criteria}`. If the response is not OK, surface the error and
   abort.
2. Stage: "Approving TAIKO (2/3)" → existing ERC20 approval check.
3. Stage: "Creating market (3/3)" → `writeContractAsync` with the 8-arg
   payload, first arg = the gateway `url` returned in step 1.

### 5. Reading market questions in the UI

When listing markets the frontend has `queryCid` (a gateway URL) but not the
question text. Add a small fetcher in `frontend/src/lib/`:

- In-memory map keyed by URL (immutable content, so no invalidation needed).
- On first access, `fetch(url)` → parse `{version, question, criteria}`.
- Returns the parsed payload or `null` on failure.
- Callers (the market list / detail views) treat `null` as "couldn't load" and
  render an empty/placeholder so the row never breaks.
- Pinata gateways set long cache headers, so browser cache and CDN help on
  revisit even without our in-memory cache.

### 6. Environment variables

Add to `frontend/.env.example`:

```
# Pinata IPFS — used to pin market question payloads.
# Generate a JWT with `pinFileToIPFS` permission at https://app.pinata.cloud/keys
PINATA_JWT=

# Optional. Defaults to https://gateway.pinata.cloud. Set to your dedicated
# Pinata gateway domain (e.g. https://<subdomain>.mypinata.cloud) for higher
# rate limits.
NEXT_PUBLIC_PINATA_GATEWAY=
```

`PINATA_JWT` is server-only (route uses it as a Bearer token). The gateway
URL is public (it ends up on-chain as part of `queryCid`).

## Error handling

| Failure | UI behavior |
|---|---|
| Upload route 4xx (validation) | Show the route's error message in the create-market form; do not advance to approval or contract call. |
| Upload route 5xx / network / Pinata down | Show "Couldn't pin question, try again"; leave form filled so user can retry. |
| `writeContract` revert (e.g. `EmptyQueryCid`, `InvalidDeadline`) | Existing `friendlyError(e, "failed")` path; no change. |
| Market-list fetch of a market's `queryCid` fails (gateway 5xx, CID not pinned) | Render placeholder; mark row as "question unavailable"; rest of the row (pools, deadline, status) still renders. |
| Stored `queryCid` is not a parseable URL (defense-in-depth for legacy/manual inserts) | Treat same as fetch failure: render placeholder. |

## Testing

- **Unit (route)**: validation rejects empty fields, oversized payloads,
  malformed JSON; valid payload produces a stable canonical JSON body for
  identical input.
- **Unit (fetcher)**: in-memory cache returns same object on second call
  without re-fetching; null on fetch failure; null on schema mismatch.
- **Integration (manual, gated on PINATA_JWT)**: create-market form
  end-to-end on Taiko Hoodi; verify `MarketCreated` event's `queryCid` is a
  Pinata gateway URL whose CID resolves to the JSON we submitted; verify the
  list view renders the question after reload.

## Migration

No on-chain migration. The contract already takes `string queryCid`. Any
markets created before this change (none in practice — the broken frontend
hasn't successfully called `createMarket`) would simply fail URL parse in the
fetcher and show the placeholder.

## Risks

- **Pinata dependency.** A `queryCid` URL goes through Pinata's gateway. If
  Pinata is down (gateway or pinning service), market creation fails and
  existing markets can't render their question via the default URL.
  Mitigation today: the CID is in the URL — anyone can swap the gateway host
  for `ipfs.io` or `cloudflare-ipfs.com` and retrieve the same content (we do
  not currently fall back automatically in the fetcher; that's a future
  enhancement). Pinned content remains available across gateways as long as
  *some* node has it.
- **JSON schema drift.** Adding a v2 someday requires the fetcher to handle
  unknown `version` values. The v1 fetcher accepts any payload whose
  `version >= 1` and reads fields it understands, ignoring extras.
- **PINATA_JWT leak.** The JWT lives server-side only (route handler uses it
  via Bearer header). It must not be prefixed `NEXT_PUBLIC_`.

## Out of scope (do not touch in this PR)

- `oracle/src/index.ts` event subscription and `resolveMarket` call. These are
  stale and will be addressed in a follow-up spec.
- Migrating `/api/upload` (evidence uploads) from Vercel Blob to Pinata.
  Mechanically similar but adds scope; future spec if the project standardises
  on IPFS for all off-chain blobs.
- Contract changes. The contract is the source of truth here; everything else
  conforms to it.
- Adding non-indexed `question`/`criteria` event params (option C from the
  brainstorm). Reserved as a future enhancement if per-row fetches prove too
  slow at scale.
- Multi-gateway fallback in the fetcher. Reserved for a future enhancement;
  start with the configured gateway only.
