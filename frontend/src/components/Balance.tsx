"use client";

import {useState} from "react";
import {useAccount, usePublicClient, useReadContract, useWriteContract} from "wagmi";
import {TOKEN_ADDRESS, erc20Abi} from "@/lib/contracts";
import {formatTaiko, parseTaiko} from "@/lib/format";
import {ALLOWED_CHAIN} from "@/lib/wagmi";

const FAUCET_AMOUNT = parseTaiko("1000");

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

export function Balance() {
    const {address, isConnected} = useAccount();
    const client = usePublicClient();
    const {writeContractAsync} = useWriteContract();
    const [busy, setBusy] = useState(false);

    const {data: balance, refetch} = useReadContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: Boolean(address)},
    });

    if (!isConnected) return null;

    async function mint() {
        if (!address || !client) return;
        setBusy(true);
        try {
            const hash = await writeContractAsync({
                chainId: ALLOWED_CHAIN.id,
                address: TOKEN_ADDRESS,
                abi: mintAbi,
                functionName: "mint",
                args: [address, FAUCET_AMOUNT],
            });
            await client.waitForTransactionReceipt({hash});
            await refetch();
        } catch (err) {
            console.error(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="row" style={{gap: "0.4rem"}}>
            <span className="muted" style={{fontVariantNumeric: "tabular-nums"}}>
                {balance !== undefined ? formatTaiko(balance as bigint) : "…"}
            </span>
            <button className="sm ghost" onClick={mint} disabled={busy} title="Faucet: mint 1000 mTAIKO">
                {busy ? "…" : "+"}
            </button>
        </div>
    );
}
