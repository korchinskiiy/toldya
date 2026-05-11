"use client";

import {useEffect, useState} from "react";
import {useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract} from "wagmi";
import {useAppKit} from "@reown/appkit/react";
import {ALLOWED_CHAIN} from "@/lib/wagmi";
import {HUB_ADDRESS, TOKEN_ADDRESS, erc20Abi, hubAbi} from "@/lib/contracts";
import {deadlineLabel, formatTaiko, parseTaiko} from "@/lib/format";
import {EvidenceList} from "@/components/EvidenceList";
import {EvidenceUpload} from "@/components/EvidenceUpload";
import {EventCard} from "@/components/EventCard";
import {fetchFeed, type FeedEvent} from "@/lib/events";
import {Avatar} from "@/lib/avatar";

const FAUCET_AMOUNT = parseTaiko("1000");
const EXPLORER = "https://hoodi.taikoscan.io";

const mintAbi = [
    {
        type: "function",
        name: "mint",
        stateMutability: "nonpayable",
        inputs: [
            {name: "to", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [],
    },
] as const;

type Market = {
    id: bigint;
    creator: `0x${string}`;
    deadline: bigint;
    status: number;
    oracleEnabled: boolean;
    question: string;
    criteria: string;
    yesPool: bigint;
    noPool: bigint;
};

const STATUS_LABEL = ["Live", "Resolving", "YES won", "NO won", "Voided"];

function Confetti() {
    const pieces = Array.from({length: 60});
    const colors = ["#22c55e", "#a78bfa", "#facc15", "#38bdf8", "#f472b6", "#fb923c"];
    return (
        <div className="confetti-root" aria-hidden>
            {pieces.map((_, i) => {
                const left = Math.random() * 100;
                const delay = Math.random() * 240;
                const dur = 1500 + Math.random() * 900;
                const bg = colors[i % colors.length];
                const tilt = (Math.random() - 0.5) * 60;
                return (
                    <span
                        key={i}
                        className="confetti-piece"
                        style={{
                            left: `${left}vw`,
                            background: bg,
                            transform: `rotate(${tilt}deg)`,
                            animationDelay: `${delay}ms`,
                            animationDuration: `${dur}ms`,
                        }}
                    />
                );
            })}
        </div>
    );
}

export default function Home() {
    const {address, isConnected} = useAccount();
    const chainId = useChainId();
    const onRightChain = chainId === ALLOWED_CHAIN.id;

    return (
        <div className="container">
            <Topbar />

            {!isConnected && <ConnectPanel />}
            {isConnected && !onRightChain && <SwitchPanel />}
            {isConnected && onRightChain && (
                <>
                    <FaucetPanel address={address!} />
                    <CreatePanel />
                </>
            )}

            <MarketList address={isConnected && onRightChain ? address! : undefined} />

            <ActivityFeed />

            <DeploymentInfo />
        </div>
    );
}

// ---------------------------------------------------------------------
// Topbar — always visible chain & wallet status
// ---------------------------------------------------------------------

function Topbar() {
    const {address, isConnected} = useAccount();
    const chainId = useChainId();
    const {open} = useAppKit();

    const chainOk = chainId === ALLOWED_CHAIN.id;

    const {data: balance} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: Boolean(address), refetchInterval: 12000},
    });

    return (
        <header className="header">
            <div className="row" style={{gap: "0.7rem"}}>
                <span className="brand-dot" />
                <span className="brand">toldya</span>
            </div>
            <div className="row topbar-actions">
                {!chainOk && isConnected && (
                    <span className="badge no">chain {chainId} (wrong)</span>
                )}
                {isConnected && address && (
                    <>
                        {balance !== undefined && (
                            <span className="topbar-balance" title="Your mTAIKO balance">
                                <span className="topbar-balance-num">{formatTaiko(balance as bigint)}</span>
                                <span className="topbar-balance-tok">mTAIKO</span>
                            </span>
                        )}
                        <button
                            className="topbar-wallet"
                            onClick={() => open({view: "Account"})}
                            title="Manage account"
                        >
                            <Avatar address={address} size={22} />
                            <span className="topbar-wallet-addr">
                                {address.slice(0, 6)}…{address.slice(-4)}
                            </span>
                        </button>
                    </>
                )}
            </div>
        </header>
    );
}

