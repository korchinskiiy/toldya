"use client";

import Link from "next/link";
import {use, useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import {Header} from "@/components/Header";
import {EventCard} from "@/components/EventCard";
import {Avatar} from "@/lib/avatar";
import {fetchFeed, type FeedEvent} from "@/lib/events";
import {formatTaiko} from "@/lib/format";

type PageProps = {params: Promise<{address: string}>};

export default function ProfilePage({params}: PageProps) {
    const {address: rawAddr} = use(params);
    const address = rawAddr.toLowerCase();
    const client = usePublicClient();
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"all" | "created" | "bets" | "claims">("all");

    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        (async () => {
            try {
                const all = await fetchFeed(client);
                const mine = all.filter((e) => {
                    if (e.kind === "created") return e.creator.toLowerCase() === address;
                    if (e.kind === "staked") return e.staker.toLowerCase() === address;
                    if (e.kind === "claimed") return e.staker.toLowerCase() === address;
                    if (e.kind === "resolved") {
                        // include in profile only if user participated in the market
                        const involved = all.some(
                            (x) =>
                                x.marketId === e.marketId &&
                                ((x.kind === "created" && x.creator.toLowerCase() === address) ||
                                    (x.kind === "staked" && x.staker.toLowerCase() === address)),
                        );
                        return involved;
                    }
                    return false;
                });
                if (!cancelled) setEvents(mine);
            } catch (err) {
                console.error(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [client, address]);

    const created = events.filter((e) => e.kind === "created");
    const bets = events.filter((e) => e.kind === "staked" || e.kind === "created");
    const claims = events.filter((e) => e.kind === "claimed");

    const totalStaked = bets.reduce((acc, e) => {
        if (e.kind === "staked" || e.kind === "created") return acc + e.amount;
        return acc;
    }, 0n);
    const totalClaimed = claims.reduce(
        (acc, e) => (e.kind === "claimed" ? acc + e.amount : acc),
        0n,
    );

    const filtered =
        tab === "all"
            ? events
            : tab === "created"
              ? created
              : tab === "bets"
                ? bets
                : claims;

    return (
        <div className="container">
            <Header />

            <section className="profile-head">
                <Avatar address={address} size={84} />
                <div>
                    <h1 className="profile-addr">
                        {address.slice(0, 6)}…{address.slice(-4)}
                    </h1>
                    <p className="muted" style={{margin: 0, fontFamily: "monospace", fontSize: "0.78rem"}}>
                        {address}
                    </p>
                </div>
            </section>

            <div className="stats-grid">
                <div className="stat">
                    <div className="stat-label">Markets opened</div>
                    <div className="stat-value">{created.length}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">Bets placed</div>
                    <div className="stat-value">{bets.length}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">Total staked</div>
                    <div className="stat-value">{formatTaiko(totalStaked)}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">Total won</div>
                    <div className="stat-value">{formatTaiko(totalClaimed)}</div>
                </div>
            </div>

            <div className="tabs">
                {(["all", "created", "bets", "claims"] as const).map((t) => (
                    <button
                        key={t}
                        className={tab === t ? "primary sm" : "ghost sm"}
                        onClick={() => setTab(t)}
                    >
                        {t === "all" ? "Everything" : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>

            {loading && <p className="muted">Loading activity…</p>}
            {!loading && filtered.length === 0 && (
                <div className="empty">
                    <p>No activity yet.</p>
                    <Link href="/create" className="btn btn-primary">
                        Open a market →
                    </Link>
                </div>
            )}
            {filtered.map((e) => (
                <EventCard
                    key={`${e.blockNumber.toString()}-${e.logIndex}-${e.kind}`}
                    event={e}
                />
            ))}
        </div>
    );
}
