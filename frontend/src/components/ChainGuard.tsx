"use client";

import {type ReactNode} from "react";
import {useAccount, useChainId, useSwitchChain} from "wagmi";
import {ALLOWED_CHAIN} from "@/lib/wagmi";

export function ChainGuard({children}: {children: ReactNode}) {
    const {isConnected} = useAccount();
    const chainId = useChainId();
    const {switchChain, isPending, error} = useSwitchChain();

    // If not connected, no chain to be on — let the UI render. The user can
    // still browse the public feed; they just can't sign anything.
    const wrongChain = isConnected && chainId !== ALLOWED_CHAIN.id;

    return (
        <>
            {children}
            {wrongChain && (
                <div className="chain-overlay" role="dialog" aria-modal="true">
                    <div className="chain-banner">
                        <span className="badge no" style={{marginBottom: "0.8rem"}}>
                            wrong network
                        </span>
                        <h2 style={{margin: "0 0 0.5rem", fontSize: "1.5rem", letterSpacing: "-0.02em"}}>
                            Switch to {ALLOWED_CHAIN.name}
                        </h2>
                        <p className="muted" style={{margin: "0 0 1.4rem"}}>
                            Toldya only runs on <strong>{ALLOWED_CHAIN.name}</strong> (chain id{" "}
                            {ALLOWED_CHAIN.id}). Your wallet is currently on chain{" "}
                            <strong>{chainId}</strong>. No transactions can be sent until
                            you switch.
                        </p>
                        <button
                            className="primary lg"
                            disabled={isPending}
                            onClick={() => switchChain({chainId: ALLOWED_CHAIN.id})}
                            style={{width: "100%"}}
                        >
                            {isPending ? "Switching…" : `Switch to ${ALLOWED_CHAIN.name}`}
                        </button>
                        {error && <p className="error-text">{error.message}</p>}
                    </div>
                </div>
            )}
        </>
    );
}