// ---------------------------------------------------------------------
// Connect / switch panels
// ---------------------------------------------------------------------

function ConnectPanel() {
    const {open} = useAppKit();

    return (
        <div className="hero-panel">
            <h1 className="hero-title">
                Settle the bet.<br />
                Skip the argument.
            </h1>
            <p className="hero-sub">
                Sign in with Google or email. Open a YES/NO market, friends stake,
                an AI agent settles it.
            </p>
            <button className="primary lg hero-cta" onClick={() => open()}>
                Sign in
            </button>
            <p className="hero-foot">No wallet needed · Built on Taiko</p>
        </div>
    );
}

function SwitchPanel() {
    const {switchChain, isPending, error} = useSwitchChain();
    const chainId = useChainId();
    return (
        <div className="card" style={{textAlign: "center", borderColor: "var(--no-border)"}}>
            <h2 style={{margin: "0 0 0.5rem"}}>Wrong network</h2>
            <p className="muted" style={{margin: "0 0 1.2rem"}}>
                Your wallet is on chain <strong>{chainId}</strong>. Toldya only works on{" "}
                <strong>{ALLOWED_CHAIN.name}</strong> (chain {ALLOWED_CHAIN.id}).
            </p>
            <button
                className="primary lg"
                onClick={() => switchChain({chainId: ALLOWED_CHAIN.id})}
                disabled={isPending}
            >
                {isPending ? "Switching…" : `Switch to ${ALLOWED_CHAIN.name}`}
            </button>
            {error && <p className="error-text">{error.message}</p>}
        </div>
    );
}

// ---------------------------------------------------------------------
// Faucet panel
// ---------------------------------------------------------------------

function FaucetPanel({address}: {address: `0x${string}`}) {
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function mint() {
        if (!client) return;
        setBusy(true);
        setErr(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: TOKEN_ADDRESS,
                abi: mintAbi,
                functionName: "mint",
                args: [address, FAUCET_AMOUNT],
            });
            await client.waitForTransactionReceipt({hash});
        } catch (e) {
            setErr(e instanceof Error ? e.message.split("\n")[0] : "mint failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="faucet-slim">
            <span>Need test tokens?</span>
            <button onClick={mint} disabled={busy}>
                {busy ? "Minting…" : "+ 1000 mTAIKO"}
            </button>
            {err && <span className="error-text" style={{margin: 0}}>{err}</span>}
        </div>
    );
}

// ---------------------------------------------------------------------
// Create panel — collapsible
// ---------------------------------------------------------------------

