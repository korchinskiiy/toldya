import {NextRequest, NextResponse} from "next/server";
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
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

const rateLimits = new Map<string, {count: number; resetAt: number}>();

function getClientIp(req: NextRequest): string {
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwardedFor || req.headers.get("x-real-ip") || "unknown";
}

function consumeRateLimit(key: string): boolean {
    const now = Date.now();
    const current = rateLimits.get(key);
    if (!current || current.resetAt <= now) {
        rateLimits.set(key, {count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS});
        return true;
    }
    if (current.count >= RATE_LIMIT_MAX) return false;
    current.count += 1;
    return true;
}

export async function POST(req: NextRequest) {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
        return NextResponse.json({error: "request body too large"}, {status: 413});
    }

    if (!process.env.PINATA_JWT) {
        return NextResponse.json({error: "PINATA_JWT not configured"}, {status: 500});
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
    // Best-effort only in serverless: production should also enforce this with
    // edge, WAF, or provider-level limits because in-memory state is per isolate.
    const rateKey = `${getClientIp(req)}:${input.address.toLowerCase()}`;
    if (!consumeRateLimit(rateKey)) {
        return NextResponse.json({error: "rate limit exceeded"}, {status: 429});
    }

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
        return NextResponse.json({error: `Pinata error: ${await res.text()}`}, {status: res.status});
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
