"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import {Header} from "@/components/Header";
import {HUB_ADDRESS, TOKEN_ADDRESS, erc20Abi, hubAbi} from "@/lib/contracts";
import {parseTaiko} from "@/lib/format";

type Side = 0 | 1; // 0 = YES, 1 = NO

function defaultDeadline(): string {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours(),
    )}:${pad(d.getMinutes())}`;
}

const QUICK_AMOUNTS = ["10", "50", "100"];

export default function CreatePage() {
    const router = useRouter();
    const {address, isConnected} = useAccount();
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();

    const [question, setQuestion] = useState("");
    const [criteria, setCriteria] = useState("");
    const [deadline, setDeadline] = useState(() => defaultDeadline());
    const [side, setSide] = useState<Side>(1);
    const [amount, setAmount] = useState("10");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!address || !client) return;
        setBusy(true);
        setError(null);
        try {
            const wei = parseTaiko(amount);
            const allowance = (await client.readContract({
                address: TOKEN_ADDRESS,
                abi: erc20Abi,
                functionName: "allowance",
                args: [address, HUB_ADDRESS],
            })) as bigint;
            if (allowance < wei) {
                const approveHash = await writeContractAsync({
                    address: TOKEN_ADDRESS,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [HUB_ADDRESS, wei],
                });
                await client.waitForTransactionReceipt({hash: approveHash});
            }

            const deadlineTs = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
            if (deadlineTs <= BigInt(Math.floor(Date.now() / 1000))) {
                throw new Error("Deadline must be in the future");
            }
            const hash = await writeContractAsync({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "createMarket",
                args: [question, criteria, deadlineTs, side, wei],
            });
            await client.waitForTransactionReceipt({hash});
            router.push("/");
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Transaction failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="container">
            <Header />
            <h1 style={{margin: "1rem 0 2rem", fontSize: "2rem", letterSpacing: "-0.03em"}}>
                Open a market
            </h1>
            <form onSubmit={submit} className="card">
                <label>What's the bet?</label>
                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Will Tom finish a beer in 30 seconds?"
                    required
                />

                <label>How will it be judged?</label>
                <textarea
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                    placeholder="Tom drinks a 0.5L beer; timer starts at first sip; YES if empty within 30s. Video posted to the group chat counts as evidence."
                    required
                />

                <label>Deadline</label>
                <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    required
                />

                <label>Your side</label>
                <div className="row" style={{gap: "0.6rem"}}>
                    <button
                        type="button"
                        className={side === 0 ? "yes" : "ghost"}
                        onClick={() => setSide(0)}
                        style={{flex: 1}}
                    >
                        YES
                    </button>
                    <button
                        type="button"
                        className={side === 1 ? "no" : "ghost"}
                        onClick={() => setSide(1)}
                        style={{flex: 1}}
                    >
                        NO
                    </button>
                </div>

                <label>Your stake</label>
                <div className="amount-row">
                    <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                    />
                </div>
                <div className="row" style={{gap: "0.4rem", marginTop: "0.5rem"}}>
                    {QUICK_AMOUNTS.map((a) => (
                        <button
                            key={a}
                            type="button"
                            className="sm ghost"
                            onClick={() => setAmount(a)}
                        >
                            {a}
                        </button>
                    ))}
                    <span className="muted faint" style={{marginLeft: "auto", fontSize: "0.8rem"}}>
                        1% protocol fee
                    </span>
                </div>

                {error && <p className="error-text">{error}</p>}

                <div style={{marginTop: "1.8rem"}}>
                    <button
                        type="submit"
                        className="primary lg"
                        disabled={!isConnected || busy}
                        style={{width: "100%"}}
                    >
                        {!isConnected
                            ? "Connect wallet first"
                            : busy
                              ? "Submitting…"
                              : `Open market with ${amount} TAIKO on ${side === 0 ? "YES" : "NO"}`}
                    </button>
                </div>
            </form>
        </div>
    );
}
