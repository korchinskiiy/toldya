"use client";

import {useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import {parseAbiItem, type Address} from "viem";
import {HUB_ADDRESS, MEDIA_TYPE} from "@/lib/contracts";
import {UserChip} from "./UserChip";

const evidenceEvent = parseAbiItem(
    "event EvidenceSubmitted(uint256 indexed marketId, address indexed submitter, string cid, uint8 mediaType, string description)",
);

type Evidence = {
    submitter: Address;
    cid: string;
    mediaType: number;
    description: string;
    blockNumber: bigint;
    logIndex: number;
};

export function EvidenceList({
    marketId,
    refreshKey,
}: {
    marketId: bigint;
    refreshKey: number;
}) {
    const client = usePublicClient();
    const [items, setItems] = useState<Evidence[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        (async () => {
            try {
                const logs = await client.getLogs({
                    address: HUB_ADDRESS,
                    event: evidenceEvent,
                    args: {marketId},
                    fromBlock: 0n,
                });
                const decoded = logs
                    .map((l) => ({
                        submitter: l.args.submitter!,
                        cid: l.args.cid!,
                        mediaType: Number(l.args.mediaType),
                        description: l.args.description!,
                        blockNumber: l.blockNumber!,
                        logIndex: l.logIndex!,
                    }))
                    .sort(
                        (a, b) =>
                            Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex,
                    );
                if (!cancelled) setItems(decoded);
            } catch (err) {
                console.error("evidence fetch failed", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [client, marketId, refreshKey]);

    if (loading) return <p className="muted">Loading evidence…</p>;
    if (items.length === 0) return <p className="muted faint">No evidence submitted yet.</p>;

    return (
        <div className="evidence-list">
            {items.map((e) => {
                const url = /^https?:\/\//.test(e.cid) ? e.cid : `/uploads/${e.cid}`;
                return (
                    <div key={`${e.blockNumber.toString()}-${e.logIndex}`} className="evidence-item">
                        <div className="evidence-meta">
                            <UserChip address={e.submitter} size={22} />
                            {e.description && (
                                <span className="muted" style={{fontSize: "0.9rem"}}>
                                    {e.description}
                                </span>
                            )}
                        </div>
                        {e.mediaType === MEDIA_TYPE.Image && (
                            <img src={url} alt={e.description} className="evidence-media" />
                        )}
                        {e.mediaType === MEDIA_TYPE.Video && (
                            <video src={url} controls className="evidence-media" />
                        )}
                        {e.mediaType === MEDIA_TYPE.Audio && (
                            <audio src={url} controls style={{width: "100%", marginTop: "0.6rem"}} />
                        )}
                        {e.mediaType === MEDIA_TYPE.Text && (
                            <a href={url} target="_blank" rel="noreferrer" className="muted">
                                Open file ↗
                            </a>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
