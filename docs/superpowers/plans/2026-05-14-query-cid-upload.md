# Frontend Query-CID Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the contract↔frontend ABI drift in `createMarket` by uploading question+criteria as a content-addressed JSON blob and passing the URL as `queryCid`. Cover both the write path (create market) and the read path (list/render markets).

**Architecture:** A new `POST /api/upload-query` route writes JSON to Vercel Blob using sha256-prefix paths (mirror of the existing evidence upload). A shared `lib/queryPayload.ts` module owns the schema, the canonical-encoder/hasher, and a cached client-side fetcher. The `createMarket` and `getMarket` ABIs and their call sites are realigned to the on-chain shape. Existing JSX (`market.question`, `market.criteria`) keeps working because the list fetcher populates those fields by resolving each market's `queryCid` URL.

**Tech Stack:** Next.js 15 (App Router, nodejs runtime), TypeScript 5, viem 2, `@vercel/blob` v2, Web Crypto for hashing.

**Spec:** [`docs/superpowers/specs/2026-05-14-query-cid-upload-design.md`](../specs/2026-05-14-query-cid-upload-design.md)

**Testing note:** the `frontend/` package has no test runner today (`package.json` exposes only `typecheck` and `next build`). Adding one is its own project. Instead of stubbing unit tests, this plan substitutes a concrete manual verification protocol at each commit boundary: `npm run typecheck`, `npm run build`, and (for runtime-touching tasks) a documented curl/dev-server check. If you decide to introduce Vitest later, the modules in this plan are pure enough to drop tests onto with no refactor.

**Working directory for every command:** `frontend/` unless otherwise noted.

---

## File Map

**Create:**
- `frontend/src/lib/queryPayload.ts` — shared schema, validator, canonical encoder + sha256 helper, in-memory cached URL fetcher.
- `frontend/src/app/api/upload-query/route.ts` — JSON-only upload route.

**Modify:**
- `frontend/src/lib/contracts.ts` — fix `createMarket.inputs` (8 args) and `getMarket.outputs` tuple (queryCid + oracleRequestId, drop question/criteria).
- `frontend/src/lib/events.ts` — fix `MarketCreated` event signature, switch enrichment from `getMarket(...).question` to `getMarket(...).queryCid` → fetcher.
- `frontend/src/app/page.tsx` — update `Market` type, add upload step to create-market submit handler, switch market-list fetch to resolve `queryCid` through the fetcher and synthesize `question`/`criteria` onto each row.

---

## Task 1: Shared queryPayload module

**Files:**
- Create: `frontend/src/lib/queryPayload.ts`

- [ ] **Step 1: Create the module**

Create `frontend/src/lib/queryPayload.ts` with this exact content:

