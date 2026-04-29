"use client";

import {useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import {Header} from "@/components/Header";
import {MarketCard, type MarketView} from "@/components/MarketCard";
import {HUB_ADDRESS, hubAbi} from "@/lib/contracts";

export default function Home() {
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

    return (
        <div className="container">
            <Header />
            <h2 style={{marginTop: 0}}>Live markets</h2>
            {loading && <p className="muted">Loading…</p>}
            {!loading && markets.length === 0 && (
                <p className="muted">
                    No markets yet. <a href="/create">Open the first one.</a>
                </p>
            )}
            {markets.map((m) => (
                <MarketCard key={m.id.toString()} market={m} />
            ))}
        </div>
    );
}
