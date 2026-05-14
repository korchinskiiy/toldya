import {NextRequest, NextResponse} from "next/server";
import {
    canonicalEncode,
    MAX_BODY_BYTES,
    validateInput,
} from "@/lib/queryPayload";

// JSON-only sibling of /api/upload. Accepts {question, criteria}, pins the
// canonical payload to Pinata IPFS, returns the public gateway URL for use
// as the on-chain queryCid. Pinata's CID is deterministic from canonical
// bytes, so identical questions dedupe naturally.

export const runtime = "nodejs";

const PINATA_PIN_JSON_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function defaultGateway(): string {
    const g = process.env.NEXT_PUBLIC_PINATA_GATEWAY?.replace(/\/$/, "");
    return g && g.length > 0 ? g : "https://gateway.pinata.cloud";
}

export async function POST(req: NextRequest) {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
        return NextResponse.json(
            {
                error:
                    "Pinata is not configured. Set PINATA_JWT (create a key " +
                    "at https://app.pinata.cloud/keys with pinJSONToIPFS scope).",
            },
            {status: 500},
        );
    }

    let raw: unknown;
    try {
        const text = await req.text();
        if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
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
        const bytes = canonicalEncode(validated.value);
        // Pinata's pinJSONToIPFS expects a JSON object in `pinataContent`. We
        // re-parse our own canonical bytes here so the body we send Pinata
        // *is* the canonical object (Pinata re-serialises internally, but
        // since the content is JSON the resulting CID is stable given the
        // same canonical input).
        const pinataBody = {
            pinataContent: JSON.parse(new TextDecoder().decode(bytes)),
            pinataMetadata: {name: "toldya-query"},
        };

        const pinRes = await fetch(PINATA_PIN_JSON_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(pinataBody),
        });

        if (!pinRes.ok) {
            const errText = await pinRes.text().catch(() => "");
            console.error("pinata pinJSONToIPFS failed:", pinRes.status, errText);
            return NextResponse.json(
                {error: `pinata pin failed (${pinRes.status})`},
                {status: 502},
            );
        }

        const pinJson = (await pinRes.json()) as {IpfsHash?: string};
        const cid = pinJson.IpfsHash;
        if (!cid) {
            return NextResponse.json(
                {error: "pinata response missing IpfsHash"},
                {status: 502},
            );
        }

        const url = `${defaultGateway()}/ipfs/${cid}`;
        return NextResponse.json({url, cid});
    } catch (err) {
        console.error("upload-query failed:", err);
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "upload failed"},
            {status: 500},
        );
    }
}
