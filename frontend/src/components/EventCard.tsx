import {UserChip} from "./UserChip";
import type {FeedEvent} from "@/lib/events";
import {relativeTime} from "@/lib/events";
import {formatTaiko} from "@/lib/format";

function SideTag({side}: {side: number}) {
    return (
        <span className={`badge ${side === 0 ? "yes" : "no"}`} style={{padding: "2px 7px"}}>
            {side === 0 ? "YES" : "NO"}
        </span>
    );
}

function OutcomeTag({outcome}: {outcome: number}) {
    if (outcome === 2) return <span className="badge yes">YES won</span>;
    if (outcome === 3) return <span className="badge no">NO won</span>;
    if (outcome === 4) return <span className="badge">voided</span>;
    return <span className="badge">resolved</span>;
}

export function EventCard({event}: {event: FeedEvent}) {
    let line: React.ReactNode;
    let actor: string | null = null;

    switch (event.kind) {
        case "created":
            actor = event.creator;
            line = (
                <>
                    opened a market on <SideTag side={event.side} /> with{" "}
                    <strong>{formatTaiko(event.amount)} TAIKO</strong>
                </>
            );
            break;
        case "staked":
            actor = event.staker;
            line = (
                <>
                    bet <strong>{formatTaiko(event.amount)} TAIKO</strong> on{" "}
                    <SideTag side={event.side} />
                </>
            );
            break;
        case "resolved":
            line = (
                <>
                    market resolved — <OutcomeTag outcome={event.outcome} />
                </>
            );
            break;
        case "claimed":
            actor = event.staker;
            line = (
                <>
                    claimed <strong>{formatTaiko(event.amount)} TAIKO</strong>
                </>
            );
            break;
        case "evidence":
            actor = event.submitter;
            line = (
                <>
                    submitted{" "}
                    {event.mediaType === 0
                        ? "an image"
                        : event.mediaType === 1
                          ? "a video"
                          : event.mediaType === 2
                            ? "an audio clip"
                            : "evidence"}
                    {event.description && (
                        <span className="muted faint"> — “{event.description}”</span>
                    )}
                </>
            );
            break;
    }

    const href = `#market-${event.marketId.toString()}`;

    function onClick(e: React.MouseEvent) {
        // Same-hash clicks don't fire hashchange, so the market card wouldn't
        // re-expand on a second click. Force-dispatch our refocus event so
        // clicking the same activity item always scrolls back to it.
        e.preventDefault();
        if (window.location.hash === href) {
            window.dispatchEvent(new CustomEvent("toldya:refocus"));
        } else {
            window.location.hash = href;
        }
    }

    return (
        <a href={href} className="event-card" onClick={onClick}>
            <div className="event-head">
                <div className="event-actor">
                    {actor ? (
                        <UserChip address={actor} bold />
                    ) : (
                        <span className="muted" style={{fontWeight: 600}}>
                            🤖 toldya
                        </span>
                    )}
                    <span className="muted">{line}</span>
                </div>
                <span className="muted faint" style={{fontSize: "0.8rem"}}>
                    {relativeTime(event.timestamp)}
                </span>
            </div>
            <span className="event-question">{event.question}</span>
        </a>
    );
}
