"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import {Header} from "@/components/Header";
import {EventCard} from "@/components/EventCard";
import {fetchFeed, type FeedEvent} from "@/lib/events";

export default function FeedPage() {
    const client = usePublicClient();
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        const load = async () => {
            try {
                const e = await fetchFeed(client);
                if (!cancelled) setEvents(e);
            } catch (err) {
                console.error("feed fetch failed", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        const t = setInterval(load, 8000);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [client]);

    return (
        <div className="container">
            <Header />

            <div className="section-heading">
                <h2>Feed</h2>
                <Link href="/markets" className="muted" style={{fontSize: "0.85rem"}}>
                    browse all markets →
                </Link>
            </div>

            {loading && events.length === 0 && <p className="muted">Loading activity…</p>}
            {!loading && events.length === 0 && (
                <div className="empty">
                    <p>Nothing yet. Be first.</p>
                    <Link href="/create" className="btn btn-primary">
                        Open a market →
                    </Link>
                </div>
            )}
            {events.map((e) => (
                <EventCard
                    key={`${e.blockNumber.toString()}-${e.logIndex}-${e.kind}-${e.marketId.toString()}`}
                    event={e}
                />
            ))}
        </div>
    );
}
