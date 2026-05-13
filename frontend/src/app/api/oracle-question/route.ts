import {NextRequest, NextResponse} from "next/server";
import {Redis} from "@upstash/redis";
import {isAddress, verifyMessage} from "viem";
import {
    buildOracleQuestionPayload,
    buildOracleQuestionPinMessage,
    validateOracleQuestionText,
} from "@/lib/oracleQuestion";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8_192;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const RATE_LIMIT_PREFIX = "toldya:oracle-pin";
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

const rateLimits = new Map<string, {count: number; resetAt: number}>();
let redis: Redis | null | undefined;

function getClientIp(req: NextRequest): string {
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwardedFor || req.headers.get("x-real-ip") || "unknown";
}

function sweepExpiredRateLimits(now: number) {
    for (const [key, value] of rateLimits) {
        if (value.resetAt > now) continue;
        rateLimits.delete(key);
    }
}

function consumeMemoryRateLimit(key: string): boolean {
    const now = Date.now();
    sweepExpiredRateLimits(now);

    const current = rateLimits.get(key);
    if (!current || current.resetAt <= now) {
        if (rateLimits.size >= RATE_LIMIT_MAX_ENTRIES) return false;
        rateLimits.set(key, {count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS});
        return true;
    }
    if (current.count >= RATE_LIMIT_MAX) return false;
    current.count += 1;
    return true;
}

function getRedis(): Redis | null {
    if (redis !== undefined) return redis;

    const url = process.env.ORACLE_PIN_RATE_LIMIT_REDIS_REST_URL;
    const token = process.env.ORACLE_PIN_RATE_LIMIT_REDIS_REST_TOKEN;
    redis = url && token ? new Redis({url, token}) : null;
    return redis;
}

async function consumeDurableRateLimit(redisClient: Redis, key: string): Promise<boolean> {
    const redisKey = `${RATE_LIMIT_PREFIX}:${key}`;
    const created = await redisClient.set(redisKey, 1, {
        px: RATE_LIMIT_WINDOW_MS,
        nx: true,
    });
    if (created === "OK") return true;

    const count = await redisClient.incr(redisKey);
    if (count === 1) {
        await redisClient.pexpire(redisKey, RATE_LIMIT_WINDOW_MS);
    }
    return count <= RATE_LIMIT_MAX;
}

async function consumeRateLimit(key: string): Promise<{ok: true} | {ok: false; status: number; error: string}> {
    const redisClient = getRedis();
    if (redisClient) {
        try {
            return (await consumeDurableRateLimit(redisClient, key))
                ? {ok: true}
                : {ok: false, status: 429, error: "rate limit exceeded"};
        } catch (err) {
            console.error("Oracle question rate limit failed", err);
            return {ok: false, status: 503, error: "rate limit unavailable"};
        }
    }

    if (process.env.NODE_ENV === "production") {
        return {ok: false, status: 500, error: "rate limiter not configured"};
    }

    return consumeMemoryRateLimit(key)
        ? {ok: true}
        : {ok: false, status: 429, error: "rate limit exceeded"};
}

async function readLimitedBody(req: NextRequest): Promise<string | null> {
    const reader = req.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = "";

    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
            await reader.cancel().catch(() => {});
            return null;
        }
        text += decoder.decode(value, {stream: true});
    }

    return text + decoder.decode();
}

export async function POST(req: NextRequest) {
    const contentLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return NextResponse.json({error: "request body too large"}, {status: 413});
    }

    const clientIp = getClientIp(req);
    const ipRateLimit = await consumeRateLimit(`ip:${clientIp}`);
    if (!ipRateLimit.ok) {
        return NextResponse.json({error: ipRateLimit.error}, {status: ipRateLimit.status});
    }

    if (!process.env.PINATA_JWT) {
        return NextResponse.json({error: "PINATA_JWT not configured"}, {status: 500});
    }

    const rawBody = await readLimitedBody(req);
    if (rawBody === null) {
        return NextResponse.json({error: "request body too large"}, {status: 413});
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody) as unknown;
    } catch {
        return NextResponse.json({error: "invalid JSON body"}, {status: 400});
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({error: "invalid JSON body"}, {status: 400});
    }

    const input = body as {question?: unknown; criteria?: unknown; address?: unknown; signature?: unknown};

    const validationError = validateOracleQuestionText({
        question: input.question,
        criteria: input.criteria,
    });
    if (validationError) {
        return NextResponse.json({error: validationError}, {status: 400});
    }
    if (typeof input.address !== "string" || !isAddress(input.address)) {
        return NextResponse.json({error: "valid address is required"}, {status: 400});
    }
    if (typeof input.signature !== "string" || !SIGNATURE_RE.test(input.signature)) {
        return NextResponse.json({error: "valid signature is required"}, {status: 400});
    }

    const question = (input.question as string).trim();
    const criteria = (input.criteria as string).trim();

    const message = buildOracleQuestionPinMessage({question, criteria});
    let verified = false;
    try {
        verified = await verifyMessage({
            address: input.address,
            message,
            signature: input.signature as `0x${string}`,
        });
    } catch {
        return NextResponse.json({error: "bad signature"}, {status: 401});
    }
    if (!verified) {
        return NextResponse.json({error: "bad signature"}, {status: 401});
    }
    const addressRateLimit = await consumeRateLimit(`address:${input.address.toLowerCase()}`);
    if (!addressRateLimit.ok) {
        return NextResponse.json({error: addressRateLimit.error}, {status: addressRateLimit.status});
    }

    const payload = buildOracleQuestionPayload({
        question,
        criteria,
    });

    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.PINATA_JWT}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({pinataContent: payload}),
    });

    if (!res.ok) {
        console.error("Pinata pinJSONToIPFS failed", {status: res.status, body: await res.text()});
        return NextResponse.json({error: "pin failed"}, {status: 502});
    }

    let out: {IpfsHash?: unknown};
    try {
        out = (await res.json()) as {IpfsHash?: unknown};
    } catch {
        return NextResponse.json({error: "invalid Pinata response"}, {status: 502});
    }
    if (typeof out.IpfsHash !== "string" || out.IpfsHash.length === 0) {
        return NextResponse.json({error: "invalid Pinata response"}, {status: 502});
    }

    return NextResponse.json({cid: out.IpfsHash});
}
