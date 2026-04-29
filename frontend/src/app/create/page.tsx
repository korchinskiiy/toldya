"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import {Header} from "@/components/Header";
import {HUB_ADDRESS, TOKEN_ADDRESS, erc20Abi, hubAbi} from "@/lib/contracts";
import {parseTaiko} from "@/lib/format";

type Side = 0 | 1; // 0 = YES, 1 = NO

export default function CreatePage() {
    const router = useRouter();
    const {address, isConnected} = useAccount();
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();

    const [question, setQuestion] = useState("");
    const [criteria, setCriteria] = useState("");
    const [hours, setHours] = useState("24");
    const [side, setSide] = useState<Side>(1); // default NO — friend bets are usually "I bet you can't"
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

            const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(hours) * 3600);
            const hash = await writeContractAsync({
                address: HUB_ADDRESS,
                abi: hubAbi,
                functionName: "createMarket",
                args: [question, criteria, deadline, side, wei],
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
            <h2>Open a new market</h2>
            <form onSubmit={submit} className="card">
                <label>Question (YES/NO)</label>
                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Will Tom finish a beer in 30s?"
                    required
                />

                <label>Resolution criteria</label>
                <textarea
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                    placeholder="Tom drinks a 0.5L beer; timer starts at first sip; YES if empty within 30s, video posted to the group chat as evidence."
                    required
                />

                <label>Resolves in (hours)</label>
                <input
                    type="number"
                    min="1"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    required
                />

                <label>Your side</label>
                <div className="row">
                    <button
                        type="button"
                        className={side === 0 ? "" : "secondary"}
                        onClick={() => setSide(0)}
                    >
                        YES
                    </button>
                    <button
                        type="button"
                        className={side === 1 ? "" : "secondary"}
                        onClick={() => setSide(1)}
                    >
                        NO
                    </button>
                </div>

                <label>Your stake (TAIKO)</label>
                <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                />
                <p className="muted">A 1% fee is taken on every stake to cover oracle costs.</p>

                {error && <p style={{color: "#fca5a5"}}>{error}</p>}

                <div style={{marginTop: "1rem"}}>
                    <button type="submit" disabled={!isConnected || busy}>
                        {!isConnected ? "Connect wallet" : busy ? "Submitting…" : "Open market"}
                    </button>
                </div>
            </form>
        </div>
    );
}
