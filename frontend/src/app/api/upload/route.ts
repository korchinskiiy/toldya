import {NextRequest, NextResponse} from "next/server";
import {put} from "@vercel/blob";

// Vercel Blob storage. Files are content-addressed (sha256-derived prefix +
// original extension) so the same evidence dedupes naturally. The on-chain
// `cid` stores the full public Blob URL — EvidenceList renders it directly.

export const runtime = "nodejs";

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

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

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

        const buffer = await file.arrayBuffer();
        const hash = (await sha256Hex(buffer)).slice(0, 24);
        const ext =
            EXT_BY_TYPE[file.type] ||
            file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
            "bin";

        const blob = await put(`evidence/${hash}.${ext}`, buffer, {
            access: "public",
            contentType: file.type || "application/octet-stream",
            addRandomSuffix: false,
            allowOverwrite: true,
        });

        return NextResponse.json({
            cid: blob.url,
            url: blob.url,
            contentType: file.type,
            size: buffer.byteLength,
        });
    } catch (err) {
        console.error("upload failed:", err);
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "upload failed"},
            {status: 500},
        );
    }
}
