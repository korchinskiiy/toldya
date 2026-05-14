// Shared schema, canonical encoder, and cached fetcher for the off-chain
// JSON payload that ToldyaHub's `queryCid` points at. The payload lives on
// IPFS (pinned via Pinata); the on-chain string is a Pinata gateway URL
// containing the CID.

export const QUERY_PAYLOAD_VERSION = 1;

// Length caps are generous on purpose. Tightening can be done later without
// breaking older payloads — IPFS content remains retrievable forever even if
// the validator gets stricter.
export const QUESTION_MAX = 280;
export const CRITERIA_MAX = 2000;

// Server-side body size limit. 64 KB is far above anything legitimate (a
// 2000-char criteria + 280-char question + JSON overhead is < 3 KB).
export const MAX_BODY_BYTES = 64 * 1024;

export type QueryPayloadV1 = {
    version: 1;
    question: string;
    criteria: string;
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

// Build the canonical JSON body the route uploads. Fixed key order, no
// whitespace, so identical inputs produce identical bytes — and therefore
// identical CIDs from Pinata.
export function canonicalEncode(input: ValidatedInput): Uint8Array {
    const payload: QueryPayloadV1 = {
        version: QUERY_PAYLOAD_VERSION,
        question: input.question,
        criteria: input.criteria,
    };
    const json = JSON.stringify(payload);
    return new TextEncoder().encode(json);
}

// --- Client/server fetcher with in-memory cache --------------------------
// queryCid URLs are content-addressed (CID embedded in URL) and immutable,
// so we never invalidate. A failed fetch is also cached (as `null`) so we
// don't hammer a 404 URL on every re-render.

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
