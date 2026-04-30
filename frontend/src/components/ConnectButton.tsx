"use client";

import {useAccount, useConnect, useDisconnect} from "wagmi";

export function ConnectButton() {
    const {address, isConnected} = useAccount();
    const {connect, connectors, isPending} = useConnect();
    const {disconnect} = useDisconnect();

    if (isConnected && address) {
        return (
            <button onClick={() => disconnect()} title="Disconnect wallet">
                {address.slice(0, 6)}…{address.slice(-4)}
            </button>
        );
    }

    const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
    return (
        <button
            className="primary"
            onClick={() => injected && connect({connector: injected})}
            disabled={isPending}
        >
            {isPending ? "Connecting…" : "Connect"}
        </button>
    );
}