```typescript
// Shared schema, canonical encoder, hasher, and cached fetcher for the
// off-chain JSON payload referenced by ToldyaHub's `queryCid`.

export const QUERY_PAYLOAD_VERSION = 1;

// Length caps are generous on purpose. Tightening can be done later without
// breaking older payloads — URLs are immutable, so an older payload remains
// retrievable forever even if the validator gets stricter.
export const QUESTION_MAX = 280;
export const CRITERIA_MAX = 2000;

// Server-side body size limit. 64 KB is far above anything legitimate (a
// 2000-char criteria + 280-char question + JSON overhead is < 3 KB).
export const MAX_BODY_BYTES = 64 * 1024;

export type QueryPayloadV1 = {
    version: 1;
    question: string;
    criteria: string;
    createdAt: number;
};

export type ValidatedInput = {
    question: string;
    criteria: string;
};

export type ValidationResult =
    | {ok: true; value: ValidatedInput}
    | {ok: false; error: string};

export function validateInput(raw: unknown): ValidationResult {
    if (typeof raw !== "object" || raw === null) {
        return {ok: false, error: "body must be a JSON object"};
    }
    const obj = raw as Record<string, unknown>;
    const question = obj.question;
    const criteria = obj.criteria;
    if (typeof question !== "string" || question.length === 0) {
        return {ok: false, error: "question is required"};
    }
    if (typeof criteria !== "string" || criteria.length === 0) {
        return {ok: false, error: "criteria is required"};
    }
    if (question.length > QUESTION_MAX) {
        return {ok: false, error: `question exceeds ${QUESTION_MAX} chars`};
    }
    if (criteria.length > CRITERIA_MAX) {
        return {ok: false, error: `criteria exceeds ${CRITERIA_MAX} chars`};
    }
    return {ok: true, value: {question, criteria}};
}

// Build the canonical JSON body the route uploads. Key order is fixed so
// identical inputs produce identical bytes regardless of how the client
// formatted its request.
export function canonicalEncode(
    input: ValidatedInput,
    createdAt: number,
): {bytes: Uint8Array; hash24: Promise<string>} {
    const payload: QueryPayloadV1 = {
        version: QUERY_PAYLOAD_VERSION,
        question: input.question,
        criteria: input.criteria,
        createdAt,
    };
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    return {bytes, hash24: sha256Hex24(bytes)};
}

export async function sha256Hex24(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hex.slice(0, 24);
}

// --- Client/server fetcher with in-memory cache --------------------------
// queryCid URLs are content-addressed and immutable, so we never invalidate.
// A failed fetch is also cached (as `null`) so we don't hammer a 404 URL on
// every re-render.

const cache = new Map<string, QueryPayloadV1 | null>();
const inFlight = new Map<string, Promise<QueryPayloadV1 | null>>();

export async function fetchQueryPayload(url: string): Promise<QueryPayloadV1 | null> {
    if (cache.has(url)) return cache.get(url) ?? null;
    const existing = inFlight.get(url);
    if (existing) return existing;

    const p = (async (): Promise<QueryPayloadV1 | null> => {
        try {
            // Defense-in-depth: legacy/manual queryCids might not be URLs.
            // Catch and treat as a fetch failure so callers render the
            // placeholder rather than crashing.
            // eslint-disable-next-line no-new
            new URL(url);
            const res = await fetch(url, {cache: "force-cache"});
            if (!res.ok) return null;
            const body = (await res.json()) as Partial<QueryPayloadV1>;
            if (
                typeof body !== "object" ||
                body === null ||
                typeof body.version !== "number" ||
                body.version < 1 ||
                typeof body.question !== "string" ||
                typeof body.criteria !== "string"
            ) {
                return null;
            }
            return {
                version: 1,
                question: body.question,
                criteria: body.criteria,
                createdAt: typeof body.createdAt === "number" ? body.createdAt : 0,
            };
        } catch {
            return null;
        }
    })();

    inFlight.set(url, p);
    const value = await p;
    inFlight.delete(url);
    cache.set(url, value);
    return value;
}

// Exposed for tests; not used in production code.
export function _resetQueryPayloadCache(): void {
    cache.clear();
    inFlight.clear();
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: clean exit (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/queryPayload.ts
git commit -m "feat(frontend): add shared query payload schema + cached fetcher"
```

---

## Task 2: /api/upload-query route

**Files:**
- Create: `frontend/src/app/api/upload-query/route.ts`

- [ ] **Step 1: Create the route**

Create `frontend/src/app/api/upload-query/route.ts` with this exact content:

```typescript
import {NextRequest, NextResponse} from "next/server";
import {put} from "@vercel/blob";
import {
    canonicalEncode,
    MAX_BODY_BYTES,
    validateInput,
} from "@/lib/queryPayload";

// JSON-only twin of /api/upload. Accepts {question, criteria}, uploads the
// canonical payload as application/json to Vercel Blob under a content-
// addressed path, returns the public URL for use as the on-chain queryCid.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
            {
                error:
                    "Blob storage is not configured. Set BLOB_READ_WRITE_TOKEN " +
                    "(enable Vercel Blob in the project Storage tab).",
            },
            {status: 500},
        );
    }

    let raw: unknown;
    try {
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) {
            return NextResponse.json(
                {error: `body exceeds ${MAX_BODY_BYTES} bytes`},
                {status: 413},
            );
        }
        raw = JSON.parse(text);
    } catch {
        return NextResponse.json({error: "invalid JSON body"}, {status: 400});
    }

    const validated = validateInput(raw);
    if (!validated.ok) {
        return NextResponse.json({error: validated.error}, {status: 400});
    }

    try {
        const createdAt = Math.floor(Date.now() / 1000);
        const {bytes, hash24} = canonicalEncode(validated.value, createdAt);
        const hash = await hash24;

        const blob = await put(`query/${hash}.json`, bytes, {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false,
            allowOverwrite: true,
        });

        return NextResponse.json({url: blob.url, hash});
    } catch (err) {
        console.error("upload-query failed:", err);
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "upload failed"},
            {status: 500},
        );
    }
}
```

- [ ] **Step 2: Typecheck and build**

```bash
npm run typecheck
npm run build
```
Expected: both clean. `next build` should list the new route as `ƒ /api/upload-query`.

- [ ] **Step 3: Local smoke test of the route**

