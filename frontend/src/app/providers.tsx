"use client";

import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState, type ReactNode} from "react";
import {createAppKit} from "@reown/appkit/react";
import {ALLOWED_CHAIN, networks, projectId, wagmiAdapter, wagmiConfig} from "@/lib/wagmi";

const metadata = {
    name: "toldya",
    description:
        "P2P prediction markets for everyday bets between friends. Open a YES/NO " +
        "market, friends stake TAIKO, an AI agent settles after the deadline.",
    url:
        typeof window !== "undefined"
            ? window.location.origin
            : "https://toldya-nine.vercel.app",
    icons: ["https://toldya-nine.vercel.app/icon.svg"],
};

// Init AppKit once at module load. createAppKit registers the modal globally;
// any subsequent calls to useAppKit() pick it up via the wagmi context.
createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks,
    defaultNetwork: ALLOWED_CHAIN as never,
    metadata,
    features: {
        email: true,
        socials: ["google"],
        emailShowWallets: true,
        analytics: false,
    },
    themeMode: "light",
    themeVariables: {
        "--w3m-accent": "#d97706",
        "--w3m-color-mix": "#fafaf7",
        "--w3m-color-mix-strength": 8,
        "--w3m-border-radius-master": "3px",
    },
});

export function Providers({children}: {children: ReactNode}) {
    const [queryClient] = useState(() => new QueryClient());
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WagmiProvider>
    );
}