function CreatePanel() {
    const client = usePublicClient();
    const {address} = useAccount();
    const {writeContractAsync} = useWriteContract();

    const [open, setOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [criteria, setCriteria] = useState("");
    const [deadline, setDeadline] = useState(() => defaultDeadline());
    const [side, setSide] = useState<0 | 1>(1);
    const [amount, setAmount] = useState("10");
    const [oracleFallback, setOracleFallback] = useState(false);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState<string>("");
    const [tx, setTx] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        if (!client || !address) return;
        setBusy(true);
        setErr(null);
        setTx(null);
        try {
            const wei = parseTaiko(amount);
            setStage("Checking allowance");
            const allowance = (await client.readContract({
                address: TOKEN_ADDRESS,
                abi: erc20Abi,
                functionName: "allowance",
                args: [address, HUB_ADDRESS],
            })) as bigint;

            if (allowance < wei) {
                setStage("Approving TAIKO (1/2)");
                const aHash = await writeContractAsync({
                    chainId: ALLOWED_CHAIN.id,
                    address: TOKEN_ADDRESS,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [HUB_ADDRESS, wei],
                });
                setTx(aHash);
                await client.waitForTransactionReceipt({hash: aHash});
            }

            const deadlineTs = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
            if (deadlineTs <= BigInt(Math.floor(Date.now() / 1000))) {
                throw new Error("Deadline must be in the future");
            }

            setStage("Creating market (2/2)");
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "createMarket",
                args: [question, criteria, deadlineTs, side, wei, oracleFallback],
            });
            setTx(hash);
            await client.waitForTransactionReceipt({hash});

            // Reset form
            setQuestion("");
            setCriteria("");
            setOpen(false);
            // Force the market list to refresh
            window.dispatchEvent(new Event("toldya:refresh"));
        } catch (e) {
            setErr(e instanceof Error ? e.message.split("\n")[0] : "failed");
        } finally {
            setBusy(false);
            setStage("");
        }
    }

    if (!open) {
        return (
            <button
                className="primary lg"
                onClick={() => setOpen(true)}
                style={{width: "100%", marginBottom: "1rem"}}
            >
                + Open a new market
            </button>
        );
    }

    return (
        <div className="card">
            <div className="row" style={{justifyContent: "space-between", marginBottom: "0.5rem"}}>
                <strong>New market</strong>
                <button className="ghost sm" onClick={() => setOpen(false)} disabled={busy}>
                    cancel
                </button>
            </div>

            <label>What's the bet?</label>
            <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Will Tom finish a beer in 30 seconds?"
                disabled={busy}
            />
            <div className="cf-quick-row">
                {[
                    "Will Tom finish a beer in 30 seconds?",
                    "Will it rain on Saturday?",
                    "Will Marco be late to dinner?",
                ].map((ex) => (
                    <button
                        key={ex}
                        type="button"
                        className="cf-quick"
                        onClick={() => setQuestion(ex)}
                        disabled={busy}
                    >
                        {ex}
                    </button>
                ))}
            </div>

            <label>How will it be judged?</label>
            <textarea
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                placeholder="Tom drinks a 0.5L beer; YES if empty within 30s. Video as evidence."
                disabled={busy}
            />

            <label>Deadline</label>
            <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={busy}
            />

            <label>Your side</label>
            <div className="mc-bet-row">
                <button
                    type="button"
                    className={side === 0 ? "yes" : "ghost"}
                    onClick={() => setSide(0)}
                    disabled={busy}
                >
                    YES
                </button>
                <button
                    type="button"
                    className={side === 1 ? "no" : "ghost"}
                    onClick={() => setSide(1)}
                    disabled={busy}
                >
                    NO
                </button>
            </div>

            <label>Stake (mTAIKO)</label>
            <div className="cf-amount-row">
                <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                />
                <div className="cf-amount-quick">
                    {["5", "10", "25", "100"].map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setAmount(v)}
                            disabled={busy}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            <label style={{display: "flex", alignItems: "center", gap: "0.55rem", cursor: "pointer"}}>
                <input
                    type="checkbox"
                    checked={oracleFallback}
                    onChange={(e) => setOracleFallback(e.target.checked)}
                    disabled={busy}
                    style={{width: "auto", marginTop: 0}}
                />
                <span>
                    Allow AI oracle fallback if stakers can't agree on the outcome
                </span>
            </label>
            <p className="muted" style={{fontSize: "0.78rem", margin: "0.3rem 0 0", lineHeight: 1.4}}>
                Off (default): the bet can only resolve if all stakers vote the same way.
                Best for friend bets where you trust everyone to agree.
                On: anyone can escalate to the AI agent if voters disagree.
            </p>

            <button
                className="primary lg"
                onClick={submit}
                disabled={busy || !question || !criteria}
                style={{width: "100%", marginTop: "1.4rem"}}
            >
                {busy ? stage || "Working…" : `Lock it in — ${amount} on ${side === 0 ? "YES" : "NO"} →`}
            </button>
            <TxStatus tx={tx} err={err} />
        </div>
    );
}

// ---------------------------------------------------------------------
// Market list — fetches all markets, renders inline cards
// ---------------------------------------------------------------------