Set `BLOB_READ_WRITE_TOKEN` in `.env.local` if not already set, then in one terminal:
```bash
npm run dev
```
In another:
```bash
curl -i -X POST http://localhost:3000/api/upload-query \
  -H 'Content-Type: application/json' \
  -d '{"question":"Will it rain?","criteria":"YES iff NWS reports rain at SFO 2026-05-15."}'
```
Expected: HTTP 200, body like `{"url":"https://...vercel-storage.../query/<24hex>.json","hash":"<24hex>"}`. Visit the URL in a browser; expected body:
```json
{"version":1,"question":"Will it rain?","criteria":"YES iff NWS reports rain at SFO 2026-05-15.","createdAt":<int>}
```

Negative checks (each must return 400, not 200):
```bash
curl -i -X POST http://localhost:3000/api/upload-query -H 'Content-Type: application/json' -d '{}'
curl -i -X POST http://localhost:3000/api/upload-query -H 'Content-Type: application/json' -d '{"question":"","criteria":"x"}'
curl -i -X POST http://localhost:3000/api/upload-query -H 'Content-Type: application/json' -d 'not json'
```

Re-run the original successful curl twice and confirm the returned `url` is **identical** both times (content-addressing dedup).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/upload-query/route.ts
git commit -m "feat(frontend): add /api/upload-query route for market questions"
```

---

## Task 3: Fix createMarket ABI + submit handler

**Files:**
- Modify: `frontend/src/lib/contracts.ts:23-40`
- Modify: `frontend/src/app/page.tsx` (create-market submit handler near line 455)

This is one task — splitting it across two commits would leave the build broken in between because the page calls the ABI inline.

- [ ] **Step 1: Update `createMarket.inputs` in `contracts.ts`**

In `frontend/src/lib/contracts.ts`, replace the existing `createMarket` entry (currently 9 inputs) with this 8-input shape:

```typescript
    {
        type: "function",
        name: "createMarket",
        stateMutability: "nonpayable",
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
        outputs: [{name: "marketId", type: "uint256"}],
    },
```

This matches [`contracts/src/ToldyaHub.sol:305`](../../../contracts/src/ToldyaHub.sol).

- [ ] **Step 2a: Insert the upload step before the approve check**

Find this existing line in the create-market submit handler (around line 434):
```typescript
            if (allowance < wei) {
                setStage("Approving TAIKO (1/2)");
```

Immediately **before** the `if (allowance < wei) {` line, insert this block:

```typescript
            setStage("Uploading question (1/3)");
            const uploadRes = await fetch("/api/upload-query", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({question, criteria}),
            });
            if (!uploadRes.ok) {
                const body = (await uploadRes.json().catch(() => ({}))) as {
                    error?: string;
                };
                throw new Error(body.error || `upload failed (${uploadRes.status})`);
            }
            const {url: queryCid} = (await uploadRes.json()) as {url: string};

```

- [ ] **Step 2b: Renumber the approve stage**

Change the existing line:
```typescript
                setStage("Approving TAIKO (1/2)");
```
to:
```typescript
                setStage("Approving TAIKO (2/3)");
```

Leave the rest of the `if (allowance < wei) { ... }` block (the `approve` writeContract, `setTx`, `waitForTransactionReceipt`) unchanged.

The `const deadlineTs = ...`, `const allowed = ...`, and `const minStakersNum = ...` computations that sit between the approve block and the createMarket call also stay unchanged.

- [ ] **Step 2c: Update the createMarket call**

Find this existing block (around line 455):
```typescript
            setStage("Creating market (2/2)");
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "createMarket",
                args: [
                    question,
                    criteria,
                    deadlineTs,
                    side,
                    wei,
                    oracleFallback,
                    mode,
                    minStakersNum,
                    allowed,
                ],
            });
```

Replace it with:
```typescript
            setStage("Creating market (3/3)");
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "createMarket",
                args: [
                    queryCid,
                    deadlineTs,
                    side,
                    wei,
                    oracleFallback,
                    mode,
                    minStakersNum,
                    allowed,
                ],
            });
```

(Two changes: stage label "2/2" → "3/3", and the `args` array drops `question, criteria` and gains `queryCid` at position 0 — total 8 args.)

The `setTx(hash)` and `await client.waitForTransactionReceipt({hash});` lines that follow stay unchanged. The existing `setStage("")` reset in the `finally` block also stays unchanged.

- [ ] **Step 3: Typecheck and build**

```bash
npm run typecheck
npm run build
```
Expected: both clean. `next build` output should still list `/api/upload-query` from Task 2.

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```
In the browser, open the create-market form. Submit a market with a real question and criteria. Verify in the dev console / network tab:
1. A POST to `/api/upload-query` happens first and returns `{url, hash}`.
2. Then the wallet prompts for approval (if needed) and then `createMarket`.
3. The `createMarket` transaction arg array length is exactly 8.
4. The tx confirms on-chain (no revert).

