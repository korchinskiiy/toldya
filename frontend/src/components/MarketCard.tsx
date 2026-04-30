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

function StatusBadge({status}: {status: number}) {
    if (status === 0) return <span className="badge live">live</span>;
    if (status === 1) return <span className="badge">resolving</span>;
    if (status === 2) return <span className="badge yes">YES won</span>;
    if (status === 3) return <span className="badge no">NO won</span>;
    if (status === 4) return <span className="badge">voided</span>;
    return <span className="badge">{STATUS_LABELS[status] ?? "?"}</span>;
}

export function MarketCard({market}: {market: MarketView}) {
    const total = market.yesPool + market.noPool;
    const yesPct = total === 0n ? 50 : Number((market.yesPool * 10000n) / total) / 100;
    const noPct = 100 - yesPct;

    return (
        <Link href={`/markets/${market.id.toString()}`} className="market-card">
            <div className="market-card-meta">
                <StatusBadge status={market.status} />
                <span className="muted">{deadlineLabel(market.deadline)}</span>
            </div>
            <h3 className="market-card-question">{market.question}</h3>
            <div className="ratio-bar" aria-label={`YES ${yesPct.toFixed(0)}% / NO ${noPct.toFixed(0)}%`}>
                {yesPct > 0 && (
                    <div className="ratio-yes" style={{width: `${yesPct}%`}}>
                        {yesPct >= 12 ? `YES ${yesPct.toFixed(0)}%` : ""}
                    </div>
                )}
                {noPct > 0 && (
                    <div className="ratio-no" style={{width: `${noPct}%`}}>
                        {noPct >= 12 ? `NO ${noPct.toFixed(0)}%` : ""}
                    </div>
                )}
            </div>
            <div className="market-card-footer">
                <span className="muted">pot</span>
                <strong style={{fontVariantNumeric: "tabular-nums"}}>
                    {formatTaiko(total)} TAIKO
                </strong>
            </div>
        </Link>
    );
}
