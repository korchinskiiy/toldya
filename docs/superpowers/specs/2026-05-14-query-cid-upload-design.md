# Frontend: upload market query as CID

Status: approved
Date: 2026-05-14
Scope: `frontend/` only (oracle off-chain bot rewire is a separate spec)

## Problem

`ToldyaHub.createMarket` takes a single `string queryCid` — a content-addressed
pointer to the market's question and resolution criteria. The frontend instead
passes two raw strings (`question`, `criteria`) using a 9-argument ABI that no
longer matches the on-chain 8-argument function. The call would target a
non-existent function selector. Market creation is broken from the UI today.

## Goal

Make the frontend match the contract: upload the human-authored question and
criteria as a small JSON payload to Vercel Blob, then pass the resulting public
URL as `queryCid`. Reuse the same content-addressing pattern the evidence
upload route already uses.

Non-goal (called out explicitly so a future reader doesn't fold it in):

- Rewiring the oracle off-chain bot in `oracle/` to listen for the new
  `ResolutionRequested(uint256 indexed marketId, uint256 indexed oracleRequestId, string queryCid)`
  event and write outcomes to Veto. That bot is also broken but lives in its
  own service and gets its own spec.

## Architecture

```
                       ┌─────────────────────┐
   Create market ─────▶│ /api/upload-query   │── put() ──▶ Vercel Blob
   ({question,                                              query/<sha24>.json
     criteria})        └─────────────────────┘                    │
                                  │                               │
                                  ▼ {url}                         │
   writeContract.createMarket(url, deadline, side, ...)           │
                                  │                               │
                                  ▼                               │
                            ToldyaHub (stores url as queryCid)    │
                                                                  │
   Render market list ───── fetch(url) ─────────────────────▶ ────┘
   (display Q + criteria)
```

Two changes, one path: a new JSON-only upload route, and a fixed ABI/call-site.

## Components

### 1. `POST /api/upload-query` (new route)

File: `frontend/src/app/api/upload-query/route.ts`. Mirrors
[`frontend/src/app/api/upload/route.ts`](../../../frontend/src/app/api/upload/route.ts)
but:

- Accepts `application/json` body, not multipart.
- Validates against a small schema (see Payload below). Reject empty/oversized
  payloads (limit: 64 KB — generous for any reasonable Q+criteria).
- Computes sha256 of the canonical JSON bytes; uses the first 24 hex chars as
  the filename prefix. Identical payloads dedupe.
- Calls `put('query/<hash24>.json', body, {access: 'public',
  contentType: 'application/json', addRandomSuffix: false,
  allowOverwrite: true})`.
- Returns `{ url, hash }`.
- Same `BLOB_READ_WRITE_TOKEN` env guard as the evidence route.

Reason for a separate route rather than extending the existing one: the
evidence route is a multipart file handler with image/video MIME maps. Forcing
JSON into it muddies the contract. Two small routes are clearer than one
overloaded one.

### 2. Query payload schema (v1)

```json
{
  "version": 1,
  "question": "string, 1..280 chars",
  "criteria": "string, 1..2000 chars",
  "createdAt": "unix seconds, integer"
}
```

- `version` is present so a v2 payload can add fields (media hints, preferred
  resolution sources, etc.) without changing the on-chain ABI.
- Length caps are server-enforced. They are generous; tightening can be done
  later without breaking older payloads (older payloads remain valid forever
  because the URL is immutable).
- Canonical JSON encoding: object key order is `version, question, criteria,
  createdAt`. The route builds the JSON itself from validated fields rather
  than echoing the request body, so the hash is stable regardless of client
  formatting.

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

1. Stage: "Uploading question (1/3)" → POST `/api/upload-query` with
   `{version: 1, question, criteria, createdAt: Math.floor(Date.now()/1000)}`.
   If the response is not OK, surface the error and abort.
2. Stage: "Approving TAIKO (2/3)" → existing ERC20 approval check.
3. Stage: "Creating market (3/3)" → `writeContractAsync` with the 8-arg
   payload, first arg = the URL returned in step 1.

### 5. Reading market questions in the UI

When listing markets the frontend has `queryCid` (a URL) but not the question
text. Add a small fetcher in `frontend/src/lib/`:

- In-memory map keyed by URL (immutable content, so no invalidation needed).
- On first access, `fetch(url)` → parse `{version, question, criteria}`.
- Returns `{question, criteria}` or `null` on failure.
- Callers (the market list / detail views) treat `null` as "couldn't load" and
  render a truncated URL placeholder so the row never breaks.
- Vercel Blob serves `Cache-Control: public, max-age=31536000, immutable` by
  default, so browser cache and CDN both help on revisit.

## Error handling

| Failure | UI behavior |
|---|---|
| Upload route 4xx (validation) | Show the route's error message in the create-market form; do not advance to approval or contract call. |
| Upload route 5xx / network | Show "Couldn't upload question, try again"; leave form filled so user can retry. |
| `writeContract` revert (e.g. `EmptyQueryCid`, `InvalidDeadline`) | Existing `friendlyError(e, "failed")` path; no change. |
| Market-list fetch of an old market's `queryCid` fails | Render truncated URL placeholder; mark row as "question unavailable"; rest of the row (pools, deadline, status) still renders. |
| Stored `queryCid` is not a parseable URL (defense-in-depth for legacy/manual inserts) | Treat same as fetch failure: render the raw string truncated. |

## Testing

- **Unit (route)**: validation rejects empty fields, oversized payloads,
  malformed JSON; valid payload returns deterministic hash for identical
  input.
- **Unit (fetcher)**: in-memory cache returns same object on second call
  without re-fetching; null on fetch failure; null on schema mismatch.
- **Integration (manual, gated on BLOB_READ_WRITE_TOKEN)**: create-market form
  end-to-end on Taiko Hoodi; verify `MarketCreated` event's `queryCid` matches
  what the route returned; verify the list view renders the question after
  reload.

## Migration

No on-chain migration. The contract already takes `string queryCid`. Any
markets created before this change (where the broken frontend somehow
succeeded — it didn't, but defensively) would simply fail the URL parse in the
fetcher and show the placeholder.

## Risks

- **Single point of failure on Vercel Blob.** If a `queryCid` URL returns 404
  permanently, that market's question is unrecoverable from on-chain data
  alone. Mitigation: content-addressed paths make manual re-upload of the
  same JSON produce the same URL, so a payload archived elsewhere can be
  restored. We are not building that archival in this spec.
- **JSON schema drift.** Adding a v2 someday requires the fetcher to handle
  unknown `version` values. The v1 fetcher should accept any payload whose
  `version >= 1` and read fields it understands, ignoring extras.

## Out of scope (do not touch in this PR)

- `oracle/src/index.ts` event subscription and `resolveMarket` call. These are
  stale and will be addressed in a follow-up spec.
- Contract changes. The contract is the source of truth here; everything else
  conforms to it.
- Adding non-indexed `question`/`criteria` event params (option C from the
  brainstorm). Reserved as a future enhancement if per-row fetches prove too
  slow at scale.
