import {NextRequest, NextResponse} from "next/server";
import {buildOracleQuestionPayload} from "@/lib/oracleQuestion";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    if (!process.env.PINATA_JWT) {
        return NextResponse.json({error: "PINATA_JWT not configured"}, {status: 500});
    }

    const body = (await req.json()) as {question?: unknown; criteria?: unknown};
    if (typeof body.question !== "string" || body.question.trim().length === 0) {
        return NextResponse.json({error: "question is required"}, {status: 400});
    }
    if (typeof body.criteria !== "string" || body.criteria.trim().length === 0) {
        return NextResponse.json({error: "criteria is required"}, {status: 400});
    }

    const payload = buildOracleQuestionPayload({
        question: body.question,
        criteria: body.criteria,
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

    const out = (await res.json()) as {IpfsHash: string};
    return NextResponse.json({cid: out.IpfsHash});
}
