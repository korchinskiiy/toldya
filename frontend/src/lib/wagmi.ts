import {createConfig, http} from "wagmi";
import {defineChain} from "viem";
import {injected} from "wagmi/connectors";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 167009);
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.hekla.taiko.xyz";

export const taikoHekla = defineChain({
    id: chainId,
    name: "Taiko Hekla",
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [rpcUrl]}},
    blockExplorers: {default: {name: "Taikoscan", url: "https://hekla.taikoscan.network"}},
});

export const wagmiConfig = createConfig({
    chains: [taikoHekla],
    connectors: [injected()],
    transports: {[taikoHekla.id]: http(rpcUrl)},
    ssr: true,
});
