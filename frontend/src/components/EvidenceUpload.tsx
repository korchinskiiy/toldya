"use client";

import {useRef, useState} from "react";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import {HUB_ADDRESS, detectMediaType, hubAbi} from "@/lib/contracts";

export function EvidenceUpload({
    marketId,
    onSubmitted,
}: {
    marketId: bigint;
    onSubmitted: () => void;
}) {
    const {isConnected} = useAccount();
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();
    const fileRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stage, setStage] = useState<"idle" | "uploading" | "signing">("idle");

    function pick(f: File | null) {
        setFile(f);
        setError(null);
    }

    async function submit() {
        if (!file || !client) return;
        setBusy(true);
        setError(null);
        try {
            setStage("uploading");
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", {method: "POST", body: fd});
            if (!res.ok) {
                const {error: msg} = (await res.json().catch(() => ({}))) as {error?: string};
                throw new Error(msg ?? `upload failed (${res.status})`);
            }
            const {cid, contentType} = (await res.json()) as {cid: string; contentType: string};

            setStage("signing");
            const hash = await writeContractAsync({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "submitEvidence",
                args: [marketId, cid, detectMediaType(contentType), description],
            });
            await client.waitForTransactionReceipt({hash});

            setFile(null);
            setDescription("");
            if (fileRef.current) fileRef.current.value = "";
            onSubmitted();
        } catch (err) {
            setError(err instanceof Error ? err.message : "submit failed");
        } finally {
            setBusy(false);
            setStage("idle");
        }
    }

    const cta =
        stage === "uploading"
            ? "Uploading…"
            : stage === "signing"
              ? "Sign in your wallet…"
              : "Submit evidence";

    return (
        <div>
            <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
                disabled={busy}
                style={{padding: "0.7rem", cursor: busy ? "not-allowed" : "pointer"}}
            />
            <input
                type="text"
                placeholder="Caption (optional) — e.g. 'video at 9:23pm, Tom failed at 0:28'"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
                style={{marginTop: "0.6rem"}}
            />
            <button
                className="primary"
                onClick={submit}
                disabled={!file || busy || !isConnected}
                style={{marginTop: "0.9rem", width: "100%"}}
            >
                {!isConnected ? "Connect wallet to submit" : cta}
            </button>
            {error && <p className="error-text">{error}</p>}
        </div>
    );
}