function MarketList({address}: {address: `0x${string}` | undefined}) {
    const client = usePublicClient();
    const [markets, setMarkets] = useState<Market[]>([]);
    const [loading, setLoading] = useState(true);
    const [bump, setBump] = useState(0);

    useEffect(() => {
        function onRefresh() {
            setBump((n) => n + 1);
        }
        window.addEventListener("toldya:refresh", onRefresh);
        return () => window.removeEventListener("toldya:refresh", onRefresh);
    }, []);

    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        (async () => {
            try {
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
                        })) as Market;
                        return {...m, id};
                    }),
                );
                if (!cancelled) setMarkets(fetched.reverse());
            } catch (e) {
                console.error("market list fetch failed", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [client, bump]);

    if (loading) return <p className="muted">Loading markets…</p>;
    if (markets.length === 0) {
        return (
            <div className="empty-card">
                <h2 className="empty-title">No bets yet — start one.</h2>
                <p className="empty-sub">
                    A good toldya bet is short, judgeable, and has a real deadline. Try something like:
                </p>
                <div className="empty-examples">
                    <span className="ex">"Will Tom finish the beer in 30s?"</span>
                    <span className="ex">"Will it rain on Saturday?"</span>
                    <span className="ex">"Will Marco be late to dinner?"</span>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="section-h">
                <h2>Live bets <span className="count">{markets.length}</span></h2>
            </div>
            {markets.map((m) => (
                <MarketCard
                    key={m.id.toString()}
                    market={m}
                    viewer={address}
                    onChange={() => setBump((n) => n + 1)}
                />
            ))}
        </div>
    );
}

function MarketCard({market, viewer, onChange}: {market: Market; viewer: `0x${string}` | undefined; onChange: () => void}) {
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();

    const [expanded, setExpanded] = useState(false);
    const [betOpen, setBetOpen] = useState(false);
    const [amount, setAmount] = useState("10");
    const [busy, setBusy] = useState(false);
    const [tx, setTx] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [celebrate, setCelebrate] = useState(false);

    const {data: yesStake} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "yesStake",
        args: viewer ? [market.id, viewer] : undefined,
        query: {enabled: Boolean(viewer), refetchInterval: 6000},
    });
    const {data: noStake} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "noStake",
        args: viewer ? [market.id, viewer] : undefined,
        query: {enabled: Boolean(viewer), refetchInterval: 6000},
    });
    const {data: claimable} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "previewClaim",
        args: viewer ? [market.id, viewer] : undefined,
        query: {enabled: Boolean(viewer), refetchInterval: 6000},
    });
    const {data: oracleAddr} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "oracle",
    });
    const isOracle =
        viewer && oracleAddr && (oracleAddr as string).toLowerCase() === viewer.toLowerCase();

    const {data: stakers, refetch: refetchStakers} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "getStakers",
        args: [market.id],
        query: {refetchInterval: 6000},
    });
    const stakerList = (stakers as readonly `0x${string}`[] | undefined) ?? [];
    const [evidenceBump, setEvidenceBump] = useState(0);

    const total = market.yesPool + market.noPool;
    const yesPct = total === 0n ? 50 : Number((market.yesPool * 10000n) / total) / 100;
    const noPct = 100 - yesPct;
    const past = Number(market.deadline) * 1000 < Date.now();
    const isOpen = market.status === 0;
    // Voting is allowed any time after the market is open — stakers can settle
    // early when they all agree. The deadline only matters for AI-oracle escalation.
    const showVerdict = isOpen;
    const resolved = market.status >= 2;
    const userYes = (yesStake as bigint | undefined) ?? 0n;
    const userNo = (noStake as bigint | undefined) ?? 0n;
    const userClaim = (claimable as bigint | undefined) ?? 0n;

    async function ensureAllowance(wei: bigint) {
        if (!client || !viewer) return;
        const allowance = (await client.readContract({
            address: TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [viewer, HUB_ADDRESS],
        })) as bigint;
        if (allowance >= wei) return;
        const hash = await writeContractAsync({
            chainId: ALLOWED_CHAIN.id,
            address: TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [HUB_ADDRESS, wei],
        });
        setTx(hash);
        await client.waitForTransactionReceipt({hash});
    }

    async function bet(side: 0 | 1) {
        if (!client) return;
        setBusy(true);
        setErr(null);
        setTx(null);
        try {
            const wei = parseTaiko(amount);
            await ensureAllowance(wei);
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "stake",
                args: [market.id, side, wei],
            });
            setTx(hash);
            await client.waitForTransactionReceipt({hash});
            setBetOpen(false);
            onChange();
        } catch (e) {
            setErr(e instanceof Error ? e.message.split("\n")[0] : "bet failed");
        } finally {
            setBusy(false);
        }
    }

    async function trigger() {
        if (!client) return;
        setBusy(true);
        setErr(null);
        setTx(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "triggerResolution",
                args: [market.id],
            });
            setTx(hash);
            await client.waitForTransactionReceipt({hash});
            onChange();
        } catch (e) {
            setErr(e instanceof Error ? e.message.split("\n")[0] : "trigger failed");
        } finally {
            setBusy(false);
        }
    }

    async function castVote(yesWon: boolean) {
        if (!client) return;
        setBusy(true);
        setErr(null);
        setTx(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "voteResolution",
                args: [market.id, yesWon],
            });
            setTx(hash);
            await client.waitForTransactionReceipt({hash});
            await refetchStakers();
            onChange();
        } catch (e) {
            setErr(e instanceof Error ? e.message.split("\n")[0] : "vote failed");
        } finally {
            setBusy(false);
        }
    }

    async function oracleResolve(yesWon: boolean) {
        if (!client) return;
        setBusy(true);
        setErr(null);
        setTx(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "resolveMarket",
                args: [market.id, yesWon],
            });
            setTx(hash);
            await client.waitForTransactionReceipt({hash});
            onChange();
        } catch (e) {
            setErr(e instanceof Error ? e.message.split("\n")[0] : "resolve failed");
        } finally {
            setBusy(false);
        }
    }

    async function claim() {
        if (!client) return;
        setBusy(true);
        setErr(null);
        setTx(null);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "claim",
                args: [market.id],
            });
            setTx(hash);
            await client.waitForTransactionReceipt({hash});
            setCelebrate(true);
            setTimeout(() => setCelebrate(false), 2500);
            onChange();
        } catch (e) {
            setErr(e instanceof Error ? e.message.split("\n")[0] : "claim failed");
        } finally {
            setBusy(false);
        }
    }

    const leadClass =
        market.status === 0 && total > 0n
            ? yesPct > noPct
                ? "mc-yes-leads"
                : noPct > yesPct
                ? "mc-no-leads"
                : ""
            : market.status === 2
            ? "mc-resolved-yes"
            : market.status === 3
            ? "mc-resolved-no"
            : "";
    const statusBadgeClass =
        market.status === 0 ? "live" : market.status === 2 ? "yes" : market.status === 3 ? "no" : "";
    const timeLabel = past ? "deadline passed" : `closes ${deadlineLabel(market.deadline)}`;

    // First-seen confetti for newly resolved markets in this session.
    useEffect(() => {
        if (market.status !== 2 && market.status !== 3) return;
        if (typeof window === "undefined") return;
        const key = `toldya:seen:${market.id.toString()}`;
        try {
            const seen = sessionStorage.getItem(key);
            if (seen === String(market.status)) return;
            sessionStorage.setItem(key, String(market.status));
            setCelebrate(true);
            const t = setTimeout(() => setCelebrate(false), 2500);
            return () => clearTimeout(t);
        } catch {
            // sessionStorage may be blocked; quietly skip.
        }
    }, [market.id, market.status]);

    return (
        <article className={`mc ${leadClass}`}>
            {celebrate && <Confetti />}
            {market.status === 2 && (
                <div className="mc-banner mc-banner-yes">
                    YES won — {formatTaiko(total)} mTAIKO paid out
                </div>
            )}
            {market.status === 3 && (
                <div className="mc-banner mc-banner-no">
                    NO won — {formatTaiko(total)} mTAIKO paid out
                </div>
            )}
            {market.status === 4 && (
                <div className="mc-banner mc-banner-voided">
                    Voided — stakes refunded
                </div>
            )}
            <header className="mc-top">
                <div className="mc-pills">
                    <span className={`badge ${statusBadgeClass}`}>{STATUS_LABEL[market.status]}</span>
                    <span className="badge">{timeLabel}</span>
                </div>
                <div className="mc-pot">
                    <span className="mc-pot-num">{formatTaiko(total)}</span>
                    <span className="mc-pot-tok">mTAIKO pot</span>
                </div>
            </header>

            <h3 className="mc-q">{market.question}</h3>

            <div className="mc-bar" aria-label={`YES ${yesPct.toFixed(0)}%, NO ${noPct.toFixed(0)}%`}>
                {yesPct > 0 && (
                    <div className="mc-bar-yes" style={{width: `${yesPct}%`}}>
                        {yesPct >= 18 && (
                            <>
                                <span className="mc-bar-pct">YES {yesPct.toFixed(0)}%</span>
                                <span className="mc-bar-amt">{formatTaiko(market.yesPool)}</span>
                            </>
                        )}
                    </div>
                )}
                {noPct > 0 && (
                    <div className="mc-bar-no" style={{width: `${noPct}%`}}>
                        {noPct >= 18 && (
                            <>
                                <span className="mc-bar-pct">NO {noPct.toFixed(0)}%</span>
                                <span className="mc-bar-amt">{formatTaiko(market.noPool)}</span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {viewer && (userYes > 0n || userNo > 0n) && (
                <div className="mc-yours">
                    <span>Your stake</span>
                    {userYes > 0n && <span className="chip chip-yes">YES {formatTaiko(userYes)}</span>}
                    {userNo > 0n && <span className="chip chip-no">NO {formatTaiko(userNo)}</span>}
                </div>
            )}

            <div className="mc-foot">
                <span>{stakerList.length} {stakerList.length === 1 ? "bettor" : "bettors"}</span>
                <div className="row" style={{gap: "0.4rem"}}>
                    {viewer && isOpen && !past && (
                        <button className="primary sm" onClick={() => setBetOpen(true)}>
                            place a bet →
                        </button>
                    )}
                    <button className="ghost sm" onClick={() => setExpanded((v) => !v)}>
                        {expanded ? "collapse" : "details"}
                    </button>
                </div>
            </div>

            {betOpen && viewer && isOpen && !past && (
                <BetModal
                    question={market.question}
                    yesPct={yesPct}
                    noPct={noPct}
                    pot={total}
                    amount={amount}
                    setAmount={setAmount}
                    busy={busy}
                    onBet={bet}
                    onClose={() => setBetOpen(false)}
                    tx={tx}
                    err={err}
                />
            )}

            {expanded && (
                <div style={{marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)"}}>
                    <p className="muted" style={{whiteSpace: "pre-wrap", fontSize: "0.88rem", margin: "0 0 0.9rem"}}>
                        {market.criteria}
                    </p>

                    {!viewer && isOpen && !past && (
                        <p className="muted" style={{fontSize: "0.85rem", margin: "0 0 0.7rem"}}>
                            Connect your wallet to bet.
                        </p>
                    )}

                    {showVerdict && (
                        <ResolutionPanel
                            marketId={market.id}
                            oracleEnabled={market.oracleEnabled}
                            past={past}
                            viewer={viewer}
                            stakers={stakerList}
                            isStaker={Boolean(viewer && stakerList.map((a) => a.toLowerCase()).includes(viewer.toLowerCase()))}
                            busy={busy}
                            onVote={castVote}
                            onTrigger={trigger}
                            evidenceBump={evidenceBump}
                            onEvidenceSubmitted={() => setEvidenceBump((n) => n + 1)}
                        />
                    )}

                    {market.status === 1 && !isOracle && (
                        <p className="muted">Waiting for AI oracle to post the verdict on-chain…</p>
                    )}
                    {market.status === 1 && isOracle && (
                        <div style={{padding: "0.8rem", background: "var(--accent-bg)", borderRadius: "var(--radius)", marginTop: "0.5rem"}}>
                            <div className="muted" style={{fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem"}}>
                                Oracle controls (you are the oracle)
                            </div>
                            <div className="mc-bet-row">
                                <button className="yes" onClick={() => oracleResolve(true)} disabled={busy}>
                                    {busy ? "…" : "Resolve YES"}
                                </button>
                                <button className="no" onClick={() => oracleResolve(false)} disabled={busy}>
                                    {busy ? "…" : "Resolve NO"}
                                </button>
                            </div>
                        </div>
                    )}

                    {viewer && resolved && userClaim > 0n && (
                        <button className="mc-claim" onClick={claim} disabled={busy} style={{marginTop: "0.9rem"}}>
                            {busy ? "…" : `Claim ${formatTaiko(userClaim)} mTAIKO`}
                        </button>
                    )}

                    <TxStatus tx={tx} err={err} />
                </div>
            )}
        </article>
    );
}

// ---------------------------------------------------------------------
// Reusable tx status row
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Resolution panel — vote, voter status, evidence
// ---------------------------------------------------------------------

function ResolutionPanel({
    marketId,
    oracleEnabled,
    past,
    viewer,
    stakers,
    isStaker,
    busy,
    onVote,
    onTrigger,
    evidenceBump,
    onEvidenceSubmitted,
}: {
    marketId: bigint;
    oracleEnabled: boolean;
    past: boolean;
    viewer?: `0x${string}`;
    stakers: readonly `0x${string}`[];
    isStaker: boolean;
    busy: boolean;
    onVote: (yesWon: boolean) => Promise<void>;
    onTrigger: () => Promise<void>;
    evidenceBump: number;
    onEvidenceSubmitted: () => void;
}) {
    return (
        <div className="verdict">
            <div className="verdict-eyebrow">
                {past ? "Awaiting verdict · deadline passed" : "Settle early — bettors agree"}
            </div>
            <h4 className="verdict-title">
                {past ? "Time for a verdict." : "Already know the answer?"}
            </h4>

            <div className="verdict-step">
                <div className="verdict-step-h">
                    <span className="verdict-step-num">1</span> Drop evidence
                </div>
                <EvidenceList marketId={marketId} refreshKey={evidenceBump} />
                {viewer && (
                    <div style={{marginTop: "0.9rem"}}>
                        <EvidenceUpload marketId={marketId} onSubmitted={onEvidenceSubmitted} />
                    </div>
                )}
            </div>

            <div className="verdict-step">
                <div className="verdict-step-h">
                    <span className="verdict-step-num">2</span> Bettors vote — must be unanimous
                </div>
                <VoterStatus marketId={marketId} stakers={stakers} viewer={viewer} />
                {viewer && isStaker && (
                    <div style={{marginTop: "0.9rem"}}>
                        <div className="mc-bet-row">
                            <button className="yes" onClick={() => onVote(true)} disabled={busy}>
                                {busy ? "…" : "Vote YES"}
                            </button>
                            <button className="no" onClick={() => onVote(false)} disabled={busy}>
                                {busy ? "…" : "Vote NO"}
                            </button>
                        </div>
                        <p className="muted" style={{fontSize: "0.78rem", margin: "0.5rem 0 0"}}>
                            Settles the moment every bettor agrees. You can change your vote until then.
                        </p>
                    </div>
                )}
                {viewer && !isStaker && (
                    <p className="muted" style={{fontSize: "0.85rem", marginTop: "0.7rem"}}>
                        Only bettors can vote. You can still drop evidence to help them decide.
                    </p>
                )}
            </div>

            {oracleEnabled && past && (
                <div className="escalate-aside">
                    <div className="escalate-h">If you can't agree…</div>
                    <p>Anyone can hand it to the AI oracle to read the criteria and decide.</p>
                    <button className="ghost" onClick={onTrigger} disabled={busy} style={{width: "100%"}}>
                        {busy ? "…" : "Escalate to AI oracle"}
                    </button>
                </div>
            )}
        </div>
    );
}

function VoterStatus({
    marketId,
    stakers,
    viewer,
}: {
    marketId: bigint;
    stakers: readonly `0x${string}`[];
    viewer?: `0x${string}`;
}) {
    if (stakers.length === 0) return <p className="muted" style={{fontSize: "0.85rem"}}>No bettors yet.</p>;
    return (
        <div className="voter-list">
            {stakers.map((s) => (
                <VoterRow
                    key={s}
                    marketId={marketId}
                    address={s}
                    isYou={Boolean(viewer && s.toLowerCase() === viewer.toLowerCase())}
                />
            ))}
        </div>
    );
}

function VoterRow({marketId, address, isYou}: {marketId: bigint; address: `0x${string}`; isYou: boolean}) {
    const {data: vote} = useReadContract({
        chainId: ALLOWED_CHAIN.id,
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "resolutionVote",
        args: [marketId, address],
        query: {refetchInterval: 6000},
    });
    const v = Number(vote ?? 0);
    const stateClass =
        v === 1 ? "voter-yes" : v === 2 ? "voter-no" : "voter-pending";
    return (
        <div className={`voter-row ${stateClass} ${isYou ? "voter-you" : ""}`}>
            <span style={{display: "inline-flex", alignItems: "center", gap: "0.5rem"}}>
                <Avatar address={address} size={22} />
                <span style={{fontFamily: "ui-monospace, monospace", fontSize: "0.82rem"}}>
                    {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                {isYou && <span className="muted" style={{fontSize: "0.75rem"}}>(you)</span>}
            </span>
            {v === 0 && <span className="badge">pending</span>}
            {v === 1 && <span className="badge yes">voted YES</span>}
            {v === 2 && <span className="badge no">voted NO</span>}
        </div>
    );
}

function TxStatus({tx, err}: {tx: string | null; err: string | null}) {
    if (!tx && !err) return null;
    return (
        <div style={{marginTop: "0.7rem", fontSize: "0.85rem"}}>
            {tx && (
                <div className="muted">
                    tx:{" "}
                    <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer">
                        {tx.slice(0, 10)}…{tx.slice(-8)} ↗
                    </a>
                </div>
            )}
            {err && <div className="error-text" style={{marginTop: "0.3rem"}}>{err}</div>}
        </div>
    );
}

// ---------------------------------------------------------------------
// Footer — always-visible deployment info so confusion is impossible
// ---------------------------------------------------------------------

function BetModal({
    question,
    yesPct,
    noPct,
    pot,
    amount,
    setAmount,
    busy,
    onBet,
    onClose,
    tx,
    err,
}: {
    question: string;
    yesPct: number;
    noPct: number;
    pot: bigint;
    amount: string;
    setAmount: (v: string) => void;
    busy: boolean;
    onBet: (side: 0 | 1) => Promise<void>;
    onClose: () => void;
    tx: string | null;
    err: string | null;
}) {
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    return (
        <div
            className="modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="modal-card" role="dialog" aria-modal>
                <div className="modal-head">
                    <div>
                        <div className="modal-eyebrow">Place a bet</div>
                        <h3 className="modal-title">{question}</h3>
                    </div>
                    <button className="ghost modal-close" onClick={onClose} disabled={busy}>
                        ✕
                    </button>
                </div>

                <div className="mc-bar" style={{height: "44px", marginBottom: "0.7rem"}}>
                    {yesPct > 0 && (
                        <div className="mc-bar-yes" style={{width: `${yesPct}%`}}>
                            {yesPct >= 18 && <span className="mc-bar-pct">YES {yesPct.toFixed(0)}%</span>}
                        </div>
                    )}
                    {noPct > 0 && (
                        <div className="mc-bar-no" style={{width: `${noPct}%`}}>
                            {noPct >= 18 && <span className="mc-bar-pct">NO {noPct.toFixed(0)}%</span>}
                        </div>
                    )}
                </div>
                <div className="muted" style={{fontSize: "0.8rem", textAlign: "right", marginBottom: "1.2rem"}}>
                    {formatTaiko(pot)} mTAIKO in the pot
                </div>

                <label>Stake (mTAIKO)</label>
                <div className="cf-amount-row">
                    <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={busy}
                        autoFocus
                    />
                    <div className="cf-amount-quick">
                        {["5", "10", "25", "100"].map((v) => (
                            <button key={v} type="button" onClick={() => setAmount(v)} disabled={busy}>
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mc-bet-row" style={{marginTop: "1.2rem"}}>
                    <button className="yes" onClick={() => onBet(0)} disabled={busy}>
                        {busy ? "…" : `Bet ${amount} on YES`}
                    </button>
                    <button className="no" onClick={() => onBet(1)} disabled={busy}>
                        {busy ? "…" : `Bet ${amount} on NO`}
                    </button>
                </div>

                <TxStatus tx={tx} err={err} />
            </div>
        </div>
    );
}

function ActivityFeed() {
    const client = usePublicClient();
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [bump, setBump] = useState(0);

    useEffect(() => {
        function onRefresh() {
            setBump((n) => n + 1);
        }
        window.addEventListener("toldya:refresh", onRefresh);
        return () => window.removeEventListener("toldya:refresh", onRefresh);
    }, []);

    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        (async () => {
            try {
                const list = await fetchFeed(client as never);
                if (!cancelled) setEvents(list.slice(0, 12));
            } catch (e) {
                console.error("activity feed failed", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [client, bump]);

    if (loading) return null;
    if (events.length === 0) return null;

    return (
        <div style={{marginTop: "2.5rem"}}>
            <div className="section-h">
                <h2>Recent activity <span className="count">{events.length}</span></h2>
            </div>
            {events.map((e) => (
                <EventCard key={`${e.blockNumber.toString()}-${e.logIndex}`} event={e} />
            ))}
        </div>
    );
}

function DeploymentInfo() {
    return (
        <footer className="site-foot">
            <span>Built on {ALLOWED_CHAIN.name}</span>
            <span className="dot">·</span>
            <a href={`${EXPLORER}/address/${HUB_ADDRESS}`} target="_blank" rel="noreferrer">
                Contract
            </a>
            <span className="dot">·</span>
            <a href="https://github.com/Pigitaiko/toldya" target="_blank" rel="noreferrer">
                Source
            </a>
        </footer>
    );
}

function defaultDeadline(): string {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