After confirmation, fetch the `MarketCreated` event on Hoodi via your wallet's explorer or a quick `cast logs` (RPC URL from `.env.local`):
```bash
cast logs --rpc-url "$NEXT_PUBLIC_RPC_URL" \
  --address "$NEXT_PUBLIC_HUB_ADDRESS" \
  'MarketCreated(uint256,address,uint8,uint64,uint256,string)' \
  --from-block latest --to-block latest
```
Expected: the trailing string arg is the Vercel Blob URL you saw in step 1.

(The market list will not render correctly yet — that's Task 4.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/contracts.ts frontend/src/app/page.tsx
git commit -m "feat(frontend): pack createMarket question into queryCid blob"
```

---

## Task 4: Fix getMarket ABI, Market type, events.ts, and list rendering

**Files:**
- Modify: `frontend/src/lib/contracts.ts:73-97` (`getMarket` outputs)
- Modify: `frontend/src/lib/events.ts` (event signature + enrichment)
- Modify: `frontend/src/app/page.tsx:31-45` (`Market` type) and `frontend/src/app/page.tsx:737-748` (list fetcher)

Same atomicity reasoning as Task 3: ABI, type, and call sites move together.

- [ ] **Step 1: Update `getMarket.outputs` tuple in `contracts.ts`**

Replace the existing `getMarket.outputs[0].components` array so it matches the `Market` struct in [`contracts/src/ToldyaHub.sol:114-134`](../../../contracts/src/ToldyaHub.sol):

```typescript
        outputs: [
            {
                type: "tuple",
                components: [
                    {name: "creator", type: "address"},
                    {name: "deadline", type: "uint64"},
                    {name: "status", type: "uint8"},
                    {name: "oracleEnabled", type: "bool"},
                    {name: "mode", type: "uint8"},
                    {name: "minStakers", type: "uint8"},
                    {name: "matched", type: "bool"},
                    {name: "isPublic", type: "bool"},
                    {name: "queryCid", type: "string"},
                    {name: "oracleRequestId", type: "uint256"},
                    {name: "yesPool", type: "uint256"},
                    {name: "noPool", type: "uint256"},
                ],
            },
        ],
```

- [ ] **Step 2: Update the `Market` type and list fetcher in `page.tsx`**

In `frontend/src/app/page.tsx`, replace the `Market` type definition (currently lines 31-45) with:

```typescript
type Market = {
    id: bigint;
    creator: `0x${string}`;
    deadline: bigint;
    status: number;
    oracleEnabled: boolean;
    mode: number; // 0 = Pool, 1 = Pair
    minStakers: number;
    matched: boolean;
    isPublic: boolean;
    queryCid: string;
    oracleRequestId: bigint;
    yesPool: bigint;
    noPool: bigint;
    // Resolved off-chain from queryCid. Empty string while loading or on
    // fetch failure — existing JSX renders that gracefully as a blank row.
    question: string;
    criteria: string;
};
```

Add the fetcher import near the top of the file, alongside the other lib imports:

```typescript
import {fetchQueryPayload} from "@/lib/queryPayload";
```

Replace the `Promise.all` block inside the list fetcher (currently lines 737-747) with:

```typescript
                const ids = Array.from({length: Number(next)}, (_, i) => BigInt(i));
                const fetched = await Promise.all(
                    ids.map(async (id) => {
                        const m = (await client.readContract({
                            address: HUB_ADDRESS,
                            abi: hubAbi,
                            functionName: "getMarket",
                            args: [id],
                        })) as Omit<Market, "id" | "question" | "criteria">;
                        const payload = await fetchQueryPayload(m.queryCid);
                        return {
                            ...m,
                            id,
                            question: payload?.question ?? "",
                            criteria: payload?.criteria ?? "",
                        } as Market;
                    }),
                );
                if (!cancelled) setMarkets(fetched.reverse());
```

Existing JSX at lines 812, 1138, 1199, 1216 reads `.question`/`.criteria`; no change there — empty string falls through cleanly.

- [ ] **Step 3: Update `events.ts` event signature and enrichment**

In `frontend/src/lib/events.ts`, replace the `MarketCreated` event in `eventDefs` (currently line 5-7) with:

```typescript
    MarketCreated: parseAbiItem(
        "event MarketCreated(uint256 indexed marketId, address indexed creator, uint8 creatorSide, uint64 deadline, uint256 netStake, string queryCid)",
    ),
```

(The `ResolutionRequested` and other events are not used here — leave them alone.)

Update the enrichment block (currently lines 154-179). Replace from `const [marketResults, blockResults] = await Promise.all([` through the end of the `enriched` assignment with:

```typescript
    const [marketResults, blockResults] = await Promise.all([
        Promise.all(
            marketIds.map(
                (id) =>
                    client.readContract({
                        address: HUB_ADDRESS,
                        abi: hubAbi,
                        functionName: "getMarket",
                        args: [id],
                    }) as Promise<{queryCid: string}>,
            ),
        ),
        Promise.all(blockNumbers.map((n) => client.getBlock({blockNumber: n}))),
    ]);

    const payloads = await Promise.all(
        marketResults.map((m) => fetchQueryPayload(m.queryCid)),
    );
    const questionById = new Map(
        marketIds.map((id, i) => [id, payloads[i]?.question ?? "(question unavailable)"]),
    );
    const tsByBlock = new Map(blockNumbers.map((n, i) => [n, Number(blockResults[i].timestamp)]));

    const enriched: FeedEvent[] = partial.map(
        (e) =>
            ({
                ...e,
                question: questionById.get(e.marketId) ?? "(unknown market)",
                timestamp: tsByBlock.get(e.blockNumber) ?? 0,
            }) as FeedEvent,
    );
```

Add the fetcher import at the top of `events.ts`:

```typescript
import {fetchQueryPayload} from "./queryPayload";
```

- [ ] **Step 4: Typecheck and build**

```bash
npm run typecheck
npm run build
```
Expected: both clean.

- [ ] **Step 5: Manual verification**

```bash
npm run dev
```
In the browser, with the market created in Task 4 still on-chain:
1. Reload the markets list. The question and criteria should render correctly (same text you submitted).
2. Open the network tab; you should see one GET to the `query/<hash>.json` URL per unique market. Reload again — second time should hit browser cache (`from disk cache` or `from memory cache`).
3. The activity feed should also show the question correctly.

Negative check: in dev tools, run `localStorage.clear(); location.reload()` — list still renders the question (the in-memory cache rebuilds from fetches).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/contracts.ts frontend/src/lib/events.ts frontend/src/app/page.tsx
git commit -m "feat(frontend): resolve market question via queryCid fetcher"
```

---

## Task 5: End-to-end smoke test

No code changes — verification only.

- [ ] **Step 1: Cold-start smoke**

```bash
git status   # should show clean
npm run typecheck
npm run build
```
Expected: clean.

- [ ] **Step 2: Full create + read flow**

```bash
npm run dev
```
In the browser, with a fresh tab:
1. Connect wallet, ensure you're on the chain configured in `.env.local`.
2. Open "Create market". Question: `"E2E smoke test — does this work?"`. Criteria: `"YES iff this manual test passes."` Pick Pool, deadline ~1 day out, small stake.
3. Submit. Watch stages: `Uploading question (1/3)` → `Approving TAIKO (2/3)` (if needed) → `Creating market (3/3)`.
4. After confirmation, reload the page. Verify the new market appears at the top of the list with the question and criteria rendered correctly.
5. Open the market detail view. Verify `market.question` and `market.criteria` render.
6. Visit the Vercel Blob storage tab (or the blob URL directly from the explorer's `MarketCreated` log) and confirm the JSON body matches the v1 schema.

- [ ] **Step 3: Repeat-payload dedup check**

Submit a second market with the **exact same** question + criteria (different deadline OK). Compare the `queryCid` URL in both `MarketCreated` events — they must be identical.

- [ ] **Step 4: No commit**

Verification only. If anything fails, return to the relevant earlier task.

---

## Out of scope (documented for future readers)

- `oracle/src/index.ts` is still wired to the old `ResolutionRequested(marketId, question, criteria)` event signature and calls a `resolveMarket(marketId, yesWon)` that no longer exists in the pull-based hub. Fixing it is a separate spec.
- No on-chain changes. The contract is the source of truth.
- No new test framework. If tests are added later, `queryPayload.ts` is the natural starting point — its functions are pure and side-effect-free apart from the fetcher's module-level cache (which has a `_resetQueryPayloadCache` hook).
- Option C from the brainstorm (non-indexed `question`/`criteria` event params for cheaper UI reads) remains available as a future optimization if per-market blob fetches prove too slow at scale.
