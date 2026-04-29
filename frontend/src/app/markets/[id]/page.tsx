"use client";

import {use, useEffect, useState} from "react";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import {Header} from "@/components/Header";
import {HUB_ADDRESS, STATUS_LABELS, TOKEN_ADDRESS, erc20Abi, hubAbi} from "@/lib/contracts";
import {deadlineLabel, formatTaiko, parseTaiko} from "@/lib/format";
import type {MarketView} from "@/components/MarketCard";

type PageProps = {params: Promise<{id: string}>};

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
    const past = Number(market.deadline) * 1000 < Date.now();
    const isOpen = market.status === 0;
    const needsResolution = market.status === 0 && past;
    const resolved = market.status === 2 || market.status === 3 || market.status === 4;

    return (
        <div className="container">
            <Header />
            <div className="card">
                <div className="row" style={{justifyContent: "space-between"}}>
                    <span className="badge">{STATUS_LABELS[market.status]}</span>
                    <span className="muted">
                        deadline {deadlineLabel(market.deadline)}
                    </span>
                </div>
                <h2 style={{margin: "0.4rem 0"}}>{market.question}</h2>
                <p className="muted" style={{whiteSpace: "pre-wrap"}}>{market.criteria}</p>
                <p className="muted">
                    creator {market.creator.slice(0, 6)}…{market.creator.slice(-4)} · pot{" "}
                    {formatTaiko(total)} TAIKO
                </p>

                <div className="row" style={{gap: "1.2rem", marginTop: "0.6rem"}}>
                    <span>
                        <span className="badge yes">YES</span>{" "}
                        <strong>{formatTaiko(market.yesPool)}</strong>
                    </span>
                    <span>
                        <span className="badge no">NO</span>{" "}
                        <strong>{formatTaiko(market.noPool)}</strong>
                    </span>
                </div>
            </div>

            {address && (yesStake > 0n || noStake > 0n) && (
                <div className="card">
                    <strong>Your position</strong>
                    <p className="muted">
                        YES {formatTaiko(yesStake)} · NO {formatTaiko(noStake)}
                    </p>
                    {resolved && (
                        <>
                            <p>
                                Claimable: <strong>{formatTaiko(previewClaim)} TAIKO</strong>
                            </p>
                            {previewClaim > 0n && (
                                <button onClick={doClaim} disabled={busy}>
                                    {busy ? "…" : "Claim"}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {isOpen && !past && (
                <div className="card">
                    <strong>Place a stake</strong>
                    <label>Amount (TAIKO)</label>
                    <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                    <div className="row" style={{marginTop: "0.8rem"}}>
                        <button onClick={() => doStake(0)} disabled={!isConnected || busy}>
                            Bet YES
                        </button>
                        <button
                            onClick={() => doStake(1)}
                            disabled={!isConnected || busy}
                            className="secondary"
                        >
                            Bet NO
                        </button>
                    </div>
                </div>
            )}

            {needsResolution && (
                <div className="card">
                    <p>Deadline reached. Trigger AI resolution.</p>
                    <button onClick={doTrigger} disabled={busy}>
                        {busy ? "…" : "Trigger resolution"}
                    </button>
                </div>
            )}

            {market.status === 1 && (
                <div className="card">
                    <p className="muted">
                        Resolution requested. Waiting for the AI oracle to post the verdict on-chain.
                    </p>
                </div>
            )}

            {error && (
                <div className="card" style={{borderColor: "#7f1d1d"}}>
                    <p style={{color: "#fca5a5"}}>{error}</p>
                </div>
            )}
        </div>
    );
}
