import {NextRequest, NextResponse} from "next/server";
import {writeFile, mkdir} from "fs/promises";
import {createHash} from "crypto";
import {join} from "path";

// Local storage for the prototype. Files are content-addressed (sha256-derived
// filename) and served from /uploads via Next's static handling.
//
// TODO when wiring up the agentic oracle network: swap this for IPFS pinning
// (Pinata / web3.storage). The on-chain `cid` field already speaks IPFS shape.

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const EXT_BY_TYPE: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "weba",
    "audio/ogg": "ogg",
};

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            return NextResponse.json({error: "no file"}, {status: 400});
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                {error: `file too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 20MB)`},
                {status: 413},
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
        const ext =
            EXT_BY_TYPE[file.type] ||
            file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
            "bin";
        const filename = `${hash}.${ext}`;

        const uploadDir = join(process.cwd(), "public", "uploads");
        await mkdir(uploadDir, {recursive: true});
        await writeFile(join(uploadDir, filename), buffer);

        return NextResponse.json({
            cid: filename,
            url: `/uploads/${filename}`,
            contentType: file.type,
            size: buffer.length,
        });
    } catch (err) {
        console.error("upload failed:", err);
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "upload failed"},
            {status: 500},
        );
    }
}
