import {createConfig, http} from "wagmi";
import {defineChain} from "viem";
import {injected} from "wagmi/connectors";

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

export const wagmiConfig = createConfig({
    chains: [taikoHoodi],
    connectors: [injected()],
    transports: {[taikoHoodi.id]: http(rpcUrl)},
    ssr: true,
});
