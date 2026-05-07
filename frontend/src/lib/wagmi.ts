import {cookieStorage, createStorage} from "wagmi";
import {defineChain} from "viem";
import {WagmiAdapter} from "@reown/appkit-adapter-wagmi";
import type {AppKitNetwork} from "@reown/appkit/networks";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.hoodi.taiko.xyz";

// Hard-locked to Taiko Hoodi testnet (167013). Hekla was sunset and replaced
// by Hoodi. Toldya is intentionally single-chain to prevent accidental mainnet
// transactions — do NOT add other chains here without updating ChainGuard.
export const taikoHoodi = defineChain({
    id: 167013,
    name: "Taiko Hoodi",
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [rpcUrl]}},
    blockExplorers: {default: {name: "Taikoscan", url: "https://hoodi.taikoscan.io"}},
    testnet: true,
});

export const ALLOWED_CHAIN = taikoHoodi;

// AppKit's network type extends viem's chain. Cast since defineChain returns
// the right shape but TS can't infer the AppKit-specific `chainNamespace`.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
    taikoHoodi as unknown as AppKitNetwork,
];

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

if (!projectId) {
    // The build can still succeed (so deploys aren't blocked while this is
    // being provisioned), but the connect modal will be inert. Log loudly so
    // the cause is obvious in the browser console.
    if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn(
            "[toldya] NEXT_PUBLIC_REOWN_PROJECT_ID is not set. Sign in is " +
                "disabled until you create a project at https://cloud.reown.com " +
                "and add the Project ID to your environment.",
        );
    }
}

export const wagmiAdapter = new WagmiAdapter({
    storage: createStorage({storage: cookieStorage}),
    ssr: true,
    networks,
    projectId,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
