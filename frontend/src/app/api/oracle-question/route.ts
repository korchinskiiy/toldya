import {NextRequest, NextResponse} from "next/server";
import {isAddress, verifyMessage} from "viem";
import {
    buildOracleQuestionPayload,
    buildOracleQuestionPinMessage,
    validateOracleQuestionText,
} from "@/lib/oracleQuestion";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    if (!process.env.PINATA_JWT) {
        return NextResponse.json({error: "PINATA_JWT not configured"}, {status: 500});
    }

    let body: unknown;
    try {
        body = await req.json();
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
    if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(input.signature)) {
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
