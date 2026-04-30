"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import {Header} from "@/components/Header";
import {MarketCard, type MarketView} from "@/components/MarketCard";
import {HUB_ADDRESS, hubAbi} from "@/lib/contracts";

export default function MarketsPage() {
    const client = usePublicClient();
    const [markets, setMarkets] = useState<MarketView[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            const next = (await client.readContract({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "nextMarketId",
            })) as bigint;

            const ids = Array.from({length: Number(next)}, (_, i) => BigInt(i));
            const fetched = await Promise.all(
                ids.map(async (id) => {
                    const m = (await client.readContract({
                        address: HUB_ADDRESS,
                        abi: hubAbi,
                        functionName: "getMarket",
                        args: [id],
                    })) as MarketView;
                    return {...m, id};
                }),
            );
            if (!cancelled) {
                setMarkets(fetched.reverse());
                setLoading(false);
            }
        })().catch((e) => {
            console.error(e);
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [client]);

    const live = markets.filter((m) => m.status === 0);
    const settled = markets.filter((m) => m.status >= 2);

    return (
        <div className="container">
            <Header />
            <div className="section-heading">
                <h2>Live markets</h2>
                <span className="muted">{live.length}</span>
            </div>
            {loading && <p className="muted">Loading…</p>}
            {!loading && live.length === 0 && (
                <div className="empty">
                    <p>No live markets right now.</p>
                    <Link href="/create" className="btn btn-primary">
                        Open one →
                    </Link>
                </div>
            )}
            {live.map((m) => (
                <MarketCard key={m.id.toString()} market={m} />
            ))}

            {settled.length > 0 && (
                <>
                    <div className="section-heading" style={{marginTop: "2rem"}}>
                        <h2>Settled</h2>
                        <span className="muted">{settled.length}</span>
                    </div>
                    {settled.map((m) => (
                        <MarketCard key={m.id.toString()} market={m} />
                    ))}
                </>
            )}
        </div>
    );
}
