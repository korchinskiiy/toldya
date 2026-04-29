import Link from "next/link";
import {STATUS_LABELS} from "@/lib/contracts";
import {deadlineLabel, formatTaiko} from "@/lib/format";

export type MarketView = {
    id: bigint;
    creator: `0x${string}`;
    deadline: bigint;
    status: number;
    question: string;
    criteria: string;
    yesPool: bigint;
    noPool: bigint;
};

export function MarketCard({market}: {market: MarketView}) {
    const total = market.yesPool + market.noPool;
    const yesPct = total === 0n ? 0 : Number((market.yesPool * 10000n) / total) / 100;
    const noPct = total === 0n ? 0 : 100 - yesPct;
    const statusLabel = STATUS_LABELS[market.status] ?? "Unknown";

    return (
        <Link href={`/markets/${market.id.toString()}`} style={{color: "inherit"}}>
            <div className="card">
                <div className="row" style={{justifyContent: "space-between"}}>
                    <span className="badge">{statusLabel}</span>
                    <span className="muted">{deadlineLabel(market.deadline)}</span>
                </div>
                <h3 style={{margin: "0.6rem 0 0.3rem"}}>{market.question}</h3>
                <div className="muted" style={{marginBottom: "0.8rem"}}>
                    pot: {formatTaiko(total)} TAIKO
                </div>
                <div className="row" style={{gap: "1.2rem"}}>
                    <span>
                        <span className="badge yes">YES {yesPct.toFixed(0)}%</span>{" "}
                        <span className="muted">{formatTaiko(market.yesPool)}</span>
                    </span>
                    <span>
                        <span className="badge no">NO {noPct.toFixed(0)}%</span>{" "}
                        <span className="muted">{formatTaiko(market.noPool)}</span>
                    </span>
                </div>
            </div>
        </Link>
    );
}
