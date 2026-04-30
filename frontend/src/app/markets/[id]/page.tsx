"use client";

import {use, useEffect, useState} from "react";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import {Header} from "@/components/Header";
import {EvidenceList} from "@/components/EvidenceList";
import {EvidenceUpload} from "@/components/EvidenceUpload";
import {HUB_ADDRESS, TOKEN_ADDRESS, erc20Abi, hubAbi} from "@/lib/contracts";
import {deadlineLabel, formatTaiko, parseTaiko} from "@/lib/format";
import type {MarketView} from "@/components/MarketCard";

type PageProps = {params: Promise<{id: string}>};

function StatusBadge({status}: {status: number}) {
    if (status === 0) return <span className="badge live">live</span>;
    if (status === 1) return <span className="badge">resolving</span>;
    if (status === 2) return <span className="badge yes">YES won</span>;
    if (status === 3) return <span className="badge no">NO won</span>;
    if (status === 4) return <span className="badge">voided</span>;
    return <span className="badge">?</span>;
}

export default function MarketPage({params}: PageProps) {
    const {id: idStr} = use(params);
    const id = BigInt(idStr);
    const {address, isConnected} = useAccount();
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();

    const [market, setMarket] = useState<MarketView | null>(null);
    const [yesStake, setYesStake] = useState<bigint>(0n);
    const [noStake, setNoStake] = useState<bigint>(0n);
    const [previewClaim, setPreviewClaim] = useState<bigint>(0n);
    const [amount, setAmount] = useState("10");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [evidenceRefresh, setEvidenceRefresh] = useState(0);

    async function refresh() {
        if (!client) return;
        const m = (await client.readContract({
            address: HUB_ADDRESS,
            abi: hubAbi,
            functionName: "getMarket",
            args: [id],
        })) as MarketView;
        setMarket({...m, id});

        if (address) {
            const [ys, ns, pc] = await Promise.all([
                client.readContract({
                    address: HUB_ADDRESS,
                    abi: hubAbi,
                    functionName: "yesStake",
                    args: [id, address],
                }) as Promise<bigint>,
                client.readContract({
                    address: HUB_ADDRESS,
                    abi: hubAbi,
                    functionName: "noStake",
                    args: [id, address],
                }) as Promise<bigint>,
                client.readContract({
                    address: HUB_ADDRESS,
                    abi: hubAbi,
                    functionName: "previewClaim",
                    args: [id, address],
                }) as Promise<bigint>,
            ]);
            setYesStake(ys);
            setNoStake(ns);
            setPreviewClaim(pc);
        }
    }

    useEffect(() => {
        refresh().catch(console.error);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, address, idStr]);

    async function ensureAllowance(wei: bigint) {
        if (!address || !client) return;
        const allowance = (await client.readContract({
            address: TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, HUB_ADDRESS],
        })) as bigint;
        if (allowance >= wei) return;
        const hash = await writeContractAsync({
            address: TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [HUB_ADDRESS, wei],
        });
        await client.waitForTransactionReceipt({hash});
    }

    async function doStake(side: 0 | 1) {
        if (!client) return;
        setBusy(true);
        setError(null);
        try {
            const wei = parseTaiko(amount);
            await ensureAllowance(wei);
            const hash = await writeContractAsync({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "stake",
                args: [id, side, wei],
            });
            await client.waitForTransactionReceipt({hash});
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "stake failed");
        } finally {
            setBusy(false);
        }
    }

    async function doTrigger() {
        if (!client) return;
        setBusy(true);
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "triggerResolution",
                args: [id],
            });
            await client.waitForTransactionReceipt({hash});
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "trigger failed");
        } finally {
            setBusy(false);
        }
    }

    async function doClaim() {
        if (!client) return;
        setBusy(true);
        setError(null);
        try {
            const hash = await writeContractAsync({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "claim",
                args: [id],
            });
            await client.waitForTransactionReceipt({hash});
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "claim failed");
        } finally {
            setBusy(false);
        }
    }

    if (!market) {
        return (
            <div className="container">
                <Header />
                <p className="muted">Loading market…</p>
            </div>
        );
    }

    const total = market.yesPool + market.noPool;
    const yesPct = total === 0n ? 50 : Number((market.yesPool * 10000n) / total) / 100;
    const noPct = 100 - yesPct;
    const past = Number(market.deadline) * 1000 < Date.now();
    const isOpen = market.status === 0;
    const needsResolution = market.status === 0 && past;
    const resolved = market.status === 2 || market.status === 3 || market.status === 4;

    return (
        <div className="container">
            <Header />

            <div className="card">
                <div className="market-card-meta">
                    <StatusBadge status={market.status} />
                    <span className="muted">deadline {deadlineLabel(market.deadline)}</span>
                </div>
                <h1
                    style={{
                        margin: "0.4rem 0 1.2rem",
                        fontSize: "1.7rem",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.25,
                    }}
                >
                    {market.question}
                </h1>

                <div
                    className="ratio-bar"
                    style={{height: "44px", marginBottom: "1.2rem"}}
                >
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

                <div className="position-row">
                    <span className="label">Pot</span>
                    <strong style={{fontVariantNumeric: "tabular-nums"}}>
                        {formatTaiko(total)} TAIKO
                    </strong>
                </div>
                <div className="position-row">
                    <span className="label">YES pool</span>
                    <span style={{fontVariantNumeric: "tabular-nums"}}>
                        {formatTaiko(market.yesPool)}
                    </span>
                </div>
                <div className="position-row">
                    <span className="label">NO pool</span>
                    <span style={{fontVariantNumeric: "tabular-nums"}}>
                        {formatTaiko(market.noPool)}
                    </span>
                </div>
                <div className="position-row">
                    <span className="label">Creator</span>
                    <span className="muted" style={{fontFamily: "monospace"}}>
                        {market.creator.slice(0, 6)}…{market.creator.slice(-4)}
                    </span>
                </div>
            </div>

            <div className="card">
                <div className="muted" style={{marginBottom: "0.5rem", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.05em"}}>
                    Resolution criteria
                </div>
                <p style={{whiteSpace: "pre-wrap", margin: 0, color: "var(--text)"}}>
                    {market.criteria}
                </p>
            </div>

            <div className="card">
                <div className="muted" style={{marginBottom: "0.8rem", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.05em"}}>
                    Evidence
                </div>
                <EvidenceList marketId={id} refreshKey={evidenceRefresh} />
                {!resolved && (
                    <div style={{marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)"}}>
                        <div className="muted" style={{marginBottom: "0.6rem", fontSize: "0.82rem"}}>
                            Add proof — image, video, or audio
                        </div>
                        <EvidenceUpload
                            marketId={id}
                            onSubmitted={() => setEvidenceRefresh((n) => n + 1)}
                        />
                    </div>
                )}
            </div>

            {address && (yesStake > 0n || noStake > 0n) && (
                <div className="card">
                    <div className="muted" style={{marginBottom: "0.8rem", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.05em"}}>
                        Your position
                    </div>
                    <div className="position-row">
                        <span className="label">On YES</span>
                        <span style={{fontVariantNumeric: "tabular-nums"}}>
                            {formatTaiko(yesStake)} TAIKO
                        </span>
                    </div>
                    <div className="position-row">
                        <span className="label">On NO</span>
                        <span style={{fontVariantNumeric: "tabular-nums"}}>
                            {formatTaiko(noStake)} TAIKO
                        </span>
                    </div>
                    {resolved && (
                        <>
                            <div className="position-row">
                                <span className="label">Claimable</span>
                                <strong style={{fontVariantNumeric: "tabular-nums", color: previewClaim > 0n ? "var(--yes)" : "var(--text-faint)"}}>
                                    {formatTaiko(previewClaim)} TAIKO
                                </strong>
                            </div>
                            {previewClaim > 0n && (
                                <button
                                    onClick={doClaim}
                                    disabled={busy}
                                    className="primary lg"
                                    style={{width: "100%", marginTop: "1rem"}}
                                >
                                    {busy ? "…" : "Claim winnings"}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {isOpen && !past && (
                <div className="card">
                    <div className="muted" style={{marginBottom: "0.8rem", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.05em"}}>
                        Place a bet
                    </div>
                    <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Amount (TAIKO)"
                    />
                    <div className="row" style={{gap: "0.6rem", marginTop: "0.9rem"}}>
                        <button
                            onClick={() => doStake(0)}
                            disabled={!isConnected || busy}
                            className="yes lg"
                            style={{flex: 1}}
                        >
                            {busy ? "…" : `Bet YES`}
                        </button>
                        <button
                            onClick={() => doStake(1)}
                            disabled={!isConnected || busy}
                            className="no lg"
                            style={{flex: 1}}
                        >
                            {busy ? "…" : `Bet NO`}
                        </button>
                    </div>
                </div>
            )}

            {needsResolution && (
                <div className="card" style={{textAlign: "center"}}>
                    <p style={{margin: "0 0 1rem"}}>Deadline reached. Time to resolve.</p>
                    <button onClick={doTrigger} disabled={busy} className="primary">
                        {busy ? "…" : "Trigger AI resolution"}
                    </button>
                </div>
            )}

            {market.status === 1 && (
                <div className="card" style={{textAlign: "center"}}>
                    <p className="muted" style={{margin: 0}}>
                        Waiting for the AI agent to post the verdict on-chain…
                    </p>
                </div>
            )}

            {error && (
                <div className="card" style={{borderColor: "var(--no-border)"}}>
                    <p className="error-text" style={{margin: 0}}>{error}</p>
                </div>
            )}
        </div>
    );
}
